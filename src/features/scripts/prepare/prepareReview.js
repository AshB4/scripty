import {
  isPrepareRequirementStatus,
  isPrepareRequirementType,
  validateFinalizedPrepareResult,
  validatePrepareResult,
} from './prepareContract.js'

const DEFAULT_CLARIFICATION_REASON =
  'This item needs a creator-selected classification.'

function getLinkedSegmentId(item, result) {
  if (item.segmentId) return item.segmentId
  return (
    result.segments.find(
      (segment) => segment.originalText === (item.sourceText ?? item.description),
    )?.id ?? null
  )
}

function nextRequirementId(requirements) {
  let suffix = requirements.length + 1
  while (requirements.some((requirement) => requirement.id === `req-${suffix}`)) {
    suffix += 1
  }
  return `req-${suffix}`
}

function nextClarificationId(clarifications) {
  let suffix = clarifications.length + 1
  while (
    clarifications.some(
      (clarification) => clarification.id === `clar-${suffix}`,
    )
  ) {
    suffix += 1
  }
  return `clar-${suffix}`
}

function removeLinkedClarifications(clarifications, segment) {
  return clarifications.filter(
    (clarification) =>
      clarification.segmentId !== segment.id &&
      clarification.sourceText !== segment.originalText,
  )
}

function removeLinkedRequirements(requirements, segment) {
  return requirements.filter(
    (requirement) =>
      requirement.segmentId !== segment.id &&
      requirement.sourceText !== segment.originalText,
  )
}

function upsertLinkedRequirement(requirements, segment, status) {
  const existingIndex = requirements.findIndex(
    (requirement) =>
      requirement.segmentId === segment.id ||
      requirement.sourceText === segment.originalText,
  )
  const requirement = {
    id:
      existingIndex >= 0
        ? requirements[existingIndex].id
        : nextRequirementId(requirements),
    type: segment.type,
    description:
      existingIndex >= 0
        ? requirements[existingIndex].description
        : segment.originalText,
    sourceText: segment.originalText,
    status,
    segmentId: segment.id,
    ignored: false,
  }

  if (existingIndex < 0) return [...requirements, requirement]
  return requirements.map((item, index) =>
    index === existingIndex ? requirement : item,
  )
}

export function getUnresolvedPrepareItems(result) {
  if (!result) return []
  return result.segments.filter(
    (segment) => segment.type === 'UNKNOWN' && !segment.ignored,
  )
}

export function normalizePrepareReviewResult(result) {
  if (!result) return null
  const current = validatePrepareResult(result)
  const unresolved = new Map(
    current.segments
      .filter((segment) => segment.type === 'UNKNOWN' && !segment.ignored)
      .map((segment) => [segment.id, segment]),
  )
  const clarifications = current.clarifications.filter((clarification) => {
    const segmentId = getLinkedSegmentId(clarification, current)
    return Boolean(segmentId && unresolved.has(segmentId))
  })

  unresolved.forEach((segment, segmentId) => {
    if (
      clarifications.some(
        (clarification) =>
          clarification.segmentId === segmentId ||
          clarification.sourceText === segment.originalText,
      )
    ) {
      return
    }
    clarifications.push({
      id: nextClarificationId(clarifications),
      sourceText: segment.originalText,
      reason: segment.clarificationReason ?? DEFAULT_CLARIFICATION_REASON,
      segmentId,
    })
  })

  return validatePrepareResult({
    ...current,
    clarifications,
    segments: current.segments.map((segment) => ({
      ...segment,
      needsClarification: segment.type === 'UNKNOWN' && !segment.ignored,
      clarificationReason:
        segment.type === 'UNKNOWN' && !segment.ignored
          ? segment.clarificationReason ?? DEFAULT_CLARIFICATION_REASON
          : null,
    })),
  })
}

export function canFinalizePrepare(result) {
  return Boolean(result) && getUnresolvedPrepareItems(result).length === 0
}

export function updatePrepareSegment(
  result,
  segmentId,
  { ignored = false, status = null, type },
) {
  const current = validatePrepareResult(result)
  const existing = current.segments.find((segment) => segment.id === segmentId)
  if (!existing) return current

  const nextType = type ?? existing.type
  const isRequirement = isPrepareRequirementType(nextType)
  const nextStatus = isRequirement
    ? isPrepareRequirementStatus(status)
      ? status
      : existing.status ?? 'confirmed'
    : null
  const nextSegment = {
    ...existing,
    type: nextType,
    status: nextStatus,
    ignored,
    needsClarification: nextType === 'UNKNOWN' && !ignored,
    clarificationReason:
      nextType === 'UNKNOWN' && !ignored
        ? existing.clarificationReason ?? DEFAULT_CLARIFICATION_REASON
        : null,
  }
  let requirements = removeLinkedRequirements(current.requirements, existing)
  let clarifications = removeLinkedClarifications(
    current.clarifications,
    existing,
  )

  if (isRequirement && !ignored) {
    requirements = upsertLinkedRequirement(
      requirements,
      nextSegment,
      nextStatus,
    )
  }
  if (nextType === 'UNKNOWN' && !ignored) {
    clarifications = [
      ...clarifications,
      {
        id: nextClarificationId(clarifications),
        sourceText: existing.originalText,
        reason: nextSegment.clarificationReason,
        segmentId: existing.id,
      },
    ]
  }

  return validatePrepareResult({
    ...current,
    segments: current.segments.map((segment) =>
      segment.id === segmentId ? nextSegment : segment,
    ),
    requirements,
    clarifications,
  })
}

export function updatePrepareRequirement(
  result,
  requirementId,
  { ignored, status, type },
) {
  const current = validatePrepareResult(result)
  const requirement = current.requirements.find(
    (item) => item.id === requirementId,
  )
  if (!requirement) return current

  const nextType = type ?? requirement.type
  if (!isPrepareRequirementType(nextType)) return current
  const nextStatus = isPrepareRequirementStatus(status)
    ? status
    : requirement.status
  const segmentId = getLinkedSegmentId(requirement, current)
  const segments = current.segments.map((segment) =>
    segment.id === segmentId
      ? {
          ...segment,
          ignored: ignored ?? segment.ignored,
          type: nextType,
          status: nextStatus,
          needsClarification: false,
          clarificationReason: null,
        }
      : segment,
  )

  return validatePrepareResult({
    ...current,
    segments,
    requirements: current.requirements.map((item) =>
      item.id === requirementId
        ? {
            ...item,
            type: nextType,
            status: nextStatus,
            ignored: ignored ?? item.ignored,
            segmentId,
          }
        : item,
    ),
    clarifications: current.clarifications.filter(
      (item) => item.segmentId !== segmentId,
    ),
  })
}

export function resolvePrepareClarification(
  result,
  clarificationId,
  { ignored = false, status = 'confirmed', type },
) {
  const current = validatePrepareResult(result)
  const clarification = current.clarifications.find(
    (item) => item.id === clarificationId,
  )
  if (!clarification) return current
  const segmentId = getLinkedSegmentId(clarification, current)
  if (!segmentId) return current
  return updatePrepareSegment(current, segmentId, {
    ignored,
    status,
    type: ignored ? 'UNKNOWN' : type,
  })
}

export function finalizePrepareResult(result) {
  const normalized = normalizePrepareReviewResult(result)
  return validateFinalizedPrepareResult({
    ...normalized,
    clarifications: [],
  })
}
