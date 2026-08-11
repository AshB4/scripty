import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearRecognitionTranscript,
  createRecognitionSessionState,
  processRecognitionEvent,
} from '../voiceFollow/voiceRecognitionResults.js'

function recognitionResult(transcript, isFinal = false) {
  const result = [{ transcript }]
  result.isFinal = isFinal
  return result
}

test('uses event.resultIndex and skips unchanged earlier results', () => {
  const firstState = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [recognitionResult('first line', true)],
    },
    sessionState: createRecognitionSessionState(),
  }).sessionState
  const update = processRecognitionEvent({
    event: {
      resultIndex: 1,
      results: [
        recognitionResult('should not be reprocessed', true),
        recognitionResult('second line', false),
      ],
    },
    sessionState: firstState,
  })

  assert.deepEqual(update.rollingWords, [
    'first',
    'line',
    'second',
    'line',
  ])
})

test('does not duplicate final results repeated by the browser', () => {
  const event = {
    resultIndex: 0,
    results: [recognitionResult('one final phrase', true)],
  }
  const first = processRecognitionEvent({
    event,
    sessionState: createRecognitionSessionState(),
  })
  const repeated = processRecognitionEvent({
    event,
    sessionState: first.sessionState,
  })

  assert.deepEqual(first.rollingWords, ['one', 'final', 'phrase'])
  assert.deepEqual(repeated.rollingWords, ['one', 'final', 'phrase'])
  assert.equal(repeated.receivedSpeech, false)
})

test('replaces interim text instead of duplicating it', () => {
  const sessionState = createRecognitionSessionState()
  const first = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [recognitionResult('welcome')],
    },
    sessionState,
  })
  const expanded = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [recognitionResult('welcome to Scripty')],
    },
    sessionState: first.sessionState,
  })

  assert.deepEqual(expanded.rollingWords, ['welcome', 'to', 'scripty'])
})

test('aggregates multiple changed results into one recognition update', () => {
  const update = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [
        recognitionResult('finished words', true),
        recognitionResult('interim words'),
      ],
    },
    sessionState: createRecognitionSessionState(),
  })

  assert.equal(update.resultKind, 'final+interim')
  assert.deepEqual(update.rollingWords, [
    'finished',
    'words',
    'interim',
    'words',
  ])
  assert.deepEqual(update.eventFinalWords, ['finished', 'words'])
  assert.deepEqual(update.interimWords, ['interim', 'words'])
  assert.equal(update.finalWordCount, 2)
  assert.equal(update.rollingWordCount, 4)
  assert.deepEqual(update.orderedEvidence, [
    {
      isFinal: true,
      resultIndex: 0,
      wordCount: 2,
      words: ['finished', 'words'],
    },
    {
      isFinal: false,
      resultIndex: 1,
      wordCount: 2,
      words: ['interim', 'words'],
    },
  ])
})

test('ordered evidence includes only changed interim result boundaries', () => {
  const first = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [
        recognitionResult('first interim'),
        recognitionResult('second interim'),
      ],
    },
    sessionState: createRecognitionSessionState(),
  })
  const revised = processRecognitionEvent({
    event: {
      resultIndex: 1,
      results: [
        recognitionResult('first interim'),
        recognitionResult('second interim expanded'),
      ],
    },
    sessionState: first.sessionState,
  })

  assert.deepEqual(revised.orderedEvidence, [
    {
      isFinal: false,
      resultIndex: 1,
      wordCount: 3,
      words: ['second', 'interim', 'expanded'],
    },
  ])
})

test('an unchanged interim stays suppressed when resultIndex advances', () => {
  const first = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [
        recognitionResult('first interim'),
        recognitionResult('second interim'),
      ],
    },
    sessionState: createRecognitionSessionState(),
  })
  const unchanged = processRecognitionEvent({
    event: {
      resultIndex: 1,
      results: [
        recognitionResult('first interim'),
        recognitionResult('second interim'),
      ],
    },
    sessionState: first.sessionState,
  })

  assert.equal(unchanged.receivedSpeech, false)
  assert.equal(unchanged.isDuplicateRevision, true)
  assert.deepEqual(unchanged.changedWords, [])
  assert.deepEqual(unchanged.orderedEvidence, [])
})

