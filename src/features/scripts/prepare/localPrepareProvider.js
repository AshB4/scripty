import {
  isPrepareRequirementStatus,
  isPrepareSegmentType,
  validatePrepareResult,
} from './prepareContract.js'

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

function makeSegment(parserSegment, { status, type }) {
  const originalText = parserSegment.text
  const needsClarification = type === 'UNKNOWN'
  return {
    id: parserSegment.id,
    originalText,
    type,
    status:
      type !== 'SPOKEN' && type !== 'UNKNOWN'
        ? status ?? (tentativePattern.test(originalText)
          ? 'tentative'
          : 'confirmed')
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

function validateClassifications(parserSegments, classifications) {
  if (!Array.isArray(classifications) || classifications.length !== parserSegments.length) {
    throw new Error('Prepare classifications must cover every parser segment.')
  }

  const parserSegmentIds = new Set(parserSegments.map((segment) => segment.id))
  const classificationIds = new Set()
  classifications.forEach((classification) => {
    if (
      !classification ||
      !parserSegmentIds.has(classification.id) ||
      !isPrepareSegmentType(classification.type)
    ) {
      throw new Error('Prepare classifications must use parser segment IDs.')
    }
    if (classificationIds.has(classification.id)) {
      throw new Error('Prepare classifications cannot duplicate parser segment IDs.')
    }
    if (
      (classification.type === 'SPOKEN' || classification.type === 'UNKNOWN') &&
      classification.status != null
    ) {
      throw new Error('Prepare classifications have an invalid status.')
    }
    if (
      classification.type !== 'SPOKEN' &&
      classification.type !== 'UNKNOWN' &&
      classification.status != null &&
      !isPrepareRequirementStatus(classification.status)
    ) {
      throw new Error('Prepare classifications have an invalid status.')
    }
    classificationIds.add(classification.id)
  })

  return new Map(classifications.map((classification) => [classification.id, classification]))
}

export function buildPrepareResultFromClassifications({
  parserSegments,
  script,
}, classifications) {
  if (!String(script ?? '').trim()) {
    throw new Error('A script is required before Prepare can run.')
  }
  if (!Array.isArray(parserSegments)) {
    throw new Error('Parser segments are required before Prepare can run.')
  }

  const classificationsById = validateClassifications(parserSegments, classifications)
  const segments = parserSegments.map((parserSegment) =>
    makeSegment(parserSegment, classificationsById.get(parserSegment.id)),
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

export function buildLocalPrepareResult(context) {
  return buildPrepareResultFromClassifications(
    context,
    context.parserSegments.map((parserSegment) => ({
      id: parserSegment.id,
      type: classifyLine(parserSegment.text.trim()),
    })),
  )
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
