export const MANUAL_SCROLL_DISTANCE = 320
export const SCRIPT_WORKSPACE_ROUTE = '/scripts'

function getMaximumScrollTop(viewport) {
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight)
}

export function moveViewport(viewport, distance) {
  if (!viewport) return null

  const nextScrollTop = Math.min(
    getMaximumScrollTop(viewport),
    Math.max(0, viewport.scrollTop + distance),
  )
  viewport.scrollTop = nextScrollTop
  return nextScrollTop
}

export function advanceTimedViewport(viewport, speed, elapsedMs) {
  return moveViewport(viewport, (elapsedMs / 1000) * speed)
}

export function scrollViewportToTop(viewport) {
  if (!viewport) return null

  viewport.scrollTop = 0
  return viewport.scrollTop
}

export function leaveTeleprompter({ navigate, stopTimed, stopVoice }) {
  stopVoice()
  stopTimed()
  navigate(SCRIPT_WORKSPACE_ROUTE)
}

export function createTeleprompterKeyMap(controls, onPrimaryAction) {
  return {
    ' ': onPrimaryAction ?? controls.toggle,
    ArrowLeft: controls.rewind,
    ArrowRight: controls.forward,
    f: controls.toggleFullscreen,
    F: controls.toggleFullscreen,
    Home: controls.jumpToStart,
    Escape: controls.pause,
  }
}
