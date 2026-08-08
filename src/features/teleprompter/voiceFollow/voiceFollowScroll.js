export function shouldRequestVoiceScroll(pendingBlockIndex, nextBlockIndex) {
  return pendingBlockIndex !== nextBlockIndex
}
