import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SnapshotValidationError,
  validateProductionMemorySnapshot,
} from './productionMemoryValidation.js'

const snapshot = {
  productionId: 'demo-script',
  parserMode: 'Auto',
  updatedAt: null,
  items: [
    {
      id: 'recording:A',
      kind: 'recording',
      sourceId: 'A',
      status: 'good',
      isComplete: true,
      description: 'completed section',
      takeCount: 1,
    },
    {
      id: 'asset:D',
      kind: 'asset',
      sourceId: 'D',
      status: 'unchecked',
      isComplete: false,
      description: 'dashboard screenshot',
    },
  ],
}

test('snapshot validation preserves only normalized production-memory fields', () => {
  const validated = validateProductionMemorySnapshot({
    ...snapshot,
    arbitrary: 'discarded',
  })

  assert.equal(validated.arbitrary, undefined)
  assert.deepEqual(validated.items.map((item) => ({
    id: item.id,
    status: item.status,
    isComplete: item.isComplete,
    description: item.description,
  })), [
    {
      id: 'recording:A',
      status: 'good',
      isComplete: true,
      description: 'completed section',
    },
    {
      id: 'asset:D',
      status: 'unchecked',
      isComplete: false,
      description: 'dashboard screenshot',
    },
  ])
})

test('snapshot validation rejects malformed status/completion pairs and duplicate ids', () => {
  assert.throws(
    () => validateProductionMemorySnapshot({
      ...snapshot,
      items: [{ ...snapshot.items[0], isComplete: false }],
    }),
    SnapshotValidationError,
  )
  assert.throws(
    () => validateProductionMemorySnapshot({
      ...snapshot,
      items: [snapshot.items[0], snapshot.items[0]],
    }),
    /Duplicate item id/,
  )
  assert.throws(
    () => validateProductionMemorySnapshot({ productionId: '', items: [] }),
    SnapshotValidationError,
  )
})
