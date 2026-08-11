export const VOICE_READING_ZONE = {
  activeTop: 0.1,
}

export const VOICE_FOLLOW_SCROLL_BEHAVIOR = 'auto'

export function shouldRequestVoiceScroll(pendingBlockIndex, nextBlockIndex) {
  return pendingBlockIndex !== nextBlockIndex
}

export function getVoiceFollowScrollTarget({
  activeBlock,
  previousBlock,
  viewportHeight,
  viewportScrollHeight,
}) {
  if (!activeBlock || !viewportHeight) return 0

  const maximumScrollTop = Math.max(0, viewportScrollHeight - viewportHeight)
  const activeTopTarget =
    activeBlock.top - viewportHeight * VOICE_READING_ZONE.activeTop
  // The prior block is only measured to ensure it leaves the reading area.
  // It is never used as the visual anchor for a Voice Follow transition.
  const priorBlockExitTarget = previousBlock
    ? previousBlock.top + previousBlock.height + 1
    : 0
  const targetTop = Math.max(activeTopTarget, priorBlockExitTarget)

  return Math.min(maximumScrollTop, Math.max(0, targetTop))
}
