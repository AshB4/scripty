import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildProductionMemoryInsertSql,
  clickHouseStringLiteral,
  createProductionMemoryStore,
  createSnapshotVersion,
} from './productionMemoryStore.js'

const acceptanceItems = [
  ['A', 'recording', 'good', true, 'completed section'],
  ['B', 'recording', 'redo', false, 'redo section'],
  ['C', 'recording', 'not-recorded', false, 'not recorded section'],
  ['D', 'asset', 'unchecked', false, 'dashboard screenshot'],
  ['E', 'asset', 'checked', true, 'logo graphic'],
].map(([sourceId, kind, status, isComplete, description]) => ({
  id: `${kind}:${sourceId}`,
  kind,
  sourceId,
  status,
  isComplete,
  description,
  speaker: null,
  takeCount: null,
  note: null,
  updatedAt: null,
  assetType: null,
  requirementStatus: null,
}))

test('snapshot versions use safe epoch milliseconds and remain monotonic', () => {
  assert.equal(createSnapshotVersion({ nowMilliseconds: 1000, previousVersion: 900n }), '1000')
  assert.equal(createSnapshotVersion({ nowMilliseconds: 1000, previousVersion: 1000n }), '1001')
  assert.equal(createSnapshotVersion({ nowMilliseconds: 999, previousVersion: 1000n }), '1001')
})

test('SQL string literals escape production ids and JSONEachRow safely serializes text', () => {
  assert.equal(clickHouseStringLiteral("demo\\'script\nnext"), "'demo\\\\\\'script\\nnext'")

  const sql = buildProductionMemoryInsertSql([{
    production_id: 'demo-script',
    item_id: 'recording:A',
    description: "quote ' newline\n and \\",
  }])
  const json = sql.slice(sql.indexOf('\n') + 1)
  assert.deepEqual(JSON.parse(json), {
    production_id: 'demo-script',
    item_id: 'recording:A',
    description: "quote ' newline\n and \\",
  })
})

test('sync initializes through MCP, writes current rows, and tombstones removed items', async () => {
  const queries = []
  const runQuery = async (query) => {
    queries.push(query)
    if (query.startsWith('SELECT\n  item_id')) {
      return {
        columns: ['item_id', 'is_deleted', 'version'],
        rows: [
          ['recording:A', false, 900],
          ['asset:removed', false, 900],
          ['asset:old-tombstone', true, 901],
        ],
      }
    }
    return { columns: [], rows: [] }
  }
  const store = createProductionMemoryStore({ now: () => 1000, runQuery })

  const result = await store.sync({
    productionId: 'demo-script',
    items: acceptanceItems,
  })

  assert.deepEqual(result, {
    itemCount: 5,
    removedItemCount: 1,
    version: '1000',
  })
  assert.match(queries[0], /CREATE TABLE IF NOT EXISTS production_memory_items/)
  assert.match(queries[1], /production_id = 'demo-script'/)
  const insertLines = queries[2].split('\n').slice(1).map(JSON.parse)
  assert.equal(insertLines.length, 6)
  assert.deepEqual(insertLines.slice(0, 5).map((row) => row.item_id), [
    'recording:A',
    'recording:B',
    'recording:C',
    'asset:D',
    'asset:E',
  ])
  assert.deepEqual(insertLines[5], {
    production_id: 'demo-script',
    item_id: 'asset:removed',
    source_id: '',
    kind: '',
    status: '',
    is_complete: true,
    description: '',
    updated_at: '1970-01-01 00:00:01.000',
    version: 1000,
    speaker: null,
    take_count: null,
    note: null,
    asset_type: null,
    requirement_status: null,
    is_deleted: true,
  })
})

test('outstanding read returns B, C, D and defensively excludes completed/deleted rows', async () => {
  const columns = [
    'production_id', 'item_id', 'source_id', 'kind', 'status', 'is_complete',
    'description', 'speaker', 'take_count', 'note', 'asset_type',
    'requirement_status', 'is_deleted', 'updated_at', 'version',
  ]
  const dbRow = (item, isDeleted = false) => [
    'demo-script', item.id, item.sourceId, item.kind, item.status, item.isComplete,
    item.description, null, null, null, null, null, isDeleted,
    '2026-08-17 12:00:00.000', 1000,
  ]
  const runQuery = async (query) => {
    if (query.startsWith('CREATE TABLE')) return { columns: [], rows: [] }
    assert.match(query, /WHERE is_deleted = false AND is_complete = false/)
    return {
      columns,
      rows: [
        dbRow(acceptanceItems[1]),
        dbRow(acceptanceItems[2]),
        dbRow(acceptanceItems[3]),
        dbRow(acceptanceItems[0]),
        dbRow({ ...acceptanceItems[3], id: 'asset:removed' }, true),
      ],
    }
  }
  const store = createProductionMemoryStore({ runQuery })

  const items = await store.getOutstanding('demo-script')

  assert.deepEqual(items.map((item) => item.sourceId), ['B', 'C', 'D'])
  assert.deepEqual(items.map((item) => item.description), [
    'redo section',
    'not recorded section',
    'dashboard screenshot',
  ])
  assert.equal(items.every((item) => item.isComplete === false), true)
})
