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

function hasSameWords(left = [], right = []) {
  return (
    left.length === right.length &&
    left.every((word, index) => word === right[index])
  )
}

function isLaterRecognitionEvidence(evidence, completedOccurrence) {
  if (!evidence || !completedOccurrence) return false
  if (evidence.sessionId !== completedOccurrence.sessionId) {
    return evidence.sessionId > completedOccurrence.sessionId
  }

  return evidence.resultIndex > completedOccurrence.resultIndex
}

function isSameRecognitionBoundary(evidence, completedOccurrence) {
  return (
    evidence?.sessionId === completedOccurrence?.sessionId &&
    evidence?.resultIndex === completedOccurrence?.resultIndex
  )
}

function isCompleteFinalOccurrence(evidence, blockWords) {
  if (
    !evidence?.isFinal ||
    !blockWords?.length ||
    evidence.wordCount !== blockWords.length ||
    !evidence.words?.length
  ) {
    return false
  }

  return hasSameWords(
    evidence.words,
    blockWords.slice(-evidence.words.length),
  )
}

export function updateCompletedBlockOccurrence({
  blockIndex,
  completedOccurrence,
  evidence,
  justCompletedBlock,
}) {
  if (!evidence) return completedOccurrence

  if (justCompletedBlock) {
    return {
      blockIndex,
      isFinal: evidence.isFinal,
      resultIndex: evidence.resultIndex,
      sessionId: evidence.sessionId,
    }
  }

  if (
    completedOccurrence?.blockIndex === blockIndex &&
    !completedOccurrence.isFinal &&
    evidence.isFinal &&
    isSameRecognitionBoundary(evidence, completedOccurrence)
  ) {
    return {
      ...completedOccurrence,
      isFinal: true,
    }
  }

  return completedOccurrence
}

export function resolveIdenticalBlockOccurrence({
  blocks,
  completedOccurrence,
  currentIndex,
  evidence,
  match,
  matchedWordCount,
}) {
  const currentBlock = blocks[currentIndex]
  const nextBlock = blocks[currentIndex + 1]

  if (
    !match?.isConfident ||
    !currentBlock ||
    matchedWordCount < currentBlock.words.length ||
    completedOccurrence?.blockIndex !== currentIndex ||
    !isLaterRecognitionEvidence(evidence, completedOccurrence)
  ) {
    return match
  }

  const previousBlock = blocks[currentIndex - 1]
  if (
    match.index === currentIndex - 1 &&
    hasSameWords(previousBlock?.words, currentBlock.words)
  ) {
    return {
      ...match,
      block: currentBlock,
      distance: 0,
      index: currentIndex,
    }
  }

  if (
    match.index !== currentIndex ||
    !nextBlock ||
    !hasSameWords(currentBlock.words, nextBlock.words) ||
    !isCompleteFinalOccurrence(evidence, currentBlock.words)
  ) {
    return match
  }

  return {
    ...match,
    block: nextBlock,
    distance: 1,
    index: currentIndex + 1,
  }
}
