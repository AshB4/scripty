import {
  Gemini,
  getFunctionCalls,
  InMemoryRunner,
  isFinalResponse,
  LlmAgent,
  MCPToolset,
  stringifyContent,
} from '@google/adk'
import { clickHouseStringLiteral } from './productionMemoryStore.js'
import { getUnfinishedProductionMemoryItemsSql } from './productionMemorySchema.js'

const APP_NAME = 'scripty-production-memory'
const USER_ID = 'scripty-backend'
const TOOL_NAME = 'run_query'

const defaultAdk = {
  Gemini,
  getFunctionCalls,
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

export function getOutstandingProductionMemorySql(productionId) {
  return getUnfinishedProductionMemoryItemsSql(clickHouseStringLiteral(productionId))
}

function agentInstruction(requiredSql) {
  return `You are Scripty's production-status assistant. Your only job is to answer the creator's question about current unfinished production work for one production.

You must call the ${TOOL_NAME} MCP tool exactly once, using the exact SQL below before answering. The SQL already applies deterministic current-state and completion filtering. Do not change it, write other SQL, or answer from memory.

\`\`\`sql
${requiredSql}
\`\`\`

Use only the tool result. Report only unfinished current items. Never invent items or include completed work. Group Redo recording sections, Not Recorded recording sections, and unfinished production assets when useful. If the query returns no rows, say the production work is complete. Keep the answer concise and actionable.`
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

export function createProductionMemoryAgent({
  adk = defaultAdk,
  googleAgentModel,
  googleCloudLocation,
  googleCloudProject,
  mcpUrl,
} = {}) {
  return {
    async ask({ productionId, question }) {
      const config = {
        googleAgentModel: requiredConfigString(googleAgentModel, 'googleAgentModel'),
        googleCloudLocation: requiredConfigString(googleCloudLocation, 'googleCloudLocation'),
        googleCloudProject: requiredConfigString(googleCloudProject, 'googleCloudProject'),
        mcpUrl: requiredConfigString(mcpUrl, 'mcpUrl'),
      }
      const requiredSql = getOutstandingProductionMemorySql(productionId)
      const toolset = new adk.MCPToolset({
        type: 'StreamableHTTPConnectionParams',
        url: config.mcpUrl,
      }, [TOOL_NAME])
      const agent = new adk.LlmAgent({
        name: 'production_memory_assistant',
        model: new adk.Gemini({
          model: config.googleAgentModel,
          vertexai: true,
          project: config.googleCloudProject,
          location: config.googleCloudLocation,
        }),
        instruction: agentInstruction(requiredSql),
        tools: [toolset],
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

        const toolCalls = toolCallsFromEvents(events, adk)
        const usedMcp = toolCalls.some((call) => call?.name === TOOL_NAME)
        if (!usedMcp) {
          throw new ProductionMemoryAgentError('Gemini did not invoke the required MCP tool.')
        }

        return {
          answer: finalAnswerFromEvents(events, adk),
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
      } finally {
        await toolset.close()
      }
    },
  }
}
