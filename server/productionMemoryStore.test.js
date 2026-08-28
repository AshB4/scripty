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

const stateColumns = [
  'production_id', 'item_id', 'source_id', 'kind', 'status', 'is_complete',
  'description', 'speaker', 'take_count', 'note', 'asset_type',
  'requirement_status', 'is_deleted', 'updated_at', 'version',
]

function serializeMcpClickHouseValue(column, value) {
  if (value == null || column !== 'updated_at') return value

  const match = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(?:\.(\d+))?$/.exec(value)
  if (!match) return value
  const [, date, time, fractionalSeconds] = match
  const fraction = fractionalSeconds ? `.${fractionalSeconds.padEnd(6, '0')}` : ''
  return `${date} ${time}${fraction}+00:00`
}

function createSyncHarness(items = acceptanceItems, { serializeMcpRows = false } = {}) {
  const persistedById = new Map()
  const inserts = []
  let nowMilliseconds = 1000
  const runQuery = async (query) => {
    if (query.startsWith('CREATE TABLE')) return { columns: [], rows: [] }
    if (query.startsWith('SELECT')) {
      return {
        columns: stateColumns,
        rows: [...persistedById.values()].map((row) =>
          stateColumns.map((column) => serializeMcpRows
            ? serializeMcpClickHouseValue(column, row[column])
            : row[column]),
        ),
      }
    }
    if (query.startsWith('INSERT')) {
      const rows = query.slice(query.indexOf('\n') + 1).split('\n').map(JSON.parse)
      inserts.push(rows)
      rows.forEach((row) => persistedById.set(row.item_id, row))
      return { columns: [], rows: [] }
    }
    throw new Error(`Unexpected query: ${query}`)
  }
  const store = createProductionMemoryStore({
    now: () => nowMilliseconds++,
    runQuery,
  })

  return {
    inserts,
    sync(nextItems = items) {
      return store.sync({ productionId: 'demo-script', items: nextItems })
    },
  }
}

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
    if (query.startsWith('SELECT')) {
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

test('initial sync writes every snapshot item and an unchanged repeat writes nothing', async () => {
  const harness = createSyncHarness()

  await harness.sync()
  const repeated = await harness.sync()

  assert.equal(harness.inserts.length, 1)
  assert.deepEqual(
    harness.inserts[0].map((row) => row.item_id),
    acceptanceItems.map((item) => item.id),
  )
  assert.deepEqual(repeated, {
    itemCount: acceptanceItems.length,
    removedItemCount: 0,
    version: '1000',
  })
})

test('sync writes only items whose persisted state changed', async () => {
  const harness = createSyncHarness()
  await harness.sync()
  const changedItems = acceptanceItems.map((item) =>
    item.id === 'recording:B'
      ? { ...item, isComplete: true, status: 'good', takeCount: 3 }
      : item,
  )

  await harness.sync(changedItems)

  assert.deepEqual(harness.inserts[1].map((row) => row.item_id), ['recording:B'])
})

test('sync writes only multiple items whose persisted state changed', async () => {
  const harness = createSyncHarness()
  await harness.sync()
  const changedItems = acceptanceItems.map((item) => {
    if (item.id === 'recording:B') return { ...item, note: 'Try closer framing.' }
    if (item.id === 'asset:D') return { ...item, assetType: 'IMAGE' }
    return item
  })

  await harness.sync(changedItems)

  assert.deepEqual(harness.inserts[1].map((row) => row.item_id), [
    'recording:B',
    'asset:D',
  ])
})

test('sync writes only a new item when the rest of a snapshot is unchanged', async () => {
  const harness = createSyncHarness()
  await harness.sync()
  const addedItem = {
    assetType: 'SCREEN_RECORDING',
    description: 'Analytics dashboard',
    id: 'asset:analytics',
    isComplete: false,
    kind: 'asset',
    note: null,
    requirementStatus: 'confirmed',
    sourceId: 'analytics',
    speaker: null,
    status: 'unchecked',
    takeCount: null,
    updatedAt: null,
  }

  await harness.sync([...acceptanceItems, addedItem])

  assert.deepEqual(harness.inserts[1].map((row) => row.item_id), ['asset:analytics'])
})

test('sync writes one tombstone when an active item is removed', async () => {
  const harness = createSyncHarness()
  await harness.sync()

  await harness.sync(acceptanceItems.filter((item) => item.id !== 'asset:E'))

  assert.deepEqual(harness.inserts[1].map((row) => row.item_id), ['asset:E'])
  assert.equal(harness.inserts[1][0].is_deleted, true)
})

test('sync writes changed rows and tombstones together without rewriting unchanged items', async () => {
  const harness = createSyncHarness()
  await harness.sync()
  const nextItems = acceptanceItems
    .filter((item) => item.id !== 'asset:E')
    .map((item) => item.id === 'recording:B'
      ? { ...item, note: 'Use pickup.' }
      : item)

  await harness.sync(nextItems)

  assert.deepEqual(harness.inserts[1].map((row) => row.item_id), [
    'recording:B',
    'asset:E',
  ])
  assert.equal(harness.inserts[1][1].is_deleted, true)
})

test('sync compares nullable fields and source timestamps without rewriting derived sync timestamps', async () => {
  const harness = createSyncHarness()
  const items = acceptanceItems.map((item) => item.id === 'recording:B'
    ? {
      ...item,
      assetType: null,
      note: null,
      requirementStatus: null,
      speaker: null,
      takeCount: null,
      updatedAt: '2026-08-17T12:00:00.000Z',
    }
    : item)
  await harness.sync(items)
  await harness.sync(items)

  const changedNullableField = items.map((item) => item.id === 'recording:B'
    ? { ...item, note: 'Changed note.' }
    : item)
  await harness.sync(changedNullableField)

  assert.equal(harness.inserts.length, 2)
  assert.deepEqual(harness.inserts[1].map((row) => row.item_id), ['recording:B'])
})

test('sync compares recording fields against real MCP ClickHouse row serialization', async () => {
  const recordingItems = Array.from({ length: 6 }, (_, index) => ({
    id: `recording:${index + 1}`,
    sourceId: String(index + 1),
    kind: 'recording',
    status: index === 0 ? 'good' : 'not-recorded',
    isComplete: index === 0,
    description: `Recording ${index + 1}`,
    speaker: index % 2 === 0 ? 'ASH' : null,
    takeCount: index === 0 ? 2 : null,
    note: index === 4 ? 'Frame the dashboard.' : null,
    updatedAt: `2026-08-17T12:00:0${index}.123Z`,
    assetType: null,
    requirementStatus: null,
  }))
  const items = [
    ...recordingItems,
    {
      ...acceptanceItems[3],
      assetType: 'SCREENSHOT',
      requirementStatus: 'confirmed',
    },
    acceptanceItems[4],
  ]
  const harness = createSyncHarness(items, { serializeMcpRows: true })

  await harness.sync()

  const oneChanged = items.map((item) => item.id === 'recording:2'
    ? {
      ...item,
      status: 'redo',
      note: 'Try a tighter take.',
      takeCount: 3,
      updatedAt: '2026-08-17T12:05:00.456Z',
    }
    : item)
  await harness.sync(oneChanged)
  assert.deepEqual(harness.inserts[1].map((row) => row.item_id), ['recording:2'])

  const twoChanged = oneChanged.map((item) => {
    if (item.id === 'recording:3') {
      return { ...item, speaker: 'ROBOT', updatedAt: '2026-08-17T12:06:00.789Z' }
    }
    if (item.id === 'recording:5') {
      return { ...item, isComplete: true, status: 'good', updatedAt: '2026-08-17T12:07:00.001Z' }
    }
    return item
  })
  await harness.sync(twoChanged)
  assert.deepEqual(harness.inserts[2].map((row) => row.item_id), [
    'recording:3',
    'recording:5',
  ])

  await harness.sync(twoChanged)
  assert.equal(harness.inserts.length, 3)
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
