export function getPrepareSummary(result) {
  if (!result) {
    return { needsInput: 0, requirements: 0, spoken: 0 }
  }

  return {
    needsInput: result.segments.filter(
      (segment) => segment.type === 'UNKNOWN' && !segment.ignored,
    ).length,
    requirements: result.requirements.filter((item) => !item.ignored).length,
    spoken: result.segments.filter(
      (segment) => segment.type === 'SPOKEN' && !segment.ignored,
    ).length,
  }
}

export function getPrepareClarifications(result) {
  if (!result) return []
  const unresolvedIds = new Set(
    result.segments
      .filter((segment) => segment.type === 'UNKNOWN' && !segment.ignored)
      .map((segment) => segment.id),
  )

  return result.clarifications.filter(
    (item) => item.segmentId && unresolvedIds.has(item.segmentId),
  )
}
