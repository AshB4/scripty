export const ROLLING_TRANSCRIPT_WORDS = 18

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

export function createTrackableBlocks(segments) {
  return segments.flatMap((segment, segmentIndex) => {
    if (segment.type && segment.type !== 'dialogue') return []

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
    const metrics = scoreVoiceMatch(
      transcriptWords,
      blocks[index].words,
      index - safeCurrentIndex,
    )

    if (!bestMatch || metrics.score > bestMatch.score) {
      bestMatch = { ...metrics, block: blocks[index], index }
    }
  }

  if (!bestMatch) return null

  const shortExactMatch =
    transcriptWords.length >= 2 &&
    transcriptWords.length <= 3 &&
    bestMatch.sharedCount === transcriptWords.length &&
    bestMatch.consecutiveScore === 1
  const enoughEvidence =
    bestMatch.sharedCount >= Math.min(2, transcriptWords.length)

  return {
    ...bestMatch,
    isConfident: enoughEvidence && bestMatch.score >= 0.46,
    isVeryHighConfidence:
      shortExactMatch ||
      (bestMatch.sharedCount >= 4 && bestMatch.score >= 0.82),
    transcriptWords,
  }
}
