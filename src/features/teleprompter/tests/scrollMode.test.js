import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canStartTimedScroll,
  getModeControlEffects,
  getPrimaryControlState,
  SCROLL_MODES,
} from '../scrollMode.js'

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
  assert.deepEqual(getModeControlEffects({
    currentMode: SCROLL_MODES.TIMED,
    isVoiceEnabled: false,
    nextMode: SCROLL_MODES.VOICE,
  }), {
    nextMode: SCROLL_MODES.VOICE,
    startVoice: true,
    stopTimed: true,
    stopVoice: false,
  })
})

test('switching to Timed Scroll stops Voice Follow without auto-playing', () => {
  assert.deepEqual(getModeControlEffects({
    currentMode: SCROLL_MODES.VOICE,
    isVoiceEnabled: true,
    nextMode: SCROLL_MODES.TIMED,
  }), {
    nextMode: SCROLL_MODES.TIMED,
    startVoice: false,
    stopTimed: true,
    stopVoice: true,
  })
})

test('clicking the active Voice Follow control stops listening', () => {
  assert.deepEqual(getModeControlEffects({
    currentMode: SCROLL_MODES.VOICE,
    isVoiceEnabled: true,
    nextMode: SCROLL_MODES.VOICE,
  }), {
    nextMode: SCROLL_MODES.VOICE,
    startVoice: false,
    stopTimed: false,
    stopVoice: true,
  })
})

test('clicking the inactive Voice Follow control restarts listening', () => {
  assert.deepEqual(getModeControlEffects({
    currentMode: SCROLL_MODES.VOICE,
    isVoiceEnabled: false,
    nextMode: SCROLL_MODES.VOICE,
  }), {
    nextMode: SCROLL_MODES.VOICE,
    startVoice: true,
    stopTimed: false,
    stopVoice: false,
  })
})
