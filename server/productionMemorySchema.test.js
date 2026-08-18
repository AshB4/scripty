import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PRODUCTION_MEMORY_TABLE,
  createProductionMemoryItemsTableSql,
  getCurrentProductionMemoryItemsSql,
  getProductionMemorySyncStateSql,
  getUnfinishedProductionMemoryItemsSql,
} from './productionMemorySchema.js'

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim()
}

test('production-memory schema defines the required current-state item columns', () => {
  for (const column of [
    'production_id String',
    'item_id String',
    'source_id String',
    'kind LowCardinality(String)',
    'status LowCardinality(String)',
    'is_complete Bool',
    'description String',
    "updated_at DateTime64(3, 'UTC')",
    'version UInt64',
    'speaker Nullable(String)',
    'take_count Nullable(UInt32)',
    'note Nullable(String)',
    'asset_type Nullable(String)',
    'requirement_status Nullable(String)',
    'is_deleted Bool',
  ]) {
    assert.match(createProductionMemoryItemsTableSql, new RegExp(column.replace(/[()]/g, '\\$&')))
  }
})

test('production-memory schema uses item-level ReplacingMergeTree semantics', () => {
  const sql = normalizeSql(createProductionMemoryItemsTableSql)

  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${PRODUCTION_MEMORY_TABLE}`))
  assert.match(sql, /ENGINE = ReplacingMergeTree\(version\)/)
  assert.match(sql, /ORDER BY \(production_id, item_id\)/)
})

test('current production query reads one latest row per production item', () => {
  const sql = normalizeSql(getCurrentProductionMemoryItemsSql())

  assert.match(sql, /production_id = \{production_id:String\}/)
  assert.match(sql, /GROUP BY production_id, item_id/)
  assert.match(sql, /argMax\(status, memory\.version\) AS status/)
  assert.match(sql, /argMax\(is_complete, memory\.version\) AS is_complete/)
  assert.match(
    sql,
    /tupleElement\(argMax\(tuple\(note\), memory\.version\), 1\) AS note/,
  )
  assert.match(sql, /max\(memory\.version\) AS version/)
  assert.match(sql, /WHERE is_deleted = false/)
  assert.doesNotMatch(sql, /\bFINAL\b/)
})

test('unfinished production query filters only after current-state collapse', () => {
  const sql = normalizeSql(getUnfinishedProductionMemoryItemsSql())
  const collapseIndex = sql.indexOf('GROUP BY production_id, item_id')
  const unfinishedFilterIndex = sql.indexOf(
    'WHERE is_deleted = false AND is_complete = false',
  )

  assert.notEqual(collapseIndex, -1)
  assert.notEqual(unfinishedFilterIndex, -1)
  assert.equal(unfinishedFilterIndex > collapseIndex, true)
  assert.match(sql, /WHERE is_deleted = false AND is_complete = false/)
})

test('queries accept an explicit production id parameter expression', () => {
  assert.match(
    getUnfinishedProductionMemoryItemsSql("'demo-script'"),
    /production_id = 'demo-script'/,
  )
})

test('sync-state query retains tombstones and latest versions for stale-item handling', () => {
  const sql = normalizeSql(getProductionMemorySyncStateSql("'demo-script'"))

  assert.match(sql, /argMax\(is_deleted, memory\.version\) AS is_deleted/)
  assert.match(sql, /max\(memory\.version\) AS version/)
  assert.match(sql, /GROUP BY item_id/)
  assert.doesNotMatch(sql, /is_deleted = false/)
})
