import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProductionMemoryAgent,
  getOutstandingProductionMemorySql,
  ProductionMemoryAgentError,
} from './productionMemoryAgent.js'
import { PRODUCTION_MEMORY_QUESTIONS } from '../productionMemoryQuestions.js'

function createFakeAdk(eventsOrError) {
  const captured = {}

  class FakeGemini {
    constructor(options) {
      captured.gemini = options
    }
  }

  class FakeMcpToolset {
    constructor(connection, toolFilter) {
      captured.connection = connection
      captured.toolFilter = toolFilter
    }

    async close() {
      captured.closed = true
    }

    async getTools() {
      captured.toolDiscoveryCalls = (captured.toolDiscoveryCalls ?? 0) + 1
      return [{ name: 'run_query' }]
    }
  }

  class FakeLlmAgent {
    constructor(options) {
      captured.agent = options
    }
  }

  class FakeRunner {
    constructor(options) {
      captured.runner = options
    }

    async *runEphemeral(options) {
      captured.run = options
      if (eventsOrError instanceof Error) throw eventsOrError
      yield* eventsOrError
    }
  }

  return {
    adk: {
      Gemini: FakeGemini,
      InMemoryRunner: FakeRunner,
      LlmAgent: FakeLlmAgent,
      MCPToolset: FakeMcpToolset,
      getFunctionCalls: (event) => event.calls ?? [],
      getFunctionResponses: (event) => event.responses ?? [],
      isFinalResponse: (event) => event.final === true,
      stringifyContent: (event) => event.text ?? '',
    },
    captured,
  }
}

function successfulQueryEvents(finalText = 'Grounded answer.') {
  return [
    { calls: [{ id: 'query-1', name: 'run_query' }] },
    {
      responses: [{
        id: 'query-1',
        name: 'run_query',
        response: {
          content: [{
            text: '{"columns":["item_id","source_id","kind","status","is_complete","description"],"rows":[["recording:2-dialogue","2-dialogue","recording","redo",false,"Redo section"]]}',
            type: 'text',
          }],
        },
      }],
    },
    { final: true, text: finalText },
  ]
}

function createAgent(adk, { mcpAuthToken = null } = {}) {
  return createProductionMemoryAgent({
    adk,
    googleAgentModel: 'gemini-2.5-flash',
    googleCloudLocation: 'us-central1',
    googleCloudProject: 'test-project',
    mcpAuthToken,
    mcpUrl: 'http://127.0.0.1:8000/mcp',
  })
}

test('caches the ADK MCP run_query tool and returns its final answer', async () => {
  const fake = createFakeAdk(successfulQueryEvents(
    'Redo: redo section. Not Recorded: missing section.',
  ))
  const agent = createAgent(fake.adk)

  const result = await agent.ask({
    productionId: 'demo-script',
    question: 'What do I still need to finish?',
  })

  assert.deepEqual(result, {
    answer: 'Redo: redo section. Not Recorded: missing section.',
    toolUse: { usedMcp: true, toolName: 'run_query' },
  })
  assert.deepEqual(fake.captured.connection, {
    type: 'StreamableHTTPConnectionParams',
    url: 'http://127.0.0.1:8000/mcp',
  })
  assert.deepEqual(fake.captured.toolFilter, ['run_query'])
  assert.deepEqual(fake.captured.gemini, {
    model: 'gemini-2.5-flash',
    vertexai: true,
    project: 'test-project',
    location: 'us-central1',
  })
  assert.match(fake.captured.agent.instruction, /is_complete = false/)
  assert.match(fake.captured.agent.instruction, /demo-script/)
  assert.equal(fake.captured.run.newMessage.parts[0].text, 'What do I still need to finish?')
  assert.equal(fake.captured.toolDiscoveryCalls, 1)
  assert.deepEqual(fake.captured.agent.tools, [{ name: 'run_query' }])
})

test('passes the server-side MCP bearer token to ADK only when configured', async () => {
  const fake = createFakeAdk(successfulQueryEvents('Nothing remains.'))

  await createAgent(fake.adk, { mcpAuthToken: 'server-only-token' }).ask({
    productionId: 'demo-script',
    question: 'What do I still need to finish?',
  })

  assert.deepEqual(fake.captured.connection, {
    type: 'StreamableHTTPConnectionParams',
    url: 'http://127.0.0.1:8000/mcp',
    transportOptions: {
      requestInit: {
        headers: { Authorization: 'Bearer server-only-token' },
      },
    },
  })
})

