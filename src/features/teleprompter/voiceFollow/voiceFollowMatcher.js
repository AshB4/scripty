import { isSpeakableBlock } from '../../scripts/scriptParser.js';

export const ROLLING_TRANSCRIPT_WORDS = 18
export const VOICE_MATCH_THRESHOLDS = {
  current: 0.46,
  next: 0.46,
  previous: 0.72,
  skipBase: 0.52,
  skipStep: 0.035,
}
const SKIPPABLE_PROGRESS_WORDS = new Set(['a', 'an', 'the'])

export function normalizeVoiceText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function toVoiceWords(value) {
  const normalized = normalizeVoiceText(value)
  return normalized ? normalized.split(' ') : []
}

function canSkipProgressWord(scriptWords, scriptIndex, spokenWord) {
  return (
    SKIPPABLE_PROGRESS_WORDS.has(scriptWords[scriptIndex]) &&
    spokenWord === scriptWords[scriptIndex + 1]
  )
}

function advanceProgressIndex(scriptWords, scriptIndex, spokenWord) {
  if (spokenWord === scriptWords[scriptIndex]) return scriptIndex + 1
  if (canSkipProgressWord(scriptWords, scriptIndex, spokenWord)) {
    return scriptIndex + 2
  }

  return scriptIndex
}

export function getOrderedPrefixProgress({
  blockWords,
  previousMatchedCount = 0,
  transcriptWords,
}) {
  const scriptWords = Array.isArray(blockWords)
    ? blockWords
    : toVoiceWords(blockWords)
  const spokenWords = Array.isArray(transcriptWords)
    ? transcriptWords
    : toVoiceWords(transcriptWords)
  const previous = Math.min(
    scriptWords.length,
    Math.max(0, previousMatchedCount),
  )

  if (!scriptWords.length || !spokenWords.length) return previous

  const earliestStart = Math.max(0, previous - spokenWords.length)
  const canResumeAtCurrent = canSkipProgressWord(
    scriptWords,
    previous,
    spokenWords[0],
  )
  const latestStart = canResumeAtCurrent
    ? previous
    : previous > 0
      ? previous - 1
      : 0
  let furthestMatch = previous

  for (let start = earliestStart; start <= latestStart; start += 1) {
    let scriptIndex = start

    for (const spokenWord of spokenWords) {
      scriptIndex = advanceProgressIndex(
        scriptWords,
        scriptIndex,
        spokenWord,
      )
      if (scriptIndex === scriptWords.length) break
    }

    if (scriptIndex >= previous) {
      furthestMatch = Math.max(furthestMatch, scriptIndex)
    }
  }

  return furthestMatch
}

export function createTrackableBlocks(segments) {
  return segments.flatMap((segment, segmentIndex) => {
    if (!isSpeakableBlock(segment)) return []

    const words = toVoiceWords(segment.text)

    if (!words.length) return []

    return [
      {
        id: segment.id,
        segmentIndex,
        speaker: segment.speaker,
        text: segment.text,
        words,
      },
    ]
  })
}

function countSharedWords(left, right) {
  const remaining = new Map()

  right.forEach((word) => {
    remaining.set(word, (remaining.get(word) ?? 0) + 1)
  })

  return left.reduce((total, word) => {
    const available = remaining.get(word) ?? 0
    if (!available) return total

    remaining.set(word, available - 1)
    return total + 1
  }, 0)
}

function longestOrderedMatch(left, right) {
  const previous = new Array(right.length + 1).fill(0)

  left.forEach((leftWord) => {
    let diagonal = 0

    right.forEach((rightWord, rightIndex) => {
      const saved = previous[rightIndex + 1]
      previous[rightIndex + 1] =
        leftWord === rightWord
          ? diagonal + 1
          : Math.max(previous[rightIndex], saved)
      diagonal = saved
    })
  })

  return previous[right.length]
}

function longestConsecutiveMatch(left, right) {
  const previous = new Array(right.length + 1).fill(0)
  let longest = 0

  left.forEach((leftWord) => {
    let diagonal = 0

    right.forEach((rightWord, rightIndex) => {
      const saved = previous[rightIndex + 1]
      previous[rightIndex + 1] = leftWord === rightWord ? diagonal + 1 : 0
      longest = Math.max(longest, previous[rightIndex + 1])
      diagonal = saved
    })
  })

  return longest
}

