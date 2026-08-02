import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldRequestVoiceScroll } from './voiceFollowScroll.js'

test('suppresses repeated scroll requests to the same pending block', () => {
  assert.equal(shouldRequestVoiceScroll(2, 2), false)
})

test('allows a new valid target to replace an obsolete pending scroll', () => {
  assert.equal(shouldRequestVoiceScroll(2, 3), true)
  assert.equal(shouldRequestVoiceScroll(null, 3), true)
})