test('requires the Gemini agent to invoke mcp-clickhouse before returning an answer', async () => {
  const fake = createFakeAdk([{ final: true, text: 'Nothing remains.' }])

  await assert.rejects(
    createAgent(fake.adk).ask({ productionId: 'demo-script', question: 'What do I still need to finish?' }),
    ProductionMemoryAgentError,
  )
})

test('rejects malformed final agent results after a successful tool call', async () => {
  const fake = createFakeAdk(successfulQueryEvents().slice(0, 2))

  await assert.rejects(
    createAgent(fake.adk).ask({ productionId: 'demo-script', question: 'What do I still need to finish?' }),
    /final answer/,
  )
})

test('normalizes ADK and MCP failures without leaking their cause', async () => {
  const fake = createFakeAdk(new Error('MCP credential should not leak'))

  await assert.rejects(
    createAgent(fake.adk).ask({ productionId: 'demo-script', question: 'What do I still need to finish?' }),
    (error) => error instanceof ProductionMemoryAgentError &&
      error.message === 'Unable to answer from production memory.' &&
      error.cause?.message === 'MCP credential should not leak',
  )
})

test('guards MCP calls so Gemini cannot replace the deterministic outstanding query', async () => {
  const fake = createFakeAdk(successfulQueryEvents('Unused'))
  const agent = createAgent(fake.adk)
  const productionId = 'demo-script'
  const requiredSql = getOutstandingProductionMemorySql(productionId)

  await agent.ask({ productionId, question: 'What do I still need to finish?' })

  assert.doesNotThrow(() => fake.captured.agent.beforeToolCallback({
    tool: { name: 'run_query' },
    args: { query: requiredSql },
  }))
  assert.throws(() => fake.captured.agent.beforeToolCallback({
    tool: { name: 'run_query' },
    args: { query: 'SELECT * FROM production_memory_items' },
  }), ProductionMemoryAgentError)
})

test('supports fixed production questions while retaining one bounded MCP query', async () => {
  for (const { label } of PRODUCTION_MEMORY_QUESTIONS) {
    const fake = createFakeAdk(successfulQueryEvents())
    await createAgent(fake.adk).ask({ productionId: 'demo-script', question: label })

    assert.deepEqual(fake.captured.toolFilter, ['run_query'])
    assert.match(fake.captured.agent.instruction, new RegExp(label.replace(/[?]/g, '\\?')))
    assert.match(fake.captured.agent.instruction, /first unfinished recording returned by the query/)
  }
})

test('reuses the fixed MCP tool declaration across assistant requests', async () => {
  const fake = createFakeAdk(successfulQueryEvents())
  const agent = createAgent(fake.adk)

  await agent.ask({
    productionId: 'demo-script',
    question: 'What do I still need to finish?',
  })
  await agent.ask({
    productionId: 'demo-script',
    question: 'What needs another take?',
  })

  assert.equal(fake.captured.toolDiscoveryCalls, 1)
})

test('rejects MCP timeout text instead of accepting Gemini final text as grounded', async () => {
  const fake = createFakeAdk([
    { calls: [{ id: 'query-1', name: 'run_query' }] },
    { responses: [{ id: 'query-1', name: 'run_query', response: { error: 'AbortError' } }] },
    { final: true, text: 'The query timed out. I am unable to retrieve the information.' },
  ])

  await assert.rejects(
    createAgent(fake.adk).ask({
      productionId: 'demo-script',
      question: 'What needs another take?',
    }),
    /query failed/,
  )
})

test('rejects MCP transport errors, tool errors, and malformed query results', async () => {
  const failedResponses = [
    { error: 'SSE stream disconnected: AbortError' },
    { isError: true, content: [] },
    { content: [{ type: 'text', text: '{"columns":["item_id"],"rows":"bad"}' }] },
  ]

  for (const response of failedResponses) {
    const fake = createFakeAdk([
      { calls: [{ id: 'query-1', name: 'run_query' }] },
      { responses: [{ id: 'query-1', name: 'run_query', response }] },
      { final: true, text: 'The query timed out.' },
    ])
    await assert.rejects(
      createAgent(fake.adk).ask({
        productionId: 'demo-script',
        question: 'What do I still need to finish?',
      }),
      /query failed/,
    )
  }
})
