import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { loadServerConfig } from './config.js'
import {
  createScriptyRequestHandler,
  handleScriptyRequest,
} from './index.js'
import { McpClickhouseError } from './mcpClickhouseClient.js'

async function request(handler, method, url, payload) {
  let statusCode = null
  let headers = null
  let body = ''
  const serialized = payload === undefined
    ? null
    : typeof payload === 'string'
      ? payload
      : JSON.stringify(payload)
  const incoming = serialized == null ? Readable.from([]) : Readable.from([serialized])
  incoming.method = method
  incoming.url = url
  incoming.headers = serialized == null
    ? {}
    : { 'content-length': String(Buffer.byteLength(serialized)) }

  await handler(incoming, {
    writeHead(nextStatusCode, nextHeaders) {
      statusCode = nextStatusCode
      headers = nextHeaders
    },
    end(value) {
      body = String(value ?? '')
    },
  })

  return {
    body,
    headers,
    json: JSON.parse(body),
    statusCode,
  }
}

const validSnapshot = {
  productionId: 'demo-script',
  parserMode: 'Auto',
  updatedAt: '2026-08-17T12:00:00.000Z',
  items: [{
    id: 'recording:A',
    kind: 'recording',
    sourceId: 'A',
    status: 'good',
    isComplete: true,
    description: 'completed section',
  }],
}

test('GET /api/health returns the expected JSON response', async () => {
  const response = await request(handleScriptyRequest, 'GET', '/api/health')

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8')
  assert.deepEqual(response.json, { status: 'ok' })
})

test('unknown API routes return JSON 404s', async () => {
  const response = await request(handleScriptyRequest, 'GET', '/api/missing')

  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json, { error: 'not_found' })
})

test('POST Gemini Prepare forwards only validated parser segments to the server agent', async () => {
  let receivedRequest = null
  const handler = createScriptyRequestHandler({
    geminiPrepareAgent: {
      async classify(request) {
        receivedRequest = request
        return {
          classifications: [
            { id: '1-dialogue', status: null, type: 'SPOKEN' },
          ],
        }
      },
    },
  })

  const response = await request(handler, 'POST', '/api/prepare/classify', {
    parserMode: 'Auto',
    parserSegments: [{
      id: '1-dialogue',
      text: 'Original source text.',
      type: 'dialogue',
    }],
    script: 'This raw script is not part of the Gemini boundary.',
  })

  assert.equal(response.statusCode, 200)
  assert.equal(receivedRequest.script, undefined)
  assert.deepEqual(response.json, {
    classifications: [{ id: '1-dialogue', status: null, type: 'SPOKEN' }],
  })
})

test('POST Gemini Prepare rejects malformed parser segments without calling Gemini', async () => {
  let calls = 0
  const handler = createScriptyRequestHandler({
    geminiPrepareAgent: { async classify() { calls += 1 } },
  })

  const response = await request(handler, 'POST', '/api/prepare/classify', {
    parserMode: 'Auto',
    parserSegments: [{ id: 'parser-id', text: '', type: 'dialogue' }],
  })

  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.json, { error: 'invalid_prepare_request' })
  assert.equal(calls, 0)
})

