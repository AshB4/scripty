import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findVoiceMatch,
  getOrderedPrefixProgress,
  ROLLING_TRANSCRIPT_WORDS,
  toVoiceWords,
} from '../voiceFollow/voiceFollowMatcher.js'
import { resolveVoiceMatchState } from '../voiceFollow/voiceFollowState.js'
import {
  createCleanBlockTrackingState,
  isBlockProgressComplete,
  resolveIdenticalBlockOccurrence,
} from '../voiceFollow/voiceFollowTracking.js'
import {
  clearRecognitionTranscript,
  createRecognitionSessionState,
  processRecognitionEvent,
} from '../voiceFollow/voiceRecognitionResults.js'

const lines = [
  'We reviewed the opening details today.',
  'The team will explain the final decision.',
  'Please listen for the next update.',
]

const blocks = lines.map((text, index) => ({
  id: `line-${index + 1}`,
  segmentIndex: index,
  text,
  words: toVoiceWords(text),
}))

function recognitionResult(transcript, isFinal = false) {
  const result = [{ transcript }]
  result.isFinal = isFinal
  return result
}

function createReplay(blocksToReplay) {
  let completedOccurrence = null
  let currentIndex = 0
  let lastMovement = null
  let lowConfidenceCount = 0
  let matchedWordCount = 0
  let pendingMatch = { count: 0, index: null }
  let sessionState = createRecognitionSessionState()
  let sessionId = 1
  let status = 'Listening'
  const moves = []

  function elapseSilence() {
    status = 'Waiting'
    return { currentIndex, matchedWordCount, status }
  }

  function restartRecognitionSession() {
    sessionState = createRecognitionSessionState()
    sessionId += 1
    pendingMatch = { count: 0, index: null }
    lowConfidenceCount = 0
    status = 'Listening'
    return { currentIndex, matchedWordCount, status }
  }

  function deliver(event, now) {
    const previousFinalWords = [...sessionState.finalWords]
    const processed = processRecognitionEvent({ event, sessionState })
    sessionState = processed.sessionState
    const result = { currentIndex, processed }
    let transcriptCleared = false

    if (!processed.receivedSpeech) {
      return {
        ...result,
        lowConfidenceCount,
        moves: [...moves],
        pendingMatch,
        sessionState: {
          ...sessionState,
          finalWords: [...sessionState.finalWords],
        },
        status,
        transcriptCleared,
      }
    }

    function processTranscript(transcriptWords, progressWords, evidence) {
      const startingIndex = currentIndex
      let match = findVoiceMatch({
        blocks: blocksToReplay,
        currentIndex,
        transcript: transcriptWords,
      })
      match = resolveIdenticalBlockOccurrence({
        blocks: blocksToReplay,
        completedOccurrence,
        currentIndex,
        evidence,
        match,
        matchedWordCount,
      })
      const decision = resolveVoiceMatchState({
        currentIndex,
        lastMovement,
        lowConfidenceCount,
        match,
        now,
        pendingMatch,
      })
      lowConfidenceCount = decision.lowConfidenceCount
      pendingMatch = decision.pendingMatch
      status = decision.status

      let carryoverWords = null
      if (decision.shouldMove) {
        const nextBlockWords = blocksToReplay[decision.nextIndex]?.words ?? []
        const cleanState = createCleanBlockTrackingState({
          eventWords: progressWords,
          nextBlockWords,
        })
        carryoverWords = cleanState.carryoverWords
        currentIndex = decision.nextIndex
        lastMovement = {
          at: now,
          fromIndex: startingIndex,
          source: 'voice',
          toIndex: currentIndex,
        }
        completedOccurrence = null
        lowConfidenceCount = cleanState.lowConfidenceCount
        matchedWordCount = 0
        pendingMatch = cleanState.pendingMatch
        sessionState = clearRecognitionTranscript(sessionState)
        transcriptCleared = true
        moves.push(currentIndex)
      }

      const previousMatchedCount = matchedWordCount
      const activeBlockWords = blocksToReplay[currentIndex].words
      matchedWordCount = getOrderedPrefixProgress({
        blockWords: activeBlockWords,
        previousMatchedCount,
        transcriptWords: carryoverWords ?? progressWords,
      })
      const completedBlock = isBlockProgressComplete(
        matchedWordCount,
        activeBlockWords.length,
      )
      const justCompletedBlock =
        completedBlock && previousMatchedCount < activeBlockWords.length

      if (completedBlock) {
        sessionState = clearRecognitionTranscript(sessionState)
        transcriptCleared = true
      }
      if (justCompletedBlock) {
        pendingMatch = { count: 0, index: null }
        lowConfidenceCount = 0
        completedOccurrence = {
          blockIndex: currentIndex,
          ...evidence,
        }
      }

      return { completedBlock, decision, didMove: decision.shouldMove, match }
    }

    const evidence = processed.orderedEvidence
    let lastOutcome = null

    if (evidence.length <= 1) {
      const item = evidence[0]
      lastOutcome = processTranscript(
        processed.rollingWords,
        processed.changedWords,
        item
          ? { resultIndex: item.resultIndex, sessionId }
          : { resultIndex: event.resultIndex ?? 0, sessionId },
      )
    } else {
      let sequentialWords = previousFinalWords

      evidence.forEach((item) => {
        sequentialWords = [...sequentialWords, ...item.words].slice(
          -ROLLING_TRANSCRIPT_WORDS,
        )
        lastOutcome = processTranscript(sequentialWords, item.words, {
          resultIndex: item.resultIndex,
          sessionId,
        })
        if (lastOutcome.completedBlock || lastOutcome.didMove) {
          sequentialWords = []
        }
      })
    }

    return {
      ...result,
      currentIndex,
      decision: lastOutcome?.decision,
      lowConfidenceCount,
      match: lastOutcome?.match,
      matchedWordCount,
      moves: [...moves],
      pendingMatch,
      sessionState: {
        ...sessionState,
        finalWords: [...sessionState.finalWords],
      },
      status,
      transcriptCleared,
    }
  }

  return { deliver, elapseSilence, restartRecognitionSession }
}

