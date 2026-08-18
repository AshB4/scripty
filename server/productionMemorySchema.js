export const PRODUCTION_MEMORY_TABLE = 'production_memory_items'

const CURRENT_ITEM_COLUMNS = `
  production_id,
  item_id,
  source_id,
  kind,
  status,
  is_complete,
  description,
  speaker,
  take_count,
  note,
  asset_type,
  requirement_status,
  is_deleted,
  updated_at,
  version`

export const createProductionMemoryItemsTableSql = `
CREATE TABLE IF NOT EXISTS ${PRODUCTION_MEMORY_TABLE}
(
  production_id String,
  item_id String,
  source_id String,
  kind LowCardinality(String),
  status LowCardinality(String),
  is_complete Bool,
  description String,
  updated_at DateTime64(3, 'UTC'),
  version UInt64,
  speaker Nullable(String),
  take_count Nullable(UInt32),
  note Nullable(String),
  asset_type Nullable(String),
  requirement_status Nullable(String),
  is_deleted Bool
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (production_id, item_id)
`.trim()

function currentRowsSubquery({ where = '' } = {}) {
  const whereClause = where ? `\n  WHERE ${where}` : ''

  return `
SELECT
  production_id,
  item_id,
  argMax(source_id, memory.version) AS source_id,
  argMax(kind, memory.version) AS kind,
  argMax(status, memory.version) AS status,
  argMax(is_complete, memory.version) AS is_complete,
  argMax(description, memory.version) AS description,
  tupleElement(argMax(tuple(speaker), memory.version), 1) AS speaker,
  tupleElement(argMax(tuple(take_count), memory.version), 1) AS take_count,
  tupleElement(argMax(tuple(note), memory.version), 1) AS note,
  tupleElement(argMax(tuple(asset_type), memory.version), 1) AS asset_type,
  tupleElement(argMax(tuple(requirement_status), memory.version), 1) AS requirement_status,
  argMax(is_deleted, memory.version) AS is_deleted,
  argMax(updated_at, memory.version) AS updated_at,
  max(memory.version) AS version
FROM ${PRODUCTION_MEMORY_TABLE} AS memory${whereClause}
GROUP BY
  production_id,
  item_id`.trim()
}

export function getCurrentProductionMemoryItemsSql(productionIdParameter = '{production_id:String}') {
  return `
SELECT
${CURRENT_ITEM_COLUMNS}
FROM
(
  ${currentRowsSubquery({ where: `production_id = ${productionIdParameter}` })}
)
WHERE is_deleted = false
ORDER BY kind, item_id
`.trim()
}

export function getUnfinishedProductionMemoryItemsSql(productionIdParameter = '{production_id:String}') {
  return `
SELECT
${CURRENT_ITEM_COLUMNS}
FROM
(
  ${currentRowsSubquery({ where: `production_id = ${productionIdParameter}` })}
)
WHERE is_deleted = false AND is_complete = false
ORDER BY kind, item_id
`.trim()
}

export function getProductionMemorySyncStateSql(productionIdParameter = '{production_id:String}') {
  return `
SELECT
  item_id,
  argMax(is_deleted, memory.version) AS is_deleted,
  max(memory.version) AS version
FROM ${PRODUCTION_MEMORY_TABLE} AS memory
WHERE production_id = ${productionIdParameter}
GROUP BY item_id
ORDER BY item_id
`.trim()
}
