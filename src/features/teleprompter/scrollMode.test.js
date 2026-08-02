import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canStartTimedScroll,
  getModeSwitchEffects,
  getPrimaryControlState,
  SCROLL_MODES,
} from './scrollMode.js'

test('Timed Scroll and Voice Follow cannot be active simultaneously', () => {
  assert.equal(canStartTimedScroll(SCROLL_MODES.TIMED, false), true)
  assert.equal(canStartTimedScroll(SCROLL_MODES.TIMED, true), false)
  assert.equal(canStartTimedScroll(SCROLL_MODES.VOICE, false), false)
})

test('the primary action remains a listening control in Voice Follow mode', () => {
  assert.deepEqual(
    getPrimaryControlState({
      isTimedPlaying: false,
      isVoiceEnabled: true,
      mode: SCROLL_MODES.VOICE,
    }),
    {
      action: 'voice',
      isActive: true,
      label: 'Stop Listening',
    },
  )
})

test('switching to Voice Follow stops timed playback and starts listening', () => {
  assert.deepEqual(getModeSwitchEffects(SCROLL_MODES.VOICE), {
    nextMode: SCROLL_MODES.VOICE,
    startVoice: true,
    stopTimed: true,
    stopVoice: false,
  })
})

test('switching to Timed Scroll stops Voice Follow without auto-playing', () => {
  assert.deepEqual(getModeSwitchEffects(SCROLL_MODES.TIMED), {
    nextMode: SCROLL_MODES.TIMED,
    startVoice: false,
    stopTimed: true,
    stopVoice: true,
  })
})
