import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProductionMemorySyncController,
  getProductionMemorySnapshotKey,
} from './useProductionMemorySync.js'

function createScheduler() {
  const timers = new Map()
  let nextId = 1
  return {
    cancel(id) {
      timers.delete(id)
    },
    runAll() {
      const callbacks = [...timers.values()]
      timers.clear()
      callbacks.forEach((callback) => callback())
    },
    schedule(callback) {
      const id = nextId
      nextId += 1
      timers.set(id, callback)
      return id
    },
    size() {
      return timers.size
    },
  }
}

function snapshot(id, status = 'not-recorded') {
  return {
    items: [{
      description: id,
      id: `recording:${id}`,
      isComplete: status === 'good',
      kind: 'recording',
      sourceId: id,
      status,
    }],
    parserMode: 'Auto',
    productionId: 'demo',
    updatedAt: null,
  }
}

test('getProductionMemorySnapshotKey is stable for identical snapshots', () => {
  assert.equal(
    getProductionMemorySnapshotKey(snapshot('a')),
    getProductionMemorySnapshotKey(snapshot('a')),
  )
})

test('debounces rapid changes and syncs only the latest snapshot', async () => {
  const scheduler = createScheduler()
  const synced = []
  const controller = createProductionMemorySyncController({
    cancel: scheduler.cancel,
    schedule: scheduler.schedule,
    syncSnapshot: async (value) => {
      synced.push(value)
      return { ok: true }
    },
  })

  controller.schedule(snapshot('a'))
  controller.schedule(snapshot('b', 'redo'))
  controller.schedule(snapshot('c', 'good'))

  assert.equal(scheduler.size(), 1)
  scheduler.runAll()
  await controller.syncNow()

  assert.deepEqual(
    synced.map((value) => value.items[0].sourceId),
    ['c'],
  )
})

test('does not sync duplicate unchanged snapshots unnecessarily', async () => {
  const scheduler = createScheduler()
  let calls = 0
  const controller = createProductionMemorySyncController({
    cancel: scheduler.cancel,
    schedule: scheduler.schedule,
    syncSnapshot: async () => {
      calls += 1
      return { ok: true }
    },
  })
  const value = snapshot('a')

  await controller.syncNow(value)
  controller.schedule(value)
  scheduler.runAll()

  assert.equal(calls, 1)
})

test('force sync bypasses debounce', async () => {
  const scheduler = createScheduler()
  const synced = []
  const controller = createProductionMemorySyncController({
    cancel: scheduler.cancel,
    schedule: scheduler.schedule,
    syncSnapshot: async (value) => {
      synced.push(value.items[0].sourceId)
      return { ok: true }
    },
  })

  controller.schedule(snapshot('scheduled'))
  await controller.syncNow(snapshot('forced'))

  assert.deepEqual(synced, ['forced'])
  assert.equal(scheduler.size(), 0)
})

test('latest snapshot wins when state changes during an in-flight sync', async () => {
  let releaseFirst
  const synced = []
  const controller = createProductionMemorySyncController({
    syncSnapshot: (value) => {
      synced.push(value.items[0].sourceId)
      if (synced.length === 1) {
        return new Promise((resolve) => {
          releaseFirst = () => resolve({ ok: true })
        })
      }
      return Promise.resolve({ ok: true })
    },
  })

  const first = controller.syncNow(snapshot('first'))
  await Promise.resolve()
  const second = controller.syncNow(snapshot('second'))
  releaseFirst()
  await first
  await second

  assert.deepEqual(synced, ['first', 'second'])
})

test('failed sync reports quietly and can retry unchanged local state', async () => {
  const errors = []
  let shouldFail = true
  let calls = 0
  const controller = createProductionMemorySyncController({
    onError: (error) => errors.push(error.message),
    syncSnapshot: async () => {
      calls += 1
      if (shouldFail) throw new Error('offline')
      return { ok: true }
    },
  })
  const value = snapshot('a')

  const failed = await controller.syncNow(value)
  shouldFail = false
  const retried = await controller.syncNow(value)

  assert.equal(failed.ok, false)
  assert.equal(retried.ok, true)
  assert.deepEqual(errors, ['offline'])
  assert.equal(calls, 2)
})
