export const ACTIVE_BLOCK_TRACKING_RADIUS = 3

export function findNearestActiveVoiceBlock({
  blocks,
  currentIndex,
  getBlockBounds,
  viewportCenter,
}) {
  if (!blocks.length) return 0

  const safeCurrentIndex = Math.min(
    blocks.length - 1,
    Math.max(0, currentIndex),
  )
  const firstIndex = Math.max(
    0,
    safeCurrentIndex - ACTIVE_BLOCK_TRACKING_RADIUS,
  )
  const lastIndex = Math.min(
    blocks.length - 1,
    safeCurrentIndex + ACTIVE_BLOCK_TRACKING_RADIUS,
  )
  let nearestBlockIndex = safeCurrentIndex
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const bounds = getBlockBounds(blocks[index])
    if (!bounds) continue

    const distance = Math.abs(bounds.top + bounds.height / 2 - viewportCenter)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestBlockIndex = index
    }
  }

  return nearestBlockIndex
}
