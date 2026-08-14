export const PREPARE_SEGMENT_TYPES = Object.freeze([
  'SPOKEN',
  'PRODUCTION_CUE',
  'B_ROLL',
  'IMAGE_GRAPHIC',
  'SCREEN_RECORDING',
  'AI_VIDEO',
  'CAMERA_CUT',
  'PROP',
  'CREATOR_REMINDER',
  'UNKNOWN',
])

export const PREPARE_REQUIREMENT_STATUSES = Object.freeze([
  'confirmed',
  'tentative',
])

const segmentTypes = new Set(PREPARE_SEGMENT_TYPES)
const requirementTypes = new Set(
  PREPARE_SEGMENT_TYPES.filter(
    (type) => type !== 'SPOKEN' && type !== 'UNKNOWN',
  ),
)
const requirementStatuses = new Set(PREPARE_REQUIREMENT_STATUSES)

export function isPrepareRequirementType(type) {
  return requirementTypes.has(type)
}

export function isPrepareRequirementStatus(status) {
  return requirementStatuses.has(status)
}

export class PrepareValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PrepareValidationError'
  }
}

function requireObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PrepareValidationError(`${path} must be an object.`)
  }
  return value
}

function requireArray(value, path) {
  if (!Array.isArray(value)) {
    throw new PrepareValidationError(`${path} must be an array.`)
  }
  return value
}

function requireString(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PrepareValidationError(`${path} must be a non-empty string.`)
  }
  return value
}

function requireNullableString(value, path) {
  if (value == null) return null
  return requireString(value, path)
}

function optionalBoolean(value, path) {
  if (value == null) return false
  if (typeof value !== 'boolean') {
    throw new PrepareValidationError(`${path} must be a boolean.`)
  }
  return value
}

function optionalStatus(value, path) {
  if (value == null) return null
  const status = requireString(value, path)
  if (!requirementStatuses.has(status)) {
    throw new PrepareValidationError(`${path} is invalid.`)
  }
  return status
}

function validateUniqueIds(items, path) {
  const ids = new Set()
  items.forEach((item, index) => {
    if (ids.has(item.id)) {
      throw new PrepareValidationError(`${path}[${index}].id must be unique.`)
    }
    ids.add(item.id)
  })
}

function validateSegment(value, index) {
  const segment = requireObject(value, `segments[${index}]`)
  const type = requireString(segment.type, `segments[${index}].type`)

  if (!segmentTypes.has(type)) {
    throw new PrepareValidationError(`segments[${index}].type is invalid.`)
  }
  if (typeof segment.needsClarification !== 'boolean') {
    throw new PrepareValidationError(
      `segments[${index}].needsClarification must be a boolean.`,
    )
  }

  const clarificationReason = requireNullableString(
    segment.clarificationReason,
    `segments[${index}].clarificationReason`,
  )
  if (segment.needsClarification && !clarificationReason) {
    throw new PrepareValidationError(
      `segments[${index}].clarificationReason is required.`,
    )
  }

  return {
    id: requireString(segment.id, `segments[${index}].id`),
    originalText: requireString(
      segment.originalText,
      `segments[${index}].originalText`,
    ),
    type,
    status: optionalStatus(segment.status, `segments[${index}].status`),
    speaker: requireNullableString(
      segment.speaker,
      `segments[${index}].speaker`,
    ),
    needsClarification: segment.needsClarification,
    clarificationReason,
    ignored: optionalBoolean(segment.ignored, `segments[${index}].ignored`),
  }
}

function validateRequirement(value, index) {
  const requirement = requireObject(value, `requirements[${index}]`)
  const type = requireString(requirement.type, `requirements[${index}].type`)
  const status = requireString(
    requirement.status,
    `requirements[${index}].status`,
  )

  if (!requirementTypes.has(type)) {
    throw new PrepareValidationError(`requirements[${index}].type is invalid.`)
  }
  if (!requirementStatuses.has(status)) {
    throw new PrepareValidationError(
      `requirements[${index}].status is invalid.`,
    )
  }

  return {
    id: requireString(requirement.id, `requirements[${index}].id`),
    type,
    description: requireString(
      requirement.description,
      `requirements[${index}].description`,
    ),
    sourceText: requireString(
      requirement.sourceText,
      `requirements[${index}].sourceText`,
    ),
    status,
    segmentId: requireNullableString(
      requirement.segmentId,
      `requirements[${index}].segmentId`,
    ),
    ignored: optionalBoolean(
      requirement.ignored,
      `requirements[${index}].ignored`,
    ),
  }
}

function validateClarification(value, index) {
  const clarification = requireObject(value, `clarifications[${index}]`)
  return {
    id: requireString(clarification.id, `clarifications[${index}].id`),
    sourceText: requireString(
      clarification.sourceText,
      `clarifications[${index}].sourceText`,
    ),
    reason: requireString(
      clarification.reason,
      `clarifications[${index}].reason`,
    ),
    segmentId: requireNullableString(
      clarification.segmentId,
      `clarifications[${index}].segmentId`,
    ),
  }
}

export function validatePrepareResult(value) {
  const result = requireObject(value, 'Prepare result')
  const segments = requireArray(result.segments, 'segments').map(validateSegment)
  const requirements = requireArray(result.requirements, 'requirements').map(
    validateRequirement,
  )
  const clarifications = requireArray(
    result.clarifications,
    'clarifications',
  ).map(validateClarification)

  validateUniqueIds(segments, 'segments')
  validateUniqueIds(requirements, 'requirements')
  validateUniqueIds(clarifications, 'clarifications')

  return { segments, requirements, clarifications }
}

export function validateFinalizedPrepareResult(value) {
  const result = validatePrepareResult(value)
  const unresolvedSegments = result.segments.filter(
    (segment) => segment.type === 'UNKNOWN' && !segment.ignored,
  )

  if (unresolvedSegments.length) {
    throw new PrepareValidationError(
      'Prepare result contains unresolved clarifications.',
    )
  }

  return result
}
