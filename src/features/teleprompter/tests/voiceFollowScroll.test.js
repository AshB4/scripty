import assert from 'node:assert/strict'
import test from 'node:test'
import {
  VOICE_FOLLOW_SCROLL_BEHAVIOR,
  getVoiceFollowScrollTarget,
  VOICE_READING_ZONE,
  shouldRequestVoiceScroll,
} from '../voiceFollow/voiceFollowScroll.js'
import { findNearestActiveVoiceBlock } from '../voiceFollow/activeBlockTracker.js'

test('suppresses repeated scroll requests to the same pending block', () => {
  assert.equal(shouldRequestVoiceScroll(2, 2), false)
})

test('allows a new valid target to replace an obsolete pending scroll', () => {
  assert.equal(shouldRequestVoiceScroll(2, 3), true)
  assert.equal(shouldRequestVoiceScroll(null, 3), true)
})

test('positions the newly active block at the safe top while moving the prior block out', () => {
  const targetTop = getVoiceFollowScrollTarget({
    activeBlock: { height: 110, top: 1_420 },
    previousBlock: { height: 90, top: 1_240 },
    viewportHeight: 800,
    viewportScrollHeight: 3_000,
  })

  assert.equal(targetTop, 1_420 - 800 * VOICE_READING_ZONE.activeTop)
  assert.equal(1_240 + 90 - targetTop < 0, true)
})

test('prioritizes the beginning of a tall active block and keeps the prior block out', () => {
  const targetTop = getVoiceFollowScrollTarget({
    activeBlock: { height: 1_100, top: 1_800 },
    previousBlock: { height: 110, top: 1_670 },
    viewportHeight: 800,
    viewportScrollHeight: 3_000,
  })
  const activeTop = 1_800 - targetTop

  assert.equal(activeTop, 1_800 - (1_670 + 110 + 1))
  assert.equal(1_670 + 110 - targetTop < 0, true)
})

test('positions a skip-ahead match at the same safe top boundary', () => {
  const targetTop = getVoiceFollowScrollTarget({
    activeBlock: { height: 120, top: 1_700 },
    previousBlock: { height: 90, top: 1_500 },
    viewportHeight: 800,
    viewportScrollHeight: 3_000,
  })

  assert.equal(targetTop, 1_700 - 800 * VOICE_READING_ZONE.activeTop)
  assert.equal(1_500 + 90 - targetTop < 0, true)
})

test('uses immediate browser positioning for confirmed Voice Follow block changes', () => {
  assert.equal(VOICE_FOLLOW_SCROLL_BEHAVIOR, 'auto')
})

test('does not request another scroll while word progress remains on the same block', () => {
  assert.equal(shouldRequestVoiceScroll(4, 4), false)
})

test('bounds manual active-block tracking to the nearby window for long scripts', () => {
  const blocks = Array.from({ length: 483 }, (_, index) => ({
    segmentIndex: index,
  }))
  let geometryReads = 0
  const result = findNearestActiveVoiceBlock({
    blocks,
    currentIndex: 240,
    getBlockBounds: (block) => {
      geometryReads += 1
      return { height: 40, top: block.segmentIndex * 80 }
    },
    viewportCenter: 240 * 80 + 20,
  })

  assert.equal(result, 240)
  assert.ok(geometryReads <= 7)
})
