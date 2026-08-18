import {
  PRODUCTION_MEMORY_TABLE,
  createProductionMemoryItemsTableSql,
  getProductionMemorySyncStateSql,
  getUnfinishedProductionMemoryItemsSql,
} from './productionMemorySchema.js'

const INSERT_COLUMNS = [
  'production_id',
  'item_id',
  'source_id',
  'kind',
  'status',
  'is_complete',
  'description',
  'updated_at',
  'version',
  'speaker',
  'take_count',
  'note',
  'asset_type',
  'requirement_status',
  'is_deleted',
]

export function clickHouseStringLiteral(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `'${escaped}'`
}

export function createSnapshotVersion({ nowMilliseconds = Date.now(), previousVersion = 0n } = {}) {
  if (!Number.isSafeInteger(nowMilliseconds) || nowMilliseconds < 0) {
    throw new TypeError('nowMilliseconds must be a non-negative safe integer.')
  }
  const previous = BigInt(previousVersion)
  const current = BigInt(nowMilliseconds)
  return (current > previous ? current : previous + 1n).toString()
}

export function serializeJsonEachRow(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n')
}

export function buildProductionMemoryInsertSql(rows) {
  if (!rows.length) return null
  return `INSERT INTO ${PRODUCTION_MEMORY_TABLE} (${INSERT_COLUMNS.join(', ')}) FORMAT JSONEachRow\n${serializeJsonEachRow(rows)}`
}

function resultObjects(result) {
  return result.rows.map((values) => Object.fromEntries(
    result.columns.map((column, index) => [column, values[index]]),
  ))
}

function clickHouseTimestamp(value, fallback) {
  const date = value && !Number.isNaN(Date.parse(value)) ? new Date(value) : fallback
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

function clickHouseBoolean(value) {
  return value === true || value === 1 || value === '1'
}

function itemRow(productionId, item, version, syncedAt) {
  return {
    production_id: productionId,
    item_id: item.id,
    source_id: item.sourceId,
    kind: item.kind,
    status: item.status,
    is_complete: item.isComplete,
    description: item.description,
    updated_at: clickHouseTimestamp(item.updatedAt, syncedAt),
    version: Number(version),
    speaker: item.speaker,
    take_count: item.takeCount,
    note: item.note,
    asset_type: item.assetType,
    requirement_status: item.requirementStatus,
    is_deleted: false,
  }
}

function tombstoneRow(productionId, itemId, version, syncedAt) {
  return {
    production_id: productionId,
    item_id: itemId,
    source_id: '',
    kind: '',
    status: '',
    is_complete: true,
    description: '',
    updated_at: clickHouseTimestamp(null, syncedAt),
    version: Number(version),
    speaker: null,
    take_count: null,
    note: null,
    asset_type: null,
    requirement_status: null,
    is_deleted: true,
  }
}

function mapOutstandingItem(row) {
  return {
    id: String(row.item_id),
    kind: String(row.kind),
    sourceId: String(row.source_id),
    status: String(row.status),
    isComplete: clickHouseBoolean(row.is_complete),
    description: String(row.description),
    ...(row.speaker == null ? {} : { speaker: String(row.speaker) }),
    ...(row.take_count == null ? {} : { takeCount: Number(row.take_count) }),
    ...(row.note == null ? {} : { note: String(row.note) }),
    ...(row.asset_type == null ? {} : { assetType: String(row.asset_type) }),
    ...(row.requirement_status == null
      ? {}
      : { requirementStatus: String(row.requirement_status) }),
    updatedAt: String(row.updated_at),
  }
}

export function createProductionMemoryStore({ now = Date.now, runQuery } = {}) {
  if (typeof runQuery !== 'function') throw new TypeError('runQuery is required.')

  let initialization = null
  let lastIssuedVersion = 0n

  async function initialize() {
    if (!initialization) {
      initialization = runQuery(createProductionMemoryItemsTableSql).catch((error) => {
        initialization = null
        throw error
      })
    }
    await initialization
  }

  return {
    initialize,

    async getOutstanding(productionId) {
      await initialize()
      const result = await runQuery(
        getUnfinishedProductionMemoryItemsSql(clickHouseStringLiteral(productionId)),
      )
      return resultObjects(result)
        .filter((row) => !clickHouseBoolean(row.is_complete) && !clickHouseBoolean(row.is_deleted))
        .map(mapOutstandingItem)
    },

    async sync(snapshot) {
      await initialize()

      const stateResult = await runQuery(
        getProductionMemorySyncStateSql(clickHouseStringLiteral(snapshot.productionId)),
      )
      const previousItems = resultObjects(stateResult)
      const previousVersion = previousItems.reduce((latest, row) => {
        const version = BigInt(row.version ?? 0)
        return version > latest ? version : latest
      }, lastIssuedVersion)
      const nowMilliseconds = now()
      const version = createSnapshotVersion({ nowMilliseconds, previousVersion })
      lastIssuedVersion = BigInt(version)
      const syncedAt = new Date(nowMilliseconds)
      const currentIds = new Set(snapshot.items.map((item) => item.id))
      const removedIds = previousItems
        .filter((row) => !clickHouseBoolean(row.is_deleted) && !currentIds.has(String(row.item_id)))
        .map((row) => String(row.item_id))

      const rows = [
        ...snapshot.items.map((item) => itemRow(
          snapshot.productionId,
          item,
          version,
          syncedAt,
        )),
        ...removedIds.map((itemId) => tombstoneRow(
          snapshot.productionId,
          itemId,
          version,
          syncedAt,
        )),
      ]
      const insertSql = buildProductionMemoryInsertSql(rows)
      if (insertSql) await runQuery(insertSql)

      return {
        itemCount: snapshot.items.length,
        removedItemCount: removedIds.length,
        version,
      }
    },
  }
}