export function scoreVoiceMatch(transcriptWords, blockWords, distance = 0) {
  if (!transcriptWords.length || !blockWords.length) {
    return {
      consecutiveScore: 0,
      orderedScore: 0,
      score: 0,
      sharedCount: 0,
      sharedScore: 0,
    }
  }

  const comparisonLength = Math.min(transcriptWords.length, blockWords.length)
  const sharedCount = countSharedWords(transcriptWords, blockWords)
  const orderedCount = longestOrderedMatch(transcriptWords, blockWords)
  const consecutiveCount = longestConsecutiveMatch(transcriptWords, blockWords)
  const sharedScore = sharedCount / comparisonLength
  const orderedScore = orderedCount / comparisonLength
  const consecutiveScore =
    consecutiveCount / Math.min(comparisonLength, 6)
  const proximityBonus = Math.max(0, 1 - Math.abs(distance) / 6) * 0.06
  const score = Math.min(
    1,
    sharedScore * 0.44 +
      orderedScore * 0.32 +
      consecutiveScore * 0.24 +
      proximityBonus,
  )

  return {
    consecutiveScore,
    orderedScore,
    score,
    sharedCount,
    sharedScore,
  }
}

export function getVoiceMatchThreshold(distance) {
  if (distance < 0) return VOICE_MATCH_THRESHOLDS.previous
  if (distance === 0) return VOICE_MATCH_THRESHOLDS.current
  if (distance === 1) return VOICE_MATCH_THRESHOLDS.next

  return Math.min(
    0.72,
    VOICE_MATCH_THRESHOLDS.skipBase +
      (distance - 1) * VOICE_MATCH_THRESHOLDS.skipStep,
  )
}

export function findVoiceMatch({ blocks, currentIndex = 0, transcript }) {
  const transcriptWords = Array.isArray(transcript)
    ? transcript.slice(-ROLLING_TRANSCRIPT_WORDS)
    : toVoiceWords(transcript).slice(-ROLLING_TRANSCRIPT_WORDS)

  if (!blocks.length || !transcriptWords.length) return null

  const safeCurrentIndex = Math.min(
    blocks.length - 1,
    Math.max(0, currentIndex),
  )
  const firstIndex = Math.max(0, safeCurrentIndex - 1)
  const lastIndex = Math.min(blocks.length - 1, safeCurrentIndex + 5)
  let bestMatch = null

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const distance = index - safeCurrentIndex
    const metrics = scoreVoiceMatch(
      transcriptWords,
      blocks[index].words,
      distance,
    )
    const threshold = getVoiceMatchThreshold(distance)
    const minimumSharedWords = Math.min(
      distance < 0 ? 3 : 2,
      transcriptWords.length,
    )
    const candidate = {
      ...metrics,
      block: blocks[index],
      distance,
      hasEnoughEvidence: metrics.sharedCount >= minimumSharedWords,
      index,
      threshold,
    }
    const candidateIsConfident =
      candidate.hasEnoughEvidence && candidate.score >= threshold
    const bestIsConfident =
      bestMatch?.hasEnoughEvidence && bestMatch.score >= bestMatch.threshold

    if (
      !bestMatch ||
      (candidateIsConfident && !bestIsConfident) ||
      (candidateIsConfident === bestIsConfident &&
        candidate.score > bestMatch.score)
    ) {
      bestMatch = candidate
    }
  }

  if (!bestMatch) return null

  const completeShortBlock =
    bestMatch.block.words.length <= 3 &&
    transcriptWords.length >= bestMatch.block.words.length &&
    bestMatch.sharedCount === transcriptWords.length &&
    bestMatch.consecutiveScore === 1
  const responsiveNextMatch =
    bestMatch.distance === 1 &&
    bestMatch.sharedCount >= 4 &&
    bestMatch.score >= 0.68 &&
    bestMatch.consecutiveScore >= 0.66
  const strongNearbyForwardMatch =
    bestMatch.distance >= 0 &&
    bestMatch.distance <= 1 &&
    (completeShortBlock ||
      (bestMatch.sharedCount >= 4 && bestMatch.score >= 0.84))
  const strongForwardSkipMatch =
    bestMatch.distance > 1 &&
    bestMatch.sharedCount >= 5 &&
    bestMatch.score >= Math.max(0.9, bestMatch.threshold + 0.18)
  const exceptionalBackwardMatch =
    bestMatch.distance === -1 &&
    bestMatch.score >= 0.94 &&
    bestMatch.consecutiveScore === 1 &&
    (bestMatch.sharedCount >= 5 || completeShortBlock)
  const isConfident =
    bestMatch.hasEnoughEvidence && bestMatch.score >= bestMatch.threshold
  const isVeryHighConfidence =
    strongNearbyForwardMatch ||
    strongForwardSkipMatch ||
    exceptionalBackwardMatch

  return {
    ...bestMatch,
    confidenceLevel: isVeryHighConfidence
      ? 'very-high'
      : isConfident
        ? 'confident'
        : 'weak',
    isConfident,
    isExceptionalBackwardMatch: exceptionalBackwardMatch,
    isImmediateMove:
      responsiveNextMatch ||
      strongNearbyForwardMatch ||
      strongForwardSkipMatch ||
      exceptionalBackwardMatch,
    isVeryHighConfidence,
    transcriptWords,
  }
}