test('server config reads backend and MCP settings with local defaults', () => {
  assert.deepEqual(loadServerConfig({}), {
    clickhouseMcpAuthToken: null,
    clickhouseMcpUrl: null,
    googleAgentModel: 'gemini-2.5-flash',
    googleCloudLocation: 'us-central1',
    googleCloudProject: null,
    googleGenAiUseVertexAi: true,
    port: 8787,
  })
  assert.deepEqual(loadServerConfig({
    CLICKHOUSE_MCP_AUTH_TOKEN: 'test-token',
    CLICKHOUSE_MCP_URL: 'https://mcp.example.test/mcp',
    GOOGLE_AGENT_MODEL: 'gemini-test-flash',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_CLOUD_PROJECT: 'test-project',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
    PORT: '9090',
  }), {
    clickhouseMcpAuthToken: 'test-token',
    clickhouseMcpUrl: 'https://mcp.example.test/mcp',
    googleAgentModel: 'gemini-test-flash',
    googleCloudLocation: 'global',
    googleCloudProject: 'test-project',
    googleGenAiUseVertexAi: true,
    port: 9090,
  })
  assert.throws(() => loadServerConfig({ PORT: 'nope' }), /PORT/)
  assert.throws(
    () => loadServerConfig({ CLICKHOUSE_MCP_URL: 'not a url' }),
    /CLICKHOUSE_MCP_URL/,
  )
  assert.throws(
    () => loadServerConfig({ GOOGLE_GENAI_USE_VERTEXAI: 'false' }),
    /GOOGLE_GENAI_USE_VERTEXAI/,
  )
})

test('POST production-memory sync validates and forwards a normalized snapshot', async () => {
  let receivedSnapshot = null
  const handler = createScriptyRequestHandler({
    productionMemoryStore: {
      async sync(snapshot) {
        receivedSnapshot = snapshot
        return { itemCount: 1, removedItemCount: 0, version: '1000' }
      },
    },
  })

  const response = await request(
    handler,
    'POST',
    '/api/production-memory/sync',
    { ...validSnapshot, ignoredField: 'not forwarded' },
  )

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json, {
    productionId: 'demo-script',
    itemCount: 1,
    removedItemCount: 0,
    version: '1000',
  })
  assert.equal(receivedSnapshot.ignoredField, undefined)
})

test('POST production-memory sync rejects malformed payloads', async () => {
  let calls = 0
  const handler = createScriptyRequestHandler({
    productionMemoryStore: { async sync() { calls += 1 } },
  })

  const response = await request(
    handler,
    'POST',
    '/api/production-memory/sync',
    { ...validSnapshot, items: [{ ...validSnapshot.items[0], isComplete: false }] },
  )

  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.json, { error: 'invalid_snapshot' })
  assert.equal(calls, 0)
})

