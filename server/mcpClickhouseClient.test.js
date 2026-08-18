import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  McpClickhouseError,
  createMcpClickhouseClient,
} from './mcpClickhouseClient.js'

function clientWithResult(result, calls) {
  return {
    async callTool(call) {
      calls.push(call)
      return result
    },
    async close() {},
    async connect(transport) {
      calls.push({ transport })
    },
  }
}

test('MCP client calls the official run_query tool and normalizes text results', async () => {
  const calls = []
  const transport = { type: 'test-transport' }
  const client = createMcpClickhouseClient({
    mcpUrl: 'http://127.0.0.1:8000/mcp',
    clientFactory: () => clientWithResult({
      content: [{
        type: 'text',
        text: '{"columns":["answer"],"rows":[[1]]}',
      }],
    }, calls),
    transportFactory: (url) => {
      assert.equal(url, 'http://127.0.0.1:8000/mcp')
      return transport
    },
  })

  const result = await client.runQuery('SELECT 1 AS answer')

  assert.deepEqual(result, { columns: ['answer'], rows: [[1]] })
  assert.deepEqual(calls, [
    { transport },
    { name: 'run_query', arguments: { query: 'SELECT 1 AS answer' } },
  ])
})

test('MCP client supports FastMCP structured string results', async () => {
  const client = createMcpClickhouseClient({
    mcpUrl: 'http://127.0.0.1:8000/mcp',
    clientFactory: () => clientWithResult({
      content: [],
      structuredContent: {
        result: '{"columns":[],"rows":[]}',
      },
    }, []),
    transportFactory: () => ({}),
  })

  assert.deepEqual(await client.runQuery('CREATE TABLE example (id UInt8)'), {
    columns: [],
    rows: [],
  })
})

test('MCP client surfaces connection and tool failures explicitly', async () => {
  const connectionFailure = createMcpClickhouseClient({
    mcpUrl: 'http://127.0.0.1:8000/mcp',
    clientFactory: () => ({
      async connect() { throw new Error('connection refused') },
    }),
    transportFactory: () => ({}),
  })
  const toolFailure = createMcpClickhouseClient({
    mcpUrl: 'http://127.0.0.1:8000/mcp',
    clientFactory: () => clientWithResult({ isError: true, content: [] }, []),
    transportFactory: () => ({}),
  })

  await assert.rejects(
    connectionFailure.runQuery('SELECT 1'),
    (error) => error instanceof McpClickhouseError && /Unable to execute/.test(error.message),
  )
  await assert.rejects(
    toolFailure.runQuery('INSERT INTO example VALUES (1)'),
    (error) => error instanceof McpClickhouseError && /rejected/.test(error.message),
  )
})