test('final transcript storage remains bounded and can be retired per block', () => {
  const words = Array.from({ length: 30 }, (_, index) => `word${index}`)
  const processed = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [recognitionResult(words.join(' '), true)],
    },
    sessionState: createRecognitionSessionState(),
  })
  const cleared = clearRecognitionTranscript(processed.sessionState)

  assert.equal(processed.sessionState.finalWords.length, 18)
  assert.equal(processed.rollingWordCount, 18)
  assert.deepEqual(cleared.finalWords, [])
  assert.equal(cleared.highestProcessedFinalResultIndex, 0)
  assert.equal('processedFinalResultIndexes' in cleared, false)
})

test('ignores an unchanged interim revision', () => {
  const event = {
    resultIndex: 0,
    results: [recognitionResult('Did you sleep at all')],
  }
  const first = processRecognitionEvent({
    event,
    sessionState: createRecognitionSessionState(),
  })
  const repeated = processRecognitionEvent({
    event,
    sessionState: first.sessionState,
  })

  assert.equal(first.receivedSpeech, true)
  assert.equal(first.isDuplicateRevision, false)
  assert.equal(repeated.receivedSpeech, false)
  assert.equal(repeated.isDuplicateRevision, true)
  assert.deepEqual(repeated.changedWords, [])
})

test('processes realistic interim revisions once and accepts the final result', () => {
  const revisions = [
    'Did',
    'Did you',
    'Did you sleep',
    'Did you sleep at',
    'Did you sleep at all',
  ]
  let sessionState = createRecognitionSessionState()
  let processedCount = 0
  let duplicateCount = 0

  revisions.forEach((transcript) => {
    const event = {
      resultIndex: 0,
      results: [recognitionResult(transcript)],
    }
    const changed = processRecognitionEvent({ event, sessionState })
    sessionState = changed.sessionState
    processedCount += Number(changed.receivedSpeech)

    const duplicate = processRecognitionEvent({ event, sessionState })
    sessionState = duplicate.sessionState
    duplicateCount += Number(duplicate.isDuplicateRevision)
  })

  const final = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [recognitionResult('Did you sleep at all?', true)],
    },
    sessionState,
  })

  assert.equal(processedCount, revisions.length)
  assert.equal(duplicateCount, revisions.length)
  assert.equal(final.receivedSpeech, true)
  assert.equal(final.sessionState.highestProcessedFinalResultIndex, 0)
})

test('final-result tracking stays constant-size across a long session', () => {
  let sessionState = createRecognitionSessionState()

  for (let index = 0; index < 5000; index += 1) {
    sessionState = processRecognitionEvent({
      event: {
        resultIndex: index,
        results: {
          [index]: recognitionResult(`final phrase ${index}`, true),
          length: index + 1,
        },
      },
      sessionState,
    }).sessionState
  }

  assert.equal(sessionState.finalWords.length <= 18, true)
  assert.equal(sessionState.highestProcessedFinalResultIndex, 4999)
  assert.deepEqual(Object.keys(sessionState).sort(), [
    'finalWords',
    'highestProcessedFinalResultIndex',
    'lastInterimSignature',
  ])
})

test('a recognition restart creates fresh session-specific result indexes', () => {
  const firstSession = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [recognitionResult('old session', true)],
    },
    sessionState: createRecognitionSessionState(),
  })
  const restartedSession = processRecognitionEvent({
    event: {
      resultIndex: 0,
      results: [recognitionResult('new session', true)],
    },
    sessionState: createRecognitionSessionState(),
  })

  assert.deepEqual(firstSession.rollingWords, ['old', 'session'])
  assert.deepEqual(restartedSession.rollingWords, ['new', 'session'])
})

test('changed-result work and retained transcript state remain bounded', () => {
  const resultCount = 7
  const longTranscript = Array.from(
    { length: 30 },
    (_, index) => `word${index}`,
  ).join(' ')
  const event = {
    resultIndex: 0,
    results: Array.from({ length: resultCount }, (_, index) =>
      recognitionResult(`${longTranscript} boundary${index}`, true),
    ),
  }
  const processed = processRecognitionEvent({
    event,
    sessionState: createRecognitionSessionState(),
  })
  const unchanged = processRecognitionEvent({
    event: { ...event, resultIndex: resultCount - 1 },
    sessionState: processed.sessionState,
  })

  assert.equal(processed.orderedEvidence.length, resultCount)
  assert.equal(
    processed.orderedEvidence.every((evidence) => evidence.words.length <= 18),
    true,
  )
  assert.equal(processed.sessionState.finalWords.length, 18)
  assert.equal(unchanged.orderedEvidence.length, 0)
  assert.equal(unchanged.receivedSpeech, false)
})