test('POST production-memory ask validates and returns the normalized ADK response', async () => {
  let receivedRequest = null
  const handler = createScriptyRequestHandler({
    productionMemoryAgent: {
      async ask(request) {
        receivedRequest = request
        return {
          answer: 'Redo: redo section. Not Recorded: missing section.',
          toolUse: { usedMcp: true, toolName: 'run_query' },
        }
      },
    },
  })

  const response = await request(handler, 'POST', '/api/production-memory/ask', {
    productionId: ' demo-script ',
    question: ' What do I still need to finish? ',
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(receivedRequest, {
    productionId: 'demo-script',
    question: 'What do I still need to finish?',
  })
  assert.deepEqual(response.json, {
    productionId: 'demo-script',
    answer: 'Redo: redo section. Not Recorded: missing section.',
    toolUse: { usedMcp: true, toolName: 'run_query' },
  })
})

test('POST production-memory ask rejects malformed payloads and returns safe agent errors', async () => {
  const invalidHandler = createScriptyRequestHandler({
    productionMemoryAgent: { async ask() { throw new Error('should not run') } },
  })
  const invalidResponse = await request(
    invalidHandler,
    'POST',
    '/api/production-memory/ask',
    { productionId: 'demo-script' },
  )

  const failingHandler = createScriptyRequestHandler({
    productionMemoryAgent: { async ask() { throw new Error('secret Gemini/MCP detail') } },
  })
  const failingResponse = await request(
    failingHandler,
    'POST',
    '/api/production-memory/ask',
    { productionId: 'demo-script', question: 'What do I still need to finish?' },
  )

  assert.equal(invalidResponse.statusCode, 400)
  assert.deepEqual(invalidResponse.json, { error: 'invalid_production_memory_question' })
  assert.equal(failingResponse.statusCode, 502)
  assert.deepEqual(failingResponse.json, { error: 'production_memory_ask_failed' })
  assert.doesNotMatch(failingResponse.body, /secret Gemini\/MCP detail/)
})

test('POST production-memory ask maps failed MCP queries to a safe non-200 response', async () => {
  const handler = createScriptyRequestHandler({
    productionMemoryAgent: {
      async ask() {
        throw new Error('SSE stream disconnected: AbortError')
      },
    },
  })

  const response = await request(handler, 'POST', '/api/production-memory/ask', {
    productionId: 'demo-script',
    question: 'What needs another take?',
  })

  assert.equal(response.statusCode, 502)
  assert.deepEqual(response.json, { error: 'production_memory_ask_failed' })
  assert.doesNotMatch(response.body, /AbortError/)
})

test('production-memory sync returns a safe 503 and logs unreachable ClickHouse MCP failures', async () => {
  const connectionError = new Error('connect ECONNREFUSED 127.0.0.1:8000')
  connectionError.code = 'ECONNREFUSED'
  const upstreamError = new McpClickhouseError(
    'Unable to execute query through mcp-clickhouse.',
    { cause: connectionError },
  )
  const errors = []
  const handler = createScriptyRequestHandler({
    logger: { error(...args) { errors.push(args) } },
    productionMemoryStore: { async sync() { throw upstreamError } },
  })

  const response = await request(
    handler,
    'POST',
    '/api/production-memory/sync',
    validSnapshot,
  )

  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json, {
    error: 'production_memory_mcp_unavailable',
    message: 'Production memory sync is unavailable because ClickHouse MCP cannot be reached.',
  })
  assert.equal(errors.length, 1)
  assert.equal(errors[0][0], 'Production memory sync failed.')
  assert.equal(errors[0][1], upstreamError)
  assert.doesNotMatch(response.body, /ECONNREFUSED/)
})

test('production-memory routes map malformed MCP responses to safe 502 errors', async () => {
  const errors = []
  const handler = createScriptyRequestHandler({
    logger: { error(...args) { errors.push(args) } },
    productionMemoryStore: {
      async getOutstanding() {
        throw new McpClickhouseError('mcp-clickhouse returned invalid JSON.')
      },
      async sync() {
        throw new McpClickhouseError('mcp-clickhouse returned invalid JSON.')
      },
    },
  })

  const syncResponse = await request(
    handler,
    'POST',
    '/api/production-memory/sync',
    validSnapshot,
  )
  const readResponse = await request(
    handler,
    'GET',
    '/api/production-memory/demo-script/outstanding',
  )

  assert.equal(syncResponse.statusCode, 502)
  assert.deepEqual(syncResponse.json, {
    error: 'production_memory_sync_failed',
    message: 'Production memory sync failed due to an upstream ClickHouse MCP error.',
  })
  assert.equal(readResponse.statusCode, 502)
  assert.deepEqual(readResponse.json, {
    error: 'production_memory_read_failed',
    message: 'Production memory sync failed due to an upstream ClickHouse MCP error.',
  })
  assert.equal(errors.length, 2)
  assert.doesNotMatch(syncResponse.body + readResponse.body, /invalid JSON/)
})

test('GET outstanding returns the store result for the decoded production id', async () => {
  let receivedId = null
  const items = [{
    id: 'recording:B',
    kind: 'recording',
    sourceId: 'B',
    status: 'redo',
    isComplete: false,
    description: 'redo section',
    updatedAt: '2026-08-17 12:00:00.000',
  }]
  const handler = createScriptyRequestHandler({
    productionMemoryStore: {
      async getOutstanding(productionId) {
        receivedId = productionId
        return items
      },
    },
  })

  const response = await request(
    handler,
    'GET',
    '/api/production-memory/demo%20script/outstanding',
  )

  assert.equal(response.statusCode, 200)
  assert.equal(receivedId, 'demo script')
  assert.deepEqual(response.json, { productionId: 'demo script', items })
})
