import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canScheduleRecognitionRestart,
  getRecognitionErrorState,
  LOST_RESULT_LIMIT,
  MOVEMENT_COOLDOWN_MS,
  resolveVoiceMatchState,
} from '../voiceFollow/voiceFollowState.js'

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

test('allows an immediate very-high-confidence next-block move', () => {
  const result = resolveVoiceMatchState({
    currentIndex: 1,
    match: {
      ...confidentMatch,
      index: 2,
      isImmediateMove: true,
      isVeryHighConfidence: true,
    },
  })

  assert.equal(result.shouldMove, true)
  assert.equal(result.nextIndex, 2)
  assert.equal(result.status, 'Following')
})

test('allows a responsive ordinary next-block match without a second result', () => {
  const result = resolveVoiceMatchState({
    currentIndex: 1,
    match: {
      ...confidentMatch,
      isImmediateMove: true,
      isVeryHighConfidence: false,
    },
  })

  assert.equal(result.shouldMove, true)
  assert.equal(result.confirmationCount, 1)
})

test('weak interim text never moves the current block', () => {
  const result = resolveVoiceMatchState({
    currentIndex: 1,
    match: { index: 2, isConfident: false },
  })

  assert.equal(result.shouldMove, false)
  assert.equal(result.nextIndex, 1)
})

test('current-block progress does not request block centering', () => {
  const result = resolveVoiceMatchState({
    currentIndex: 1,
    match: { index: 1, isConfident: true },
  })

  assert.equal(result.shouldMove, false)
  assert.equal(result.status, 'Following')
})

test('previous-block movement requires repeated stronger evidence', () => {
  const backwardMatch = {
    index: 1,
    isConfident: true,
    isExceptionalBackwardMatch: false,
    isImmediateMove: false,
    isVeryHighConfidence: true,
  }
  const first = resolveVoiceMatchState({
    currentIndex: 2,
    match: backwardMatch,
  })
  const second = resolveVoiceMatchState({
    currentIndex: 2,
    match: backwardMatch,
    pendingMatch: first.pendingMatch,
  })

  assert.equal(first.shouldMove, false)
  assert.equal(second.shouldMove, true)
})

test('never accepts a backward jump beyond one dialogue block', () => {
  const result = resolveVoiceMatchState({
    currentIndex: 3,
    match: {
      index: 1,
      isConfident: true,
      isExceptionalBackwardMatch: true,
      isImmediateMove: true,
    },
  })

  assert.equal(result.shouldMove, false)
  assert.equal(result.nextIndex, 3)
})

test('movement cooldown prevents an immediate bounce to the prior block', () => {
  const result = resolveVoiceMatchState({
    currentIndex: 2,
    lastMovement: { at: 1000, fromIndex: 1, toIndex: 2 },
    match: {
      index: 1,
      isConfident: true,
      isExceptionalBackwardMatch: true,
      isImmediateMove: true,
    },
    now: 1000 + MOVEMENT_COOLDOWN_MS - 1,
  })

  assert.equal(result.shouldMove, false)
  assert.equal(result.isCooldownBlocked, true)
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

test('a confident current dialogue recovers immediately from Lost', () => {
  const recovered = resolveVoiceMatchState({
    currentIndex: 0,
    lowConfidenceCount: LOST_RESULT_LIMIT,
    match: { index: 0, isConfident: true },
    pendingMatch: { count: 0, index: null },
  })

  assert.equal(recovered.status, 'Following')
  assert.equal(recovered.lowConfidenceCount, 0)
  assert.equal(recovered.shouldMove, false)
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
