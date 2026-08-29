import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadServerConfig } from './config.js'
import {
  createMcpClickhouseClient,
  isMcpClickhouseUnavailable,
} from './mcpClickhouseClient.js'
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
const DEFAULT_DIST_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
)
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

export function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(body)}\n`)
}

function frontendFilePath(distDirectory, pathname) {
  let decodedPathname
  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    return null
  }

  if (decodedPathname.includes('\0') || decodedPathname.includes('\\')) return null

  const candidate = resolve(distDirectory, `.${decodedPathname}`)
  if (candidate !== distDirectory && !candidate.startsWith(`${distDirectory}${sep}`)) {
    return null
  }

  return candidate
}

async function serveFile(response, filePath) {
  try {
    const file = await stat(filePath)
    if (!file.isFile()) return false

    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()]
        ?? 'application/octet-stream',
    })
    response.end(await readFile(filePath))
    return true
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
    throw error
  }
}

async function serveFrontend(response, distDirectory, pathname) {
  const requestedFile = frontendFilePath(distDirectory, pathname)
  if (!requestedFile) return false

  if (await serveFile(response, requestedFile)) return true
  return serveFile(response, resolve(distDirectory, 'index.html'))
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

function sendProductionMemoryFailure(response, operation, error, logger) {
  logger.error(`Production memory ${operation} failed.`, error)

  if (isMcpClickhouseUnavailable(error)) {
    sendJson(response, 503, {
      error: 'production_memory_mcp_unavailable',
      message: 'Production memory sync is unavailable because ClickHouse MCP cannot be reached.',
    })
    return
  }

  sendJson(response, 502, {
    error: `production_memory_${operation}_failed`,
    message: 'Production memory sync failed due to an upstream ClickHouse MCP error.',
  })
}

export function createScriptyRequestHandler({
  distDirectory = DEFAULT_DIST_DIRECTORY,
  geminiPrepareAgent = null,
  logger = console,
  productionMemoryAgent = null,
  productionMemoryStore = null,
} = {}) {
  return async function handleScriptyRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const rawPathname = (request.url ?? '/').split(/[?#]/, 1)[0]

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
        sendProductionMemoryFailure(response, 'sync', error, logger)
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
          completion: result.completion,
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
      } catch (error) {
        sendProductionMemoryFailure(response, 'read', error, logger)
      }
      return
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'not_found' })
      return
    }

    if (request.method === 'GET' && await serveFrontend(response, distDirectory, rawPathname)) {
      return
    }

    sendJson(response, 404, { error: 'not_found' })
  }
}

export const handleScriptyRequest = createScriptyRequestHandler()

export function createScriptyServer({
  distDirectory,
  geminiPrepareAgent,
  productionMemoryAgent,
  productionMemoryStore,
} = {}) {
  return createServer(createScriptyRequestHandler({
    distDirectory,
    geminiPrepareAgent,
    productionMemoryAgent,
    productionMemoryStore,
  }))
}

export function startServer({
  config = loadServerConfig(),
  mcpClient = null,
  productionMemoryStore = null,
  productionMemoryAgent = null,
  geminiPrepareAgent = createGeminiPrepareAgent({
    googleAgentModel: config.googleAgentModel,
    googleCloudLocation: config.googleCloudLocation,
    googleCloudProject: config.googleCloudProject,
    googleGenAiUseVertexAi: config.googleGenAiUseVertexAi,
  }),
  server = null,
} = {}) {
  if (config.clickhouseMcpUrl) {
    mcpClient ??= createMcpClickhouseClient({
      authToken: config.clickhouseMcpAuthToken,
      mcpUrl: config.clickhouseMcpUrl,
    })
    productionMemoryStore ??= createProductionMemoryStore({
      runQuery: mcpClient.runQuery,
    })
    productionMemoryAgent ??= createProductionMemoryAgent({
      googleAgentModel: config.googleAgentModel,
      googleCloudLocation: config.googleCloudLocation,
      googleCloudProject: config.googleCloudProject,
      mcpAuthToken: config.clickhouseMcpAuthToken,
      mcpUrl: config.clickhouseMcpUrl,
    })
  }

  server ??= createScriptyServer({
    geminiPrepareAgent,
    productionMemoryAgent,
    productionMemoryStore,
  })
  server.listen(config.port, () => {
    console.log(`Scripty server listening on http://localhost:${config.port}`)
  })

  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer()
}
