const RECORDING_STATUSES = new Set(['good', 'redo', 'not-recorded'])
const ASSET_STATUSES = new Set(['checked', 'unchecked'])
const MAX_ITEMS = 5000
const MAX_ID_LENGTH = 512
const MAX_DESCRIPTION_LENGTH = 20000

export class SnapshotValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SnapshotValidationError'
  }
}

function requiredString(value, field, maxLength = MAX_ID_LENGTH) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new SnapshotValidationError(`${field} must be a non-empty string.`)
  }
  return value
}

function optionalString(value, field) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') {
    throw new SnapshotValidationError(`${field} must be a string when provided.`)
  }
  return value
}

function optionalTimestamp(value, field) {
  const timestamp = optionalString(value, field)
  if (timestamp && Number.isNaN(Date.parse(timestamp))) {
    throw new SnapshotValidationError(`${field} must be a valid timestamp.`)
  }
  return timestamp
}

function validateItem(item, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new SnapshotValidationError(`items[${index}] must be an object.`)
  }

  const kind = item.kind
  const statuses = kind === 'recording'
    ? RECORDING_STATUSES
    : kind === 'asset'
      ? ASSET_STATUSES
      : null
  if (!statuses) {
    throw new SnapshotValidationError(`items[${index}].kind is invalid.`)
  }
  if (!statuses.has(item.status)) {
    throw new SnapshotValidationError(`items[${index}].status is invalid for ${kind}.`)
  }

  const expectedCompletion = item.status === 'good' || item.status === 'checked'
  if (item.isComplete !== expectedCompletion) {
    throw new SnapshotValidationError(`items[${index}].isComplete does not match its status.`)
  }

  const takeCount = item.takeCount
  if (
    takeCount != null &&
    (!Number.isSafeInteger(takeCount) || takeCount < 0 || takeCount > 4294967295)
  ) {
    throw new SnapshotValidationError(`items[${index}].takeCount is invalid.`)
  }

  return {
    id: requiredString(item.id, `items[${index}].id`),
    kind,
    sourceId: requiredString(item.sourceId, `items[${index}].sourceId`),
    status: item.status,
    isComplete: expectedCompletion,
    description: requiredString(
      item.description,
      `items[${index}].description`,
      MAX_DESCRIPTION_LENGTH,
    ),
    speaker: optionalString(item.speaker, `items[${index}].speaker`),
    takeCount: takeCount ?? null,
    note: optionalString(item.note, `items[${index}].note`),
    updatedAt: optionalTimestamp(item.updatedAt, `items[${index}].updatedAt`),
    assetType: optionalString(item.assetType, `items[${index}].assetType`),
    requirementStatus: optionalString(
      item.requirementStatus,
      `items[${index}].requirementStatus`,
    ),
  }
}

export function validateProductionMemorySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new SnapshotValidationError('Snapshot must be an object.')
  }
  if (!Array.isArray(snapshot.items) || snapshot.items.length > MAX_ITEMS) {
    throw new SnapshotValidationError(`items must be an array with at most ${MAX_ITEMS} entries.`)
  }

  const items = snapshot.items.map(validateItem)
  const ids = new Set()
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new SnapshotValidationError(`Duplicate item id: ${item.id}`)
    }
    ids.add(item.id)
  }

  return {
    productionId: requiredString(snapshot.productionId, 'productionId'),
    parserMode: optionalString(snapshot.parserMode, 'parserMode'),
    updatedAt: optionalTimestamp(snapshot.updatedAt, 'updatedAt'),
    items,
  }
}
