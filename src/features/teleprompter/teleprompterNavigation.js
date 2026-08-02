export const MANUAL_SCROLL_DISTANCE = 320

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
