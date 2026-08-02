import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findVoiceMatch,
  getOrderedPrefixProgress,
  toVoiceWords,
} from './voiceFollowMatcher.js'
import { resolveVoiceMatchState } from './voiceFollowState.js'
import {
  createCleanBlockTrackingState,
  getSameEventCarryoverWords,
  isBlockProgressComplete,
} from './voiceFollowTracking.js'
import {
  clearRecognitionTranscript,
  createRecognitionSessionState,
  processRecognitionEvent,
} from './voiceRecognitionResults.js'

const lineTexts = [
  'Welcome to Scripty.',
  'This is a simple voice follow test.',
  'The quick brown fox jumps over the lazy dog.',
  'Now I am speaking again.',
  'This is the final sentence.',
]
const blocks = lineTexts.map((text, index) => ({
  id: `line-${index + 1}`,
  segmentIndex: index,
  text,
  words: toVoiceWords(text),
}))

function recognitionResult(transcript, isFinal = true) {
  const result = [{ transcript }]
  result.isFinal = isFinal
  return result
}

test('five consecutive lines remain equally responsive with block-relative transcripts', () => {
  let currentIndex = 0
  let sessionState = createRecognitionSessionState()
  const confirmationCounts = []
  const rollingWordCounts = []

  lineTexts.forEach((line, lineIndex) => {
    const processed = processRecognitionEvent({
      event: {
        resultIndex: lineIndex,
        results: lineTexts
          .slice(0, lineIndex + 1)
          .map((text) => recognitionResult(text)),
      },
      sessionState,
    })
    sessionState = processed.sessionState
    rollingWordCounts.push(processed.rollingWords.length)

    const match = findVoiceMatch({
      blocks,
      currentIndex,
      transcript: processed.rollingWords,
    })
    const decision = resolveVoiceMatchState({ currentIndex, match })
    confirmationCounts.push(decision.confirmationCount)

    if (lineIndex > 0) {
      assert.equal(decision.shouldMove, true)
      assert.equal(decision.nextIndex, lineIndex)
      currentIndex = decision.nextIndex
    }

    const progress = getOrderedPrefixProgress({
      blockWords: blocks[currentIndex].words,
      transcriptWords: processed.changedWords,
    })
    assert.equal(progress, blocks[currentIndex].words.length)
    assert.equal(isBlockProgressComplete(progress, blocks[currentIndex].words.length), true)
    sessionState = clearRecognitionTranscript(sessionState)
  })

  assert.deepEqual(confirmationCounts, [0, 1, 1, 1, 1])
  assert.deepEqual(
    rollingWordCounts,
    blocks.map((block) => block.words.length),
  )
})

test('automatic transition clears stale words and keeps genuine same-event carryover', () => {
  const eventWords = toVoiceWords(
    'Welcome to Scripty. This is a simple voice follow',
  )
  const tracking = createCleanBlockTrackingState({
    eventWords,
    nextBlockWords: blocks[1].words,
  })

  assert.deepEqual(tracking.carryoverWords, [
    'this',
    'is',
    'a',
    'simple',
    'voice',
    'follow',
  ])
  assert.deepEqual(tracking.pendingMatch, { count: 0, index: null })
  assert.equal(tracking.lowConfidenceCount, 0)
})

test('carryover excludes words that belong only to the completed line', () => {
  assert.deepEqual(
    getSameEventCarryoverWords(blocks[0].words, blocks[1].words),
    [],
  )
})

test('manual and automatic movement create equivalent clean block state', () => {
  const manual = createCleanBlockTrackingState()
  const automatic = createCleanBlockTrackingState({
    eventWords: blocks[0].words,
    nextBlockWords: blocks[1].words,
  })

  assert.deepEqual(automatic, manual)
})

test('prior-line words cannot complete a later line after cleanup', () => {
  const cleanState = createCleanBlockTrackingState({
    eventWords: blocks[2].words,
    nextBlockWords: blocks[4].words,
  })
  const progress = getOrderedPrefixProgress({
    blockWords: blocks[4].words,
    transcriptWords: cleanState.carryoverWords,
  })

  assert.deepEqual(cleanState.carryoverWords, [])
  assert.equal(progress, 0)
})
