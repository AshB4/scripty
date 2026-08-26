import { validatePrepareResult } from './prepareContract.js'

const tentativePattern = /\b(?:maybe|possibly|perhaps|idk)\b|\?{2,}/i
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

function makeSegment(parserSegment, type) {
  const originalText = parserSegment.text
  const tentative = tentativePattern.test(originalText)
  const needsClarification = type === 'UNKNOWN'
  return {
    id: parserSegment.id,
    originalText,
    type,
    status:
      type !== 'SPOKEN' && type !== 'UNKNOWN'
        ? tentative
          ? 'tentative'
          : 'confirmed'
        : null,
    speaker: type === 'SPOKEN'
      ? parserSegment.speakerLabel ?? parserSegment.speaker ?? null
      : null,
    needsClarification,
    clarificationReason: needsClarification
      ? 'This instruction is ambiguous and needs creator clarification.'
      : null,
    ignored: false,
  }
}

export function buildLocalPrepareResult({ parserSegments, script }) {
  if (!String(script ?? '').trim()) {
    throw new Error('A script is required before Prepare can run.')
  }
  if (!Array.isArray(parserSegments)) {
    throw new Error('Parser segments are required before Prepare can run.')
  }

  const segments = parserSegments.map((parserSegment) =>
    makeSegment(parserSegment, classifyLine(parserSegment.text.trim())),
  )

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
    async prepare(context) {
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs))
      }
      return buildLocalPrepareResult(context)
    },
  }
}

export const localPrepareProvider = createLocalPrepareProvider()
