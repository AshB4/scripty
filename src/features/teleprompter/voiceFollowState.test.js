import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canScheduleRecognitionRestart,
  getRecognitionErrorState,
  LOST_RESULT_LIMIT,
  resolveVoiceMatchState,
} from './voiceFollowState.js'

const confidentMatch = {
  index: 2,
  isConfident: true,
  isVeryHighConfidence: false,
}

test('requires the same ordinary match twice before moving', () => {
  const first = resolveVoiceMatchState({
    currentIndex: 1,
    match: confidentMatch,
  })
  const second = resolveVoiceMatchState({
    currentIndex: 1,
    match: confidentMatch,
    pendingMatch: first.pendingMatch,
  })

  assert.equal(first.shouldMove, false)
  assert.equal(first.status, 'Listening')
  assert.equal(second.shouldMove, true)
  assert.equal(second.nextIndex, 2)
  assert.equal(second.status, 'Following')
})

test('allows one immediate move for a very high-confidence result', () => {
  const result = resolveVoiceMatchState({
    currentIndex: 0,
    match: { ...confidentMatch, isVeryHighConfidence: true },
  })

  assert.equal(result.shouldMove, true)
  assert.equal(result.nextIndex, 2)
  assert.equal(result.status, 'Following')
})

test('keeps position and becomes Lost after repeated weak results', () => {
  let state = {
    lowConfidenceCount: 0,
    pendingMatch: { count: 0, index: null },
  }

  for (let count = 0; count < LOST_RESULT_LIMIT; count += 1) {
    state = resolveVoiceMatchState({
      currentIndex: 3,
      lowConfidenceCount: state.lowConfidenceCount,
      match: null,
      pendingMatch: state.pendingMatch,
    })
  }

  assert.equal(state.nextIndex, 3)
  assert.equal(state.shouldMove, false)
  assert.equal(state.status, 'Lost')
})

test('maps permission, microphone, waiting, and network errors safely', () => {
  assert.deepEqual(getRecognitionErrorState('not-allowed'), {
    disable: true,
    message:
      'Microphone permission was denied. Manual teleprompter controls are still available.',
    retry: false,
    status: 'Permission denied',
  })
  assert.equal(getRecognitionErrorState('audio-capture').disable, true)
  assert.equal(getRecognitionErrorState('no-speech').status, 'Waiting')
  assert.equal(getRecognitionErrorState('network').retry, true)
})

test('restarts only an enabled, ended, unscheduled session', () => {
  assert.equal(
    canScheduleRecognitionRestart({
      hasRecognition: false,
      isEnabled: true,
      isRestartScheduled: false,
    }),
    true,
  )
  assert.equal(
    canScheduleRecognitionRestart({
      hasRecognition: false,
      isEnabled: false,
      isRestartScheduled: false,
    }),
    false,
  )
  assert.equal(
    canScheduleRecognitionRestart({
      hasRecognition: false,
      isEnabled: true,
      isRestartScheduled: true,
    }),
    false,
  )
})