test('replay: a strong next-line interim advances exactly once', () => {
  const replay = createReplay(blocks)
  const first = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('The team will explain the')],
    },
    1_000,
  )
  const duplicate = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('The team will explain the')],
    },
    1_100,
  )

  assert.equal(first.currentIndex, 1)
  assert.deepEqual(first.moves, [1])
  assert.equal(duplicate.currentIndex, 1)
  assert.deepEqual(duplicate.moves, [1])
})

test('replay: repeating the current line remains on the current block', () => {
  const replay = createReplay(blocks)

  const first = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult(lines[0])],
    },
    1_000,
  )
  const final = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult(lines[0], true)],
    },
    1_100,
  )
  const repeatedFinal = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[0], true),
      ],
    },
    1_200,
  )

  assert.equal(first.currentIndex, 0)
  assert.equal(final.currentIndex, 0)
  assert.equal(repeatedFinal.currentIndex, 0)
  assert.deepEqual(repeatedFinal.moves, [])
})

test('replay: revised next-line interim results advance reliably', () => {
  const replay = createReplay(blocks)

  const partial = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('The team')],
    },
    1_000,
  )
  const expanded = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('The team will explain the')],
    },
    1_100,
  )
  const final = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult(lines[1], true)],
    },
    1_200,
  )

  assert.equal(partial.currentIndex, 0)
  assert.deepEqual(partial.pendingMatch, { count: 1, index: 1 })
  assert.equal(expanded.currentIndex, 1)
  assert.deepEqual(expanded.moves, [1])
  assert.equal(final.currentIndex, 1)
  assert.deepEqual(final.moves, [1])
})

test('replay: an interim replacement after the current final keeps next-line evidence', () => {
  const replay = createReplay(blocks)

  const combined = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult('The team will'),
      ],
    },
    1_000,
  )
  const replacement = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult('The team will explain the final'),
      ],
    },
    1_100,
  )

  assert.equal(combined.currentIndex, 0)
  assert.equal(replacement.currentIndex, 1)
  assert.deepEqual(replacement.moves, [1])
})

test('replay: retained current words do not block a clear next-line transition', () => {
  const replay = createReplay(blocks)

  replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('We reviewed the opening details', true)],
    },
    1_000,
  )
  const nextLine = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult('We reviewed the opening details', true),
        recognitionResult(lines[1]),
      ],
    },
    1_100,
  )

  assert.equal(nextLine.currentIndex, 1)
  assert.deepEqual(nextLine.moves, [1])
})

test('replay: current final plus next interim advances to the next block', () => {
  const replay = createReplay(blocks)
  const combined = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult('The team will explain the final'),
      ],
    },
    1_000,
  )
  const unchanged = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult('The team will explain the final'),
      ],
    },
    1_100,
  )

  assert.equal(combined.match.index, 1)
  assert.equal(combined.transcriptCleared, true)
  assert.equal(unchanged.processed.receivedSpeech, false)
  assert.deepEqual(unchanged.moves, [1])
  assert.equal(combined.currentIndex, 1)
  assert.deepEqual(combined.moves, [1])
})

