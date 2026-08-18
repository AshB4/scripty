import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildProductionMemorySnapshot } from './productionMemorySnapshot.js'

function createAcceptanceInput() {
  return {
    script: 'HOST: Intro\n\nHOST: Pickup line',
    parserMode: 'Generic Teleprompter',
    recordingSections: [
      {
        id: 'section-a',
        note: '',
        speakerLabel: 'Host',
        status: 'good',
        takeCount: 1,
        text: 'Completed intro.',
        updatedAt: '2026-08-11T12:00:00.000Z',
      },
      {
        id: 'section-b',
        note: 'Fix the ending',
        speakerLabel: 'Host',
        status: 'redo',
        takeCount: 2,
        text: 'Redo this section.',
        updatedAt: '2026-08-11T12:05:00.000Z',
      },
      {
        id: 'section-c',
        note: '',
        speakerLabel: 'Narrator',
        status: 'not-recorded',
        takeCount: 0,
        text: 'Record this later.',
        updatedAt: null,
      },
    ],
    checklistItems: [
      {
        completed: false,
        id: 'asset-d',
        kind: 'generated',
        status: 'confirmed',
        text: 'Capture the product close-up.',
        type: 'B_ROLL',
      },
      {
        completed: true,
        id: 'asset-e',
        kind: 'manual',
        text: 'Charge camera batteries.',
      },
    ],
  }
}

test('builds the MVP 6 production-memory acceptance snapshot', () => {
  const snapshot = buildProductionMemorySnapshot(createAcceptanceInput())
  const itemsBySourceId = new Map(
    snapshot.items.map((item) => [item.sourceId, item]),
  )

  assert.equal(itemsBySourceId.get('section-a').isComplete, true)
  assert.equal(itemsBySourceId.get('section-a').status, 'good')
  assert.equal(itemsBySourceId.get('section-b').isComplete, false)
  assert.equal(itemsBySourceId.get('section-b').status, 'redo')
  assert.equal(itemsBySourceId.get('section-c').isComplete, false)
  assert.equal(itemsBySourceId.get('section-c').status, 'not-recorded')
  assert.equal(itemsBySourceId.get('asset-d').isComplete, false)
  assert.equal(itemsBySourceId.get('asset-d').status, 'unchecked')
  assert.equal(itemsBySourceId.get('asset-e').isComplete, true)
  assert.equal(itemsBySourceId.get('asset-e').status, 'checked')
})

test('preserves human-readable descriptions and useful interpretation fields', () => {
  const snapshot = buildProductionMemorySnapshot(createAcceptanceInput())
  const redo = snapshot.items.find((item) => item.sourceId === 'section-b')
  const asset = snapshot.items.find((item) => item.sourceId === 'asset-d')

  assert.equal(redo.description, 'Redo this section.')
  assert.equal(redo.speaker, 'Host')
  assert.equal(redo.takeCount, 2)
  assert.equal(redo.note, 'Fix the ending')
  assert.equal(asset.description, 'Capture the product close-up.')
  assert.equal(asset.assetType, 'B_ROLL')
  assert.equal(asset.requirementStatus, 'confirmed')
})

test('does not include ignored or removed checklist items as unfinished work', () => {
  const snapshot = buildProductionMemorySnapshot({
    checklistItems: [
      {
        completed: false,
        id: 'ignored-asset',
        ignored: true,
        text: 'Do not include ignored item.',
      },
      {
        completed: false,
        id: 'removed-asset',
        removed: true,
        text: 'Do not include removed item.',
      },
      {
        completed: false,
        id: 'active-asset',
        text: 'Include active item.',
      },
    ],
    recordingSections: [],
    script: 'Script',
  })

  assert.deepEqual(
    snapshot.items.map((item) => item.sourceId),
    ['active-asset'],
  )
})

test('does not mutate original input objects', () => {
  const input = createAcceptanceInput()
  const original = structuredClone(input)

  buildProductionMemorySnapshot(input)

  assert.deepEqual(input, original)
})

test('returns deterministic output for the same input', () => {
  const input = createAcceptanceInput()

  assert.deepEqual(
    buildProductionMemorySnapshot(input),
    buildProductionMemorySnapshot(input),
  )
})

test('handles empty state safely', () => {
  assert.deepEqual(buildProductionMemorySnapshot(), {
    productionId: 'Auto:ztntfp',
    parserMode: 'Auto',
    updatedAt: null,
    items: [],
  })
})
