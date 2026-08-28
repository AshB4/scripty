import {
  Gemini,
  getFunctionCalls,
  getFunctionResponses,
  InMemoryRunner,
  isFinalResponse,
  LlmAgent,
  MCPToolset,
  stringifyContent,
} from '@google/adk'
import { clickHouseStringLiteral } from './productionMemoryStore.js'
import { getCurrentProductionMemoryItemsSql } from './productionMemorySchema.js'
import {
  isProductionMemoryQuestion,
  WHATS_LEFT_QUESTION,
} from '../productionMemoryQuestions.js'
import { normalizeMcpClickhouseToolResult } from './mcpClickhouseClient.js'

const APP_NAME = 'scripty-production-memory'
const USER_ID = 'scripty-backend'
const TOOL_NAME = 'run_query'

const defaultAdk = {
  Gemini,
  getFunctionCalls,
  getFunctionResponses,
  InMemoryRunner,
  isFinalResponse,
  LlmAgent,
  MCPToolset,
  stringifyContent,
}

export class ProductionMemoryAgentError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'ProductionMemoryAgentError'
  }
}

function requiredConfigString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ProductionMemoryAgentError(`${field} is required.`)
  }
  return value.trim()
}

export function getProductionMemoryAssistantSql(productionId) {
  return getCurrentProductionMemoryItemsSql(clickHouseStringLiteral(productionId))
}

function agentInstruction(requiredSql, question) {
  return `You are Scripty's production-status assistant. Your only job is to answer the creator's question about current production work for one production.

You must call the ${TOOL_NAME} MCP tool exactly once, using the exact SQL below before answering. The SQL already applies deterministic current-state and tombstone filtering. Do not change it, write other SQL, or answer from memory.

\`\`\`sql
${requiredSql}
\`\`\`

Use only the tool result. Report only current unfinished items. Never invent items or include completed work. If every returned item has is_complete true, say the production work is complete without inventing counts.

The creator asked: "${question}"

- For "What do I still need to finish?", include Redo recordings, Not Recorded recordings, and unfinished assets.
- For "What needs another take?", include only recordings with status Redo.
- For "Which production assets are still missing?", include only unfinished assets.
- For "Where should I resume?", choose the first unfinished recording returned by the query. Recording rows are ordered by their parser-owned numeric source position. If there are no unfinished recordings but assets remain, say recording is complete and identify the remaining assets.

For the Redo-only or assets-only questions, if that category has no matching rows, say that category has nothing left; do not call the entire production complete unless the query has no rows. If the query has no rows, say the production work is complete. Keep the answer concise and actionable.`
}

function requestMessage(question) {
  return {
    role: 'user',
    parts: [{ text: question }],
  }
}

function finalAnswerFromEvents(events, adk) {
  const finalEvent = [...events].reverse().find(adk.isFinalResponse)
  const answer = finalEvent ? adk.stringifyContent(finalEvent).trim() : ''

  if (!answer) {
    throw new ProductionMemoryAgentError('Gemini did not return a final answer.')
  }

  return answer
}

function toolCallsFromEvents(events, adk) {
  return events.flatMap((event) => adk.getFunctionCalls(event) ?? [])
}

function toolResponsesFromEvents(events, adk) {
  return events.flatMap((event) => adk.getFunctionResponses(event) ?? [])
}

function validProductionMemoryResult(result) {
  const requiredColumns = [
    'item_id',
    'source_id',
    'kind',
    'status',
    'is_complete',
    'description',
    'take_count',
  ]
  return requiredColumns.every((column) => result.columns.includes(column)) &&
    result.rows.every((row) => Array.isArray(row) && row.length === result.columns.length)
}

function requireSuccessfulMcpQuery(events, adk) {
  const calls = toolCallsFromEvents(events, adk)
    .filter((call) => call?.name === TOOL_NAME)
  if (calls.length !== 1) {
    throw new ProductionMemoryAgentError('Gemini did not invoke the required MCP tool.')
  }

  const [call] = calls
  const responses = toolResponsesFromEvents(events, adk)
    .filter((response) =>
      response?.name === TOOL_NAME && (!call.id || response.id === call.id),
    )
  if (responses.length !== 1 || responses[0]?.response?.error) {
    throw new ProductionMemoryAgentError('Production memory query failed.')
  }

  let result
  try {
    result = normalizeMcpClickhouseToolResult(responses[0].response)
  } catch (error) {
    throw new ProductionMemoryAgentError('Production memory query failed.', {
      cause: error,
    })
  }
  if (!validProductionMemoryResult(result)) {
    throw new ProductionMemoryAgentError('Production memory query failed.')
  }

  return result
}

function clickHouseBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function nonNegativeInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

export function getProductionCompletionSummary(result) {
  const columnIndex = new Map(
    result.columns.map((column, index) => [column, index]),
  )
  const valueFor = (row, column) => row[columnIndex.get(column)]
  const activeRows = result.rows.filter(
    (row) => !clickHouseBoolean(valueFor(row, 'is_deleted')),
  )
  const recordingRows = activeRows.filter(
    (row) => String(valueFor(row, 'kind')) === 'recording',
  )
  const assetRows = activeRows.filter(
    (row) => String(valueFor(row, 'kind')) === 'asset',
  )

  return {
    assetCount: assetRows.filter((row) => clickHouseBoolean(valueFor(row, 'is_complete'))).length,
    isComplete: activeRows.every((row) => clickHouseBoolean(valueFor(row, 'is_complete'))),
    recordingCount: recordingRows.filter((row) => clickHouseBoolean(valueFor(row, 'is_complete'))).length,
    totalTakes: recordingRows.reduce(
      (total, row) => total + nonNegativeInteger(valueFor(row, 'take_count')),
      0,
    ),
  }
}

export function createProductionMemoryAgent({
  adk = defaultAdk,
  mcpAuthToken = null,
  googleAgentModel,
  googleCloudLocation,
  googleCloudProject,
  mcpUrl,
} = {}) {
  let mcpToolsPromise = null

  function getMcpTools(config) {
    if (mcpToolsPromise) return mcpToolsPromise

    const toolset = new adk.MCPToolset({
      type: 'StreamableHTTPConnectionParams',
      url: config.mcpUrl,
      ...(mcpAuthToken
        ? {
          transportOptions: {
            requestInit: {
              headers: { Authorization: `Bearer ${mcpAuthToken}` },
            },
          },
        }
        : {}),
    }, [TOOL_NAME])

    mcpToolsPromise = toolset.getTools()
      .then((tools) => {
        if (tools.length !== 1 || tools[0]?.name !== TOOL_NAME) {
          throw new ProductionMemoryAgentError('Required MCP tool is unavailable.')
        }
        return tools
      })
      .catch(async (error) => {
        await toolset.close()
        mcpToolsPromise = null
        throw error
      })

    return mcpToolsPromise
  }

  return {
    async ask({ productionId, question }) {
      if (!isProductionMemoryQuestion(question)) {
        throw new ProductionMemoryAgentError('Unsupported production-memory question.')
      }
      const config = {
        googleAgentModel: requiredConfigString(googleAgentModel, 'googleAgentModel'),
        googleCloudLocation: requiredConfigString(googleCloudLocation, 'googleCloudLocation'),
        googleCloudProject: requiredConfigString(googleCloudProject, 'googleCloudProject'),
        mcpUrl: requiredConfigString(mcpUrl, 'mcpUrl'),
      }
      const requiredSql = getProductionMemoryAssistantSql(productionId)
      const tools = await getMcpTools(config)
      const agent = new adk.LlmAgent({
        name: 'production_memory_assistant',
        model: new adk.Gemini({
          model: config.googleAgentModel,
          vertexai: true,
          project: config.googleCloudProject,
          location: config.googleCloudLocation,
        }),
        instruction: agentInstruction(requiredSql, question),
        tools,
        generateContentConfig: { temperature: 0 },
        beforeToolCallback({ tool, args }) {
          if (tool.name !== TOOL_NAME || String(args?.query ?? '').trim() !== requiredSql) {
            throw new ProductionMemoryAgentError('Agent attempted a non-deterministic query.')
          }
          return undefined
        },
      })
      const runner = new adk.InMemoryRunner({
        agent,
        appName: APP_NAME,
      })

      try {
        const events = []
        for await (const event of runner.runEphemeral({
          userId: USER_ID,
          newMessage: requestMessage(question),
          runConfig: { maxLlmCalls: 3 },
        })) {
          events.push(event)
        }

        const result = requireSuccessfulMcpQuery(events, adk)
        const completion = getProductionCompletionSummary(result)

        return {
          answer: finalAnswerFromEvents(events, adk),
          completion: question === WHATS_LEFT_QUESTION && completion.isComplete
            ? completion
            : null,
          toolUse: {
            usedMcp: true,
            toolName: TOOL_NAME,
          },
        }
      } catch (error) {
        if (error instanceof ProductionMemoryAgentError) throw error
        throw new ProductionMemoryAgentError('Unable to answer from production memory.', {
          cause: error,
        })
      }
    },
  }
}