test('replay: current interim plus next interim advances to the next block', () => {
  const replay = createReplay(blocks)
  const combined = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0]),
        recognitionResult('The team will explain the final'),
      ],
    },
    1_000,
  )
  const unchanged = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0]),
        recognitionResult('The team will explain the final'),
      ],
    },
    1_100,
  )

  assert.equal(combined.match.index, 1)
  assert.equal(combined.transcriptCleared, true)
  assert.equal(unchanged.processed.receivedSpeech, false)
  assert.deepEqual(unchanged.moves, [1])
  assert.equal(combined.currentIndex, 1)
  assert.deepEqual(combined.moves, [1])
})

test('replay: current interim plus next final advances without losing the final result', () => {
  const replay = createReplay(blocks)
  const combined = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0]),
        recognitionResult(lines[1], true),
      ],
    },
    1_000,
  )
  const repeatedFinal = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0]),
        recognitionResult(lines[1], true),
      ],
    },
    1_100,
  )

  assert.equal(combined.match.index, 1)
  assert.equal(combined.transcriptCleared, true)
  assert.equal(combined.sessionState.highestProcessedFinalResultIndex, 1)
  assert.equal(repeatedFinal.processed.receivedSpeech, false)
  assert.deepEqual(repeatedFinal.moves, [1])
  assert.equal(combined.currentIndex, 1)
  assert.deepEqual(combined.moves, [1])
  assert.deepEqual(combined.sessionState.finalWords, [])
})

test('replay: current and next finals plus third interim advance to the next block', () => {
  const replay = createReplay(blocks)
  const combined = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
        recognitionResult('Please listen'),
      ],
    },
    1_000,
  )
  const unchangedThird = replay.deliver(
    {
      resultIndex: 2,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
        recognitionResult('Please listen'),
      ],
    },
    1_100,
  )

  assert.equal(combined.match.index, 2)
  assert.equal(combined.transcriptCleared, true)
  assert.equal(unchangedThird.processed.receivedSpeech, false)
  assert.deepEqual(unchangedThird.moves, [1])
  assert.equal(combined.currentIndex, 1)
  assert.deepEqual(combined.moves, [1])
})

test('replay: three adjacent final results advance through the latest spoken block', () => {
  const replay = createReplay(blocks)
  const combined = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
        recognitionResult(lines[2], true),
      ],
    },
    1_000,
  )
  const repeatedThird = replay.deliver(
    {
      resultIndex: 2,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
        recognitionResult(lines[2], true),
      ],
    },
    1_100,
  )

  assert.equal(combined.match.index, 2)
  assert.equal(combined.transcriptCleared, true)
  assert.equal(combined.sessionState.highestProcessedFinalResultIndex, 2)
  assert.equal(repeatedThird.processed.receivedSpeech, false)
  assert.deepEqual(repeatedThird.moves, [1, 2])
  assert.equal(combined.currentIndex, 2)
  assert.deepEqual(combined.moves, [1, 2])
})

test('replay: advancing resultIndex delivers adjacent finals without losing movement', () => {
  const replay = createReplay(blocks)
  const current = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult(lines[0], true)],
    },
    1_000,
  )
  const next = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
      ],
    },
    2_000,
  )
  const third = replay.deliver(
    {
      resultIndex: 2,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
        recognitionResult(lines[2], true),
      ],
    },
    3_000,
  )

  assert.equal(current.currentIndex, 0)
  assert.equal(next.currentIndex, 1)
  assert.equal(third.currentIndex, 2)
  assert.deepEqual(third.moves, [1, 2])
})

test('replay: finalized replacements preserve adjacent interim evidence', () => {
  const replay = createReplay(blocks)
  const currentInterim = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('We reviewed the opening details')],
    },
    1_000,
  )
  const currentFinalWithNextInterim = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult('The team will explain the final'),
      ],
    },
    1_100,
  )
  const nextFinal = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
      ],
    },
    1_200,
  )

  assert.equal(currentInterim.currentIndex, 0)
  assert.equal(nextFinal.currentIndex, 1)
  assert.deepEqual(nextFinal.moves, [1])
  assert.equal(currentFinalWithNextInterim.match.index, 1)
  assert.equal(currentFinalWithNextInterim.transcriptCleared, true)
  assert.equal(currentFinalWithNextInterim.currentIndex, 1)
})

test('replay: direct recognition of block N+2 preserves forward skip behavior', () => {
  const replay = createReplay(blocks)
  const skipped = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult(lines[2], true)],
    },
    1_000,
  )

  assert.equal(skipped.currentIndex, 2)
  assert.deepEqual(skipped.moves, [2])
  assert.equal(skipped.transcriptCleared, true)
})

