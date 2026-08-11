export const MAX_VOICE_FOLLOW_TIMINGS = 20

function durationBetween(start, end) {
  if (typeof start !== 'number' || typeof end !== 'number') return null
  return Number((end - start).toFixed(2))
}

export function mergeVoiceFollowTiming(history, update, enabled = true) {
  if (!enabled || !update?.id) return history

  const existingIndex = history.findIndex((timing) => timing.id === update.id)
  const existing = existingIndex >= 0 ? history[existingIndex] : null
  const merged = { ...existing, ...update }
  const timing = {
    ...merged,
    commitToScrollRequestMs: durationBetween(
      merged.commitAt,
      merged.scrollRequestedAt,
    ),
    decisionToCommitMs: durationBetween(merged.decisionAt, merged.commitAt),
    decisionToScrollRequestMs: durationBetween(
      merged.decisionAt,
      merged.scrollRequestedAt,
    ),
    recognitionToCommitMs: durationBetween(
      merged.recognitionReceivedAt,
      merged.commitAt,
    ),
    recognitionToDecisionMs: durationBetween(
      merged.recognitionReceivedAt,
      merged.decisionAt,
    ),
    recognitionToScrollRequestMs: durationBetween(
      merged.recognitionReceivedAt,
      merged.scrollRequestedAt,
    ),
    recognitionToScrollSettledMs: durationBetween(
      merged.recognitionReceivedAt,
      merged.scrollSettledAt,
    ),
    scrollRequestToSettledMs: durationBetween(
      merged.scrollRequestedAt,
      merged.scrollSettledAt,
    ),
  }

  const next = existingIndex >= 0
    ? history.map((entry, index) => (index === existingIndex ? timing : entry))
    : [...history, timing]

  return next.slice(-MAX_VOICE_FOLLOW_TIMINGS)
}
