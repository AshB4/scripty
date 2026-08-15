const EMPTY_STATE = Object.freeze({
  completedItemIds: [],
  completedReminderIds: [],
  manualItems: [],
  removedGeneratedIds: [],
  updatedAt: null,
})

const SHOOT_REQUIREMENT_TYPES = new Set([
  'PRODUCTION_CUE',
  'B_ROLL',
  'IMAGE_GRAPHIC',
  'SCREEN_RECORDING',
  'AI_VIDEO',
  'CAMERA_CUT',
  'PROP',
])

function uniqueStrings(values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value) => typeof value === 'string' && value))]
}

export function normalizeShootChecklistState(value) {
  const completedItemIds = uniqueStrings(value?.completedItemIds)
  const completedReminderIds = uniqueStrings(value?.completedReminderIds)
  const removedGeneratedIds = uniqueStrings(value?.removedGeneratedIds)
  const manualItems = Array.isArray(value?.manualItems)
    ? value.manualItems
        .filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            item.id &&
            typeof item.text === 'string' &&
            item.text.trim(),
        )
        .map((item) => ({ id: item.id, text: item.text.trim() }))
        .filter(
          (item, index, items) =>
            items.findIndex((candidate) => candidate.id === item.id) === index,
        )
    : []

  return {
    completedItemIds,
    completedReminderIds,
    manualItems,
    removedGeneratedIds,
    updatedAt:
      typeof value?.updatedAt === 'string' && value.updatedAt
        ? value.updatedAt
        : null,
  }
}

export function buildReminderChecklistItems(reminders = [], state = EMPTY_STATE) {
  const completedIds = new Set(
    normalizeShootChecklistState(state).completedReminderIds,
  )

  return reminders.map((reminder) => ({
    ...reminder,
    completed: completedIds.has(reminder.id),
  }))
}

export function toggleReminderChecklistItem(state, reminderId) {
  const normalized = normalizeShootChecklistState(state)
  const completed = new Set(normalized.completedReminderIds)
  if (completed.has(reminderId)) completed.delete(reminderId)
  else completed.add(reminderId)

  return { ...normalized, completedReminderIds: [...completed] }
}

export function buildShootChecklistItems(requirements = [], state = EMPTY_STATE) {
  const normalized = normalizeShootChecklistState(state)
  const completedIds = new Set(normalized.completedItemIds)
  const removedIds = new Set(normalized.removedGeneratedIds)
  const seenRequirements = new Set()
  const generatedItems = requirements
    .filter(
      (requirement) =>
        requirement &&
        !requirement.ignored &&
        SHOOT_REQUIREMENT_TYPES.has(requirement.type) &&
        typeof requirement.id === 'string' &&
        typeof requirement.description === 'string',
    )
    .filter((requirement) => {
      const signature = `${requirement.type}:${requirement.description
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()}`
      if (seenRequirements.has(signature)) return false
      seenRequirements.add(signature)
      return true
    })
    .filter((requirement) => !removedIds.has(requirement.id))
    .map((requirement) => ({
      completed: completedIds.has(requirement.id),
      id: requirement.id,
      kind: 'generated',
      sourceText: requirement.sourceText,
      status: requirement.status,
      text: requirement.description,
      type: requirement.type,
    }))
  const manualItems = normalized.manualItems.map((item) => ({
    completed: completedIds.has(item.id),
    id: item.id,
    kind: 'manual',
    text: item.text,
  }))

  return [...generatedItems, ...manualItems]
}

export function getShootChecklistProgress(items = []) {
  const completed = items.filter((item) => item.completed).length
  const total = items.length

  return {
    completed,
    isComplete: total > 0 && completed === total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    total,
  }
}

export function toggleShootChecklistItem(state, itemId) {
  const normalized = normalizeShootChecklistState(state)
  const completed = new Set(normalized.completedItemIds)
  if (completed.has(itemId)) completed.delete(itemId)
  else completed.add(itemId)

  return { ...normalized, completedItemIds: [...completed] }
}

export function addManualShootChecklistItem(state, text) {
  const normalized = normalizeShootChecklistState(state)
  const value = String(text ?? '').trim()
  if (!value) return normalized

  const existingIds = new Set(normalized.manualItems.map((item) => item.id))
  let suffix = normalized.manualItems.length + 1
  while (existingIds.has(`manual-${suffix}`)) suffix += 1

  return {
    ...normalized,
    manualItems: [
      ...normalized.manualItems,
      { id: `manual-${suffix}`, text: value },
    ],
  }
}

export function removeShootChecklistItem(state, item) {
  const normalized = normalizeShootChecklistState(state)
  const completedItemIds = normalized.completedItemIds.filter(
    (itemId) => itemId !== item.id,
  )

  if (item.kind === 'manual') {
    return {
      ...normalized,
      completedItemIds,
      manualItems: normalized.manualItems.filter(
        (manualItem) => manualItem.id !== item.id,
      ),
    }
  }

  return {
    ...normalized,
    completedItemIds,
    removedGeneratedIds: uniqueStrings([
      ...normalized.removedGeneratedIds,
      item.id,
    ]),
  }
}
