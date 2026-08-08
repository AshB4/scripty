export const EMPTY_PENDING_MATCH = { count: 0, index: null }

export function getSameEventCarryoverWords(eventWords, nextBlockWords) {
  if (!eventWords.length || !nextBlockWords.length) return []

  const earliestStart = Math.max(0, eventWords.length - nextBlockWords.length)
  let longestCarryover = []

  for (let start = earliestStart; start < eventWords.length; start += 1) {
    const candidate = eventWords.slice(start)
    const isNextBlockPrefix = candidate.every(
      (word, index) => word === nextBlockWords[index],
    )

    if (isNextBlockPrefix && candidate.length > longestCarryover.length) {
      longestCarryover = candidate
    }
  }

  return longestCarryover
}

export function createCleanBlockTrackingState({
  eventWords = [],
  nextBlockWords = [],
} = {}) {
  return {
    carryoverWords: getSameEventCarryoverWords(eventWords, nextBlockWords),
    lowConfidenceCount: 0,
    pendingMatch: { ...EMPTY_PENDING_MATCH },
  }
}

export function isBlockProgressComplete(matchedWordCount, totalWordCount) {
  return totalWordCount > 0 && matchedWordCount >= totalWordCount
}
