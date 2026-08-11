import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_VOICE_FOLLOW_TIMINGS,
  mergeVoiceFollowTiming,
} from '../voiceFollow/voiceFollowTimings.js'

test('correlates commit and scroll stages for one visible Voice Follow update', () => {
  let timings = mergeVoiceFollowTiming([], {
    decisionAt: 12,
    id: 1,
    kind: 'block',
    recognitionReceivedAt: 10,
  })
  timings = mergeVoiceFollowTiming(timings, {
    commitAt: 15,
    id: 1,
    scrollRequestedAt: 14,
  })
  timings = mergeVoiceFollowTiming(timings, {
    id: 1,
    scrollSettledAt: 18,
  })

  assert.equal(timings.length, 1)
  assert.equal(timings[0].recognitionToDecisionMs, 2)
  assert.equal(timings[0].recognitionToCommitMs, 5)
  assert.equal(timings[0].recognitionToScrollRequestMs, 4)
  assert.equal(timings[0].scrollRequestToSettledMs, 4)
  assert.equal(timings[0].recognitionToScrollSettledMs, 8)
})

test('does not duplicate a timing entry when a stage is reported more than once', () => {
  const first = mergeVoiceFollowTiming([], {
    id: 7,
    kind: 'word-progress',
    recognitionReceivedAt: 10,
  })
  const repeated = mergeVoiceFollowTiming(first, {
    commitAt: 13,
    id: 7,
  })

  assert.equal(repeated.length, 1)
  assert.equal(repeated[0].commitAt, 13)
})

test('keeps timing history bounded and does no work when diagnostics are disabled', () => {
  let timings = []
  for (let id = 1; id <= MAX_VOICE_FOLLOW_TIMINGS + 5; id += 1) {
    timings = mergeVoiceFollowTiming(timings, { id })
  }

  assert.equal(timings.length, MAX_VOICE_FOLLOW_TIMINGS)
  assert.equal(timings[0].id, 6)
  assert.equal(
    mergeVoiceFollowTiming(timings, { id: 99 }, false),
    timings,
  )
})
