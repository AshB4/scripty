import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProductionMemoryAgent,
  getOutstandingProductionMemorySql,
  ProductionMemoryAgentError,
} from './productionMemoryAgent.js'

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
      isFinalResponse: (event) => event.final === true,
      stringifyContent: (event) => event.text ?? '',
    },
    captured,
  }
}

function createAgent(adk) {
  return createProductionMemoryAgent({
    adk,
    googleAgentModel: 'gemini-2.5-flash',
    googleCloudLocation: 'us-central1',
    googleCloudProject: 'test-project',
    mcpUrl: 'http://127.0.0.1:8000/mcp',
  })
}

test('uses an ADK MCPToolset restricted to run_query and returns its final answer', async () => {
  const fake = createFakeAdk([
    { calls: [{ name: 'run_query' }] },
    { final: true, text: 'Redo: redo section. Not Recorded: missing section.' },
  ])
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
  assert.equal(fake.captured.closed, true)
})

test('requires the Gemini agent to invoke mcp-clickhouse before returning an answer', async () => {
  const fake = createFakeAdk([{ final: true, text: 'Nothing remains.' }])

  await assert.rejects(
    createAgent(fake.adk).ask({ productionId: 'demo-script', question: 'status' }),
    ProductionMemoryAgentError,
  )
})

test('rejects malformed final agent results after a tool call', async () => {
  const fake = createFakeAdk([{ calls: [{ name: 'run_query' }] }])

  await assert.rejects(
    createAgent(fake.adk).ask({ productionId: 'demo-script', question: 'status' }),
    /final answer/,
  )
})

test('normalizes ADK and MCP failures without leaking their cause', async () => {
  const fake = createFakeAdk(new Error('MCP credential should not leak'))

  await assert.rejects(
    createAgent(fake.adk).ask({ productionId: 'demo-script', question: 'status' }),
    (error) => error instanceof ProductionMemoryAgentError &&
      error.message === 'Unable to answer from production memory.' &&
      error.cause?.message === 'MCP credential should not leak',
  )
})

test('guards MCP calls so Gemini cannot replace the deterministic outstanding query', async () => {
  const fake = createFakeAdk([{ calls: [{ name: 'run_query' }] }, { final: true, text: 'Unused' }])
  const agent = createAgent(fake.adk)
  const productionId = 'demo-script'
  const requiredSql = getOutstandingProductionMemorySql(productionId)

  await agent.ask({ productionId, question: 'status' })

  assert.doesNotThrow(() => fake.captured.agent.beforeToolCallback({
    tool: { name: 'run_query' },
    args: { query: requiredSql },
  }))
  assert.throws(() => fake.captured.agent.beforeToolCallback({
    tool: { name: 'run_query' },
    args: { query: 'SELECT * FROM production_memory_items' },
  }), ProductionMemoryAgentError)
})
