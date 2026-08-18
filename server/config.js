const DEFAULT_PORT = 8787
const DEFAULT_CLICKHOUSE_MCP_URL = 'http://127.0.0.1:8000/mcp'
const DEFAULT_GOOGLE_CLOUD_LOCATION = 'us-central1'
const DEFAULT_GOOGLE_AGENT_MODEL = 'gemini-2.5-flash'

function parsePort(value, fallback = DEFAULT_PORT) {
  if (value == null || value === '') return fallback

  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  return port
}

function parseVertexAiEnabled(value) {
  if (value == null || value === '') return true
  if (String(value).toLowerCase() === 'true') return true
  throw new Error('GOOGLE_GENAI_USE_VERTEXAI must be true.')
}

export function loadServerConfig(env = process.env) {
  const clickhouseMcpUrl = env.CLICKHOUSE_MCP_URL || DEFAULT_CLICKHOUSE_MCP_URL

  try {
    const url = new URL(clickhouseMcpUrl)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
  } catch {
    throw new Error('CLICKHOUSE_MCP_URL must be a valid URL.')
  }

  return {
    clickhouseMcpAuthToken: env.CLICKHOUSE_MCP_AUTH_TOKEN || null,
    clickhouseMcpUrl,
    googleAgentModel: env.GOOGLE_AGENT_MODEL || DEFAULT_GOOGLE_AGENT_MODEL,
    googleCloudLocation: env.GOOGLE_CLOUD_LOCATION || DEFAULT_GOOGLE_CLOUD_LOCATION,
    googleCloudProject: env.GOOGLE_CLOUD_PROJECT || null,
    googleGenAiUseVertexAi: parseVertexAiEnabled(env.GOOGLE_GENAI_USE_VERTEXAI),
    port: parsePort(env.PORT),
  }
}
