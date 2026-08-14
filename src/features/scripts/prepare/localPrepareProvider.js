import { validatePrepareResult } from './prepareContract.js'

const tentativePattern = /\b(?:maybe|possibly|perhaps|idk)\b|\?{2,}/i
const standaloneSpeakerPattern = /^([A-Za-z][A-Za-z0-9 _'-]{0,30}):\s*$/
const inlineSpeakerPattern = /^([A-Za-z][A-Za-z0-9 _'-]{0,30}):\s+(.+)$/

function isLikelySpeakerLabel(value) {
  const words = value.trim().split(/\s+/)
  return (
    words.length <= 2 &&
    (value === value.toUpperCase() || (words.length === 1 && value.length <= 4))
  )
}

function classifyLine(text) {
  if (/^\[.*\bB[ -]?ROLL\b.*\]$/i.test(text) || /\bB[ -]?ROLL\b/i.test(text)) {
    return 'B_ROLL'
  }
  if (/^\[.*\b(?:CUT|CAMERA)\b.*\]$/i.test(text) || /^cut\b/i.test(text)) {
    return 'CAMERA_CUT'
  }
  if (
    /\bAI\s+(?:video|footage)\b/i.test(text) ||
    /\b(?:maybe|possibly|perhaps)\b[\s\S]*\bAI\b/i.test(text)
  ) {
    return 'AI_VIDEO'
  }
  if (/\b(?:screen\s*record|record (?:the )?screen)\b/i.test(text)) {
    return 'SCREEN_RECORDING'
  }
  if (/\b(?:show|insert|display)\b.*\b(?:image|photo|graphic|screenshot)\b/i.test(text)) {
    return 'IMAGE_GRAPHIC'
  }
  if (/\b(?:grab|bring|hold|use)\b.*\b(?:phone|book|prop|product|device)\b/i.test(text)) {
    return 'PROP'
  }
  if (/\b(?:remind me|don't say|do not say|move it later)\b/i.test(text)) {
    return 'CREATOR_REMINDER'
  }
  if (/\b(?:zoom|pan|tilt|close[- ]?up|wide shot)\b/i.test(text)) {
    return 'PRODUCTION_CUE'
  }
  if (/^(?:then\s+(?:explain|ending)|talk about)\b/i.test(text)) {
    return 'UNKNOWN'
  }
  if (/^\[[\s\S]+\]$/.test(text)) return 'PRODUCTION_CUE'
  return 'SPOKEN'
}

function makeSegment(id, originalText, type, speaker = null) {
  const tentative = tentativePattern.test(originalText)
  const needsClarification = type === 'UNKNOWN'
  return {
    id: `seg-${id}`,
    originalText,
    type,
    status:
      type !== 'SPOKEN' && type !== 'UNKNOWN'
        ? tentative
          ? 'tentative'
          : 'confirmed'
        : null,
    speaker,
    needsClarification,
    clarificationReason: needsClarification
      ? 'This instruction is ambiguous and needs creator clarification.'
      : null,
    ignored: false,
  }
}

export function buildLocalPrepareResult(script) {
  const source = String(script ?? '')
  const lines = source.split(/\r?\n/)
  const segments = []
  let currentSpeaker = null
  let pendingSpeakerCue = null

  lines.forEach((rawLine) => {
    if (!rawLine.trim()) return

    const text = rawLine.trim()
    const standaloneSpeaker = text.match(standaloneSpeakerPattern)
    if (standaloneSpeaker && isLikelySpeakerLabel(standaloneSpeaker[1])) {
      currentSpeaker = standaloneSpeaker[1]
      pendingSpeakerCue = rawLine
      return
    }

    const inlineSpeaker = text.match(inlineSpeakerPattern)
    if (inlineSpeaker && isLikelySpeakerLabel(inlineSpeaker[1])) {
      currentSpeaker = inlineSpeaker[1]
      pendingSpeakerCue = null
      segments.push(
        makeSegment(
          segments.length + 1,
          rawLine,
          'SPOKEN',
          currentSpeaker,
        ),
      )
      return
    }

    const type = classifyLine(text)
    const originalText =
      pendingSpeakerCue && type === 'SPOKEN'
        ? `${pendingSpeakerCue}\n${rawLine}`
        : rawLine
    segments.push(
      makeSegment(
        segments.length + 1,
        originalText,
        type,
        type === 'SPOKEN' ? currentSpeaker : null,
      ),
    )
    pendingSpeakerCue = null
  })

  if (pendingSpeakerCue) {
    segments.push(
      makeSegment(segments.length + 1, pendingSpeakerCue, 'UNKNOWN'),
    )
  }

  const requirements = segments
    .filter(
      (segment) =>
        segment.type !== 'SPOKEN' &&
        segment.type !== 'UNKNOWN' &&
        segment.type !== 'CREATOR_REMINDER',
    )
    .map((segment, index) => ({
      id: `req-${index + 1}`,
      type: segment.type,
      description: segment.originalText,
      sourceText: segment.originalText,
      status: segment.status,
      segmentId: segment.id,
      ignored: false,
    }))

  const clarifications = segments
    .filter((segment) => segment.type === 'UNKNOWN' && !segment.ignored)
    .map((segment, index) => ({
      id: `clar-${index + 1}`,
      sourceText: segment.originalText,
      reason: segment.clarificationReason,
      segmentId: segment.id,
    }))

  return validatePrepareResult({ segments, requirements, clarifications })
}

export function createLocalPrepareProvider({ delayMs = 280 } = {}) {
  return {
    async prepare(script) {
      if (!String(script ?? '').trim()) {
        throw new Error('A script is required before Prepare can run.')
      }
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs))
      }
      return buildLocalPrepareResult(script)
    },
  }
}

export const localPrepareProvider = createLocalPrepareProvider()
