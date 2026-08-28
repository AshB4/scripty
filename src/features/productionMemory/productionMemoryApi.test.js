import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ProductionMemoryApiError,
  syncProductionMemorySnapshot,
} from './productionMemoryApi.js'

test('syncProductionMemorySnapshot posts snapshots to the backend API', async () => {
  const calls = []
  const result = await syncProductionMemorySnapshot(
    { productionId: 'demo', items: [] },
    {
      fetchImpl: async (url, options) => {
        calls.push({ options, url })
        return {
          ok: true,
          async json() {
            return { itemCount: 0, productionId: 'demo' }
          },
        }
      },
    },
  )

  assert.deepEqual(result, { itemCount: 0, productionId: 'demo' })
  assert.equal(calls[0].url, '/api/production-memory/sync')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    items: [],
    productionId: 'demo',
  })
})

test('syncProductionMemorySnapshot normalizes failed responses', async () => {
  await assert.rejects(
    syncProductionMemorySnapshot(
      { productionId: 'demo', items: [] },
      {
        fetchImpl: async () => ({
          ok: false,
          status: 502,
          async json() {
            return { message: 'Not exposed internally.' }
          },
        }),
      },
    ),
    (error) => {
      assert.ok(error instanceof ProductionMemoryApiError)
      assert.equal(error.status, 502)
      assert.equal(error.message, 'Not exposed internally.')
      return true
    },
  )
})

test('syncProductionMemorySnapshot surfaces safe server availability messages', async () => {
  await assert.rejects(
    syncProductionMemorySnapshot(
      { productionId: 'demo', items: [] },
      {
        fetchImpl: async () => ({
          ok: false,
          status: 503,
          async json() {
            return {
              error: 'production_memory_mcp_unavailable',
              message: 'Production memory sync is unavailable because ClickHouse MCP cannot be reached.',
            }
          },
        }),
      },
    ),
    (error) => error instanceof ProductionMemoryApiError &&
      error.status === 503 &&
      error.message === 'Production memory sync is unavailable because ClickHouse MCP cannot be reached.',
  )
})

test('syncProductionMemorySnapshot normalizes network failures', async () => {
  await assert.rejects(
    syncProductionMemorySnapshot(
      { productionId: 'demo', items: [] },
      {
        fetchImpl: async () => {
          throw new Error('socket closed')
        },
      },
    ),
    ProductionMemoryApiError,
  )
})
