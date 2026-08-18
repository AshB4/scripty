import { getScriptFingerprint } from '../scripts/scriptFingerprint.js'

const RECORDING_STATUS_COMPLETION = Object.freeze({
  good: true,
  'not-recorded': false,
  redo: false,
})

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function latestTimestamp(values) {
  const timestamps = values
    .filter((value) => typeof value === 'string' && value)
    .sort()

  return timestamps[timestamps.length - 1] ?? null
}

function buildRecordingItem(section) {
  const status = RECORDING_STATUS_COMPLETION[section?.status]
    === undefined
    ? 'not-recorded'
    : section.status
  const description = normalizeText(section?.text)
  const speaker = normalizeText(section?.speakerLabel ?? section?.speaker)

  return {
    id: `recording:${section.id}`,
    kind: 'recording',
    sourceId: section.id,
    status,
    isComplete: RECORDING_STATUS_COMPLETION[status],
    description,
    ...(speaker ? { speaker } : {}),
    ...(Number.isFinite(section?.takeCount)
      ? { takeCount: Math.max(0, Math.floor(section.takeCount)) }
      : {}),
    ...(normalizeText(section?.note) ? { note: normalizeText(section.note) } : {}),
    ...(typeof section?.updatedAt === 'string' && section.updatedAt
      ? { updatedAt: section.updatedAt }
      : {}),
  }
}

function buildAssetItem(item) {
  const isComplete = item?.completed === true
  return {
    id: `asset:${item.id}`,
    kind: 'asset',
    sourceId: item.id,
    status: isComplete ? 'checked' : 'unchecked',
    isComplete,
    description: normalizeText(item?.text ?? item?.description),
    ...(item?.type ? { assetType: item.type } : {}),
    ...(item?.status ? { requirementStatus: item.status } : {}),
  }
}

export function buildProductionMemorySnapshot({
  checklistItems = [],
  parserMode = 'Auto',
  recordingSections = [],
  script = '',
  updatedAt = null,
} = {}) {
  const recordingItems = recordingSections
    .filter((section) => section?.id && normalizeText(section.text))
    .map(buildRecordingItem)

  const assetItems = checklistItems
    .filter(
      (item) =>
        item?.id &&
        !item.ignored &&
        !item.removed &&
        normalizeText(item.text ?? item.description),
    )
    .map(buildAssetItem)

  const items = [...recordingItems, ...assetItems]

  return {
    productionId: getScriptFingerprint(script, parserMode, {
      preserveWhitespace: true,
    }),
    parserMode,
    updatedAt:
      typeof updatedAt === 'string' && updatedAt
        ? updatedAt
        : latestTimestamp(recordingItems.map((item) => item.updatedAt)),
    items,
  }
}