test('replay: progress resumes after silence and can advance to the next block', () => {
  const replay = createReplay(blocks)
  const partial = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('We reviewed')],
    },
    1_000,
  )
  const waiting = replay.elapseSilence()
  const resumed = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('We reviewed the opening details today')],
    },
    3_000,
  )
  replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult(lines[0], true)],
    },
    3_100,
  )
  const next = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult('The team will explain the final'),
      ],
    },
    3_200,
  )

  assert.equal(partial.matchedWordCount, 2)
  assert.equal(waiting.status, 'Waiting')
  assert.equal(resumed.matchedWordCount, blocks[0].words.length)
  assert.equal(resumed.status, 'Following')
  assert.equal(next.currentIndex, 1)
  assert.deepEqual(next.moves, [1])
})

test('replay: progress survives a recognition-session restart after silence', () => {
  const replay = createReplay(blocks)
  const partial = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('We reviewed')],
    },
    1_000,
  )
  replay.elapseSilence()
  const restarted = replay.restartRecognitionSession()
  const resumed = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('We reviewed the opening details today')],
    },
    3_000,
  )
  const next = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult('The team will explain the final'),
      ],
    },
    3_200,
  )

  assert.equal(partial.matchedWordCount, 2)
  assert.equal(restarted.matchedWordCount, 2)
  assert.equal(restarted.status, 'Listening')
  assert.equal(resumed.matchedWordCount, blocks[0].words.length)
  assert.equal(next.currentIndex, 1)
})

test('replay: progressive revisions keep updating through the next block', () => {
  const replay = createReplay(blocks)
  const first = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('We reviewed')],
    },
    1_000,
  )
  const expanded = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult('We reviewed the opening details')],
    },
    1_100,
  )
  const completed = replay.deliver(
    {
      resultIndex: 0,
      results: [recognitionResult(lines[0], true)],
    },
    1_200,
  )
  const nextPartial = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult('The team will explain the final'),
      ],
    },
    1_300,
  )
  const nextCompleted = replay.deliver(
    {
      resultIndex: 1,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
      ],
    },
    1_400,
  )

  assert.equal(first.matchedWordCount, 2)
  assert.equal(expanded.matchedWordCount, 5)
  assert.equal(completed.matchedWordCount, blocks[0].words.length)
  assert.equal(nextPartial.currentIndex, 1)
  assert.equal(nextPartial.matchedWordCount, 6)
  assert.equal(nextCompleted.matchedWordCount, blocks[1].words.length)
})

const repeatedLine =
  'This sentence will be repeated once so I can see whether the tracker stays in the correct place.'
const repeatedBlocks = [repeatedLine, repeatedLine, lines[2]].map(
  (text, index) => ({
    id: `repeated-line-${index + 1}`,
    segmentIndex: index,
    text,
    words: toVoiceWords(text),
  }),
)

function deliverRepeatedUtterance(replay, utteranceIndex, now) {
  const priorFinals = Array.from({ length: utteranceIndex }, () =>
    recognitionResult(repeatedLine, true),
  )
  const interim = replay.deliver(
    {
      resultIndex: utteranceIndex,
      results: [
        ...priorFinals,
        recognitionResult(
          'This sentence will be repeated once so I can see whether the tracker',
        ),
      ],
    },
    now,
  )
  const final = replay.deliver(
    {
      resultIndex: utteranceIndex,
      results: [...priorFinals, recognitionResult(repeatedLine, true)],
    },
    now + 100,
  )

  return { final, interim }
}

test('replay: a second distinct utterance advances across identical blocks', () => {
  const replay = createReplay(repeatedBlocks)
  const first = deliverRepeatedUtterance(replay, 0, 1_000)
  const second = deliverRepeatedUtterance(replay, 1, 2_000)

  assert.equal(first.final.currentIndex, 0)
  assert.equal(first.final.matchedWordCount, repeatedBlocks[0].words.length)
  assert.equal(second.interim.processed.receivedSpeech, true)
  assert.equal(second.final.currentIndex, 1)
  assert.deepEqual(second.final.moves, [1])
})

test('replay: three utterances across two identical blocks stop at the second block', () => {
  const replay = createReplay(repeatedBlocks)
  const first = deliverRepeatedUtterance(replay, 0, 1_000)
  const second = deliverRepeatedUtterance(replay, 1, 2_000)
  const third = deliverRepeatedUtterance(replay, 2, 3_000)

  assert.notEqual(third.final.currentIndex, 2)
  assert.deepEqual(
    [
      first.final.currentIndex,
      second.final.currentIndex,
      third.final.currentIndex,
    ],
    [0, 1, 1],
  )
})

test('replay: one combined recognition result should advance after a full next line', () => {
  const replay = createReplay(blocks)
  const combined = replay.deliver(
    {
      resultIndex: 0,
      results: [
        recognitionResult(lines[0], true),
        recognitionResult(lines[1], true),
      ],
    },
    1_000,
  )

  assert.equal(
    combined.currentIndex,
    1,
    'the full next-line result should advance instead of remaining on the completed current line',
  )
  assert.deepEqual(combined.moves, [1])
})
