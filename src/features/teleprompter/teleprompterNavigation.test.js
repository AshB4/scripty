import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceTimedViewport,
  createTeleprompterKeyMap,
  MANUAL_SCROLL_DISTANCE,
  moveViewport,
} from './teleprompterNavigation.js'

function createViewport(scrollTop = 500) {
  return { clientHeight: 800, scrollHeight: 2400, scrollTop }
}

test('forward and rewind move immediately while Timed Scroll is paused', () => {
  const viewport = createViewport()

  moveViewport(viewport, MANUAL_SCROLL_DISTANCE)
  assert.equal(viewport.scrollTop, 820)
  moveViewport(viewport, -MANUAL_SCROLL_DISTANCE)
  assert.equal(viewport.scrollTop, 500)
})

test('Timed Scroll continues from a manual navigation position while playing', () => {
  const viewport = createViewport()

  moveViewport(viewport, MANUAL_SCROLL_DISTANCE)
  advanceTimedViewport(viewport, 60, 500)
  assert.equal(viewport.scrollTop, 850)

  moveViewport(viewport, -MANUAL_SCROLL_DISTANCE)
  advanceTimedViewport(viewport, 60, 500)
  assert.equal(viewport.scrollTop, 560)
})

test('manual navigation is available during countdown without changing mode', () => {
  const viewport = createViewport()
  const mode = 'timed'

  moveViewport(viewport, MANUAL_SCROLL_DISTANCE)

  assert.equal(viewport.scrollTop, 820)
  assert.equal(mode, 'timed')
})

test('keyboard navigation uses the same controls in timed and voice modes', () => {
  const calls = []
  const controls = {
    forward: () => calls.push('forward'),
    jumpToStart: () => calls.push('home'),
    pause: () => calls.push('pause'),
    rewind: () => calls.push('rewind'),
    toggle: () => calls.push('timed-primary'),
    toggleFullscreen: () => calls.push('fullscreen'),
  }
  const timedKeys = createTeleprompterKeyMap(controls)
  const voiceKeys = createTeleprompterKeyMap(controls, () =>
    calls.push('voice-primary'),
  )

  timedKeys.ArrowLeft()
  timedKeys.ArrowRight()
  voiceKeys.ArrowLeft()
  voiceKeys.ArrowRight()
  timedKeys[' ']()
  voiceKeys[' ']()

  assert.deepEqual(calls, [
    'rewind',
    'forward',
    'rewind',
    'forward',
    'timed-primary',
    'voice-primary',
  ])
})
