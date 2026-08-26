import { createServer } from 'node:http'
import { loadServerConfig } from './config.js'
import { createMcpClickhouseClient } from './mcpClickhouseClient.js'
import { createGeminiPrepareAgent } from './geminiPrepareAgent.js'
import {
  GeminiPrepareValidationError,
  validateGeminiPrepareRequest,
} from './geminiPrepareValidation.js'
import { createProductionMemoryAgent } from './productionMemoryAgent.js'
import { createProductionMemoryStore } from './productionMemoryStore.js'
import {
  ProductionMemoryAskValidationError,
  validateProductionMemoryAskRequest,
} from './productionMemoryAskValidation.js'
import {
  SnapshotValidationError,
  validateProductionMemorySnapshot,
} from './productionMemoryValidation.js'

const MAX_REQUEST_BODY_BYTES = 1024 * 1024

export function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(body)}\n`)
}

async function readJsonBody(request, limit = MAX_REQUEST_BODY_BYTES) {
  const declaredLength = Number(request.headers?.['content-length'] ?? 0)
  if (declaredLength > limit) {
    const error = new Error('Request body is too large.')
    error.statusCode = 413
    throw error
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) {
      const error = new Error('Request body is too large.')
      error.statusCode = 413
      throw error
    }
    chunks.push(buffer)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Request body must be valid JSON.')
    error.statusCode = 400
    throw error
  }
}

function productionIdFromOutstandingPath(pathname) {
  const match = pathname.match(/^\/api\/production-memory\/([^/]+)\/outstanding$/)
  if (!match) return null

  try {
    const productionId = decodeURIComponent(match[1])
    return productionId && productionId.length <= 512 ? productionId : null
  } catch {
    return null
  }
}

export function createScriptyRequestHandler({
  geminiPrepareAgent = null,
  productionMemoryAgent = null,
  productionMemoryStore = null,
} = {}) {
  return async function handleScriptyRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok' })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/prepare/classify') {
      if (!geminiPrepareAgent) {
        sendJson(response, 503, { error: 'gemini_prepare_unavailable' })
        return
      }

      let prepareRequest
      try {
        prepareRequest = validateGeminiPrepareRequest(await readJsonBody(request))
      } catch (error) {
        if (error instanceof GeminiPrepareValidationError || error.statusCode === 400) {
          sendJson(response, 400, { error: 'invalid_prepare_request' })
          return
        }
        if (error.statusCode === 413) {
          sendJson(response, 413, { error: 'request_too_large' })
          return
        }
        sendJson(response, 502, { error: 'gemini_prepare_failed' })
      }
      try {
        sendJson(response, 200, await geminiPrepareAgent.classify(prepareRequest))
      } catch {
        sendJson(response, 502, { error: 'gemini_prepare_failed' })
      }
      return
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/production-memory/sync'
    ) {
      if (!productionMemoryStore) {
        sendJson(response, 503, { error: 'production_memory_unavailable' })
        return
      }

      try {
        const snapshot = validateProductionMemorySnapshot(await readJsonBody(request))
        const result = await productionMemoryStore.sync(snapshot)
        sendJson(response, 200, {
          productionId: snapshot.productionId,
          ...result,
        })
      } catch (error) {
        if (error instanceof SnapshotValidationError || error.statusCode === 400) {
          sendJson(response, 400, { error: 'invalid_snapshot' })
          return
        }
        if (error.statusCode === 413) {
          sendJson(response, 413, { error: 'request_too_large' })
          return
        }
        sendJson(response, 502, { error: 'production_memory_sync_failed' })
      }
      return
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/production-memory/ask'
    ) {
      if (!productionMemoryAgent) {
        sendJson(response, 503, { error: 'production_memory_agent_unavailable' })
        return
      }

      try {
        const askRequest = validateProductionMemoryAskRequest(await readJsonBody(request))
        const result = await productionMemoryAgent.ask(askRequest)
        sendJson(response, 200, {
          productionId: askRequest.productionId,
          answer: result.answer,
          toolUse: result.toolUse,
        })
      } catch (error) {
        if (
          error instanceof ProductionMemoryAskValidationError ||
          error.statusCode === 400
        ) {
          sendJson(response, 400, { error: 'invalid_production_memory_question' })
          return
        }
        if (error.statusCode === 413) {
          sendJson(response, 413, { error: 'request_too_large' })
          return
        }
        sendJson(response, 502, { error: 'production_memory_ask_failed' })
      }
      return
    }

    const productionId = productionIdFromOutstandingPath(url.pathname)
    if (request.method === 'GET' && productionId) {
      if (!productionMemoryStore) {
        sendJson(response, 503, { error: 'production_memory_unavailable' })
        return
      }

      try {
        const items = await productionMemoryStore.getOutstanding(productionId)
        sendJson(response, 200, { productionId, items })
      } catch {
        sendJson(response, 502, { error: 'production_memory_read_failed' })
      }
      return
    }

    sendJson(response, 404, { error: 'not_found' })
  }
}

export const handleScriptyRequest = createScriptyRequestHandler()

export function createScriptyServer({
  geminiPrepareAgent,
  productionMemoryAgent,
  productionMemoryStore,
} = {}) {
  return createServer(createScriptyRequestHandler({
    geminiPrepareAgent,
    productionMemoryAgent,
    productionMemoryStore,
  }))
}

export function startServer({
  config = loadServerConfig(),
  mcpClient = createMcpClickhouseClient({
    authToken: config.clickhouseMcpAuthToken,
    mcpUrl: config.clickhouseMcpUrl,
  }),
  productionMemoryStore = createProductionMemoryStore({
    runQuery: mcpClient.runQuery,
  }),
  productionMemoryAgent = createProductionMemoryAgent({
    googleAgentModel: config.googleAgentModel,
    googleCloudLocation: config.googleCloudLocation,
    googleCloudProject: config.googleCloudProject,
    mcpUrl: config.clickhouseMcpUrl,
  }),
  geminiPrepareAgent = createGeminiPrepareAgent({
    googleAgentModel: config.googleAgentModel,
    googleCloudLocation: config.googleCloudLocation,
    googleCloudProject: config.googleCloudProject,
    googleGenAiUseVertexAi: config.googleGenAiUseVertexAi,
  }),
  server = createScriptyServer({
    geminiPrepareAgent,
    productionMemoryAgent,
    productionMemoryStore,
  }),
} = {}) {
  server.listen(config.port, () => {
    console.log(`Scripty server listening on http://localhost:${config.port}`)
  })

  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer()
}
