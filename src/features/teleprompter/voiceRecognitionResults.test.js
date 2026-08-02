import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearRecognitionTranscript,
  createRecognitionSessionState,
  processRecognitionEvent,
} from './voiceRecognitionResults.js'

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
  assert.equal(cleared.processedFinalResultIndexes.has(0), true)
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
