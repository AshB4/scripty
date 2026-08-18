const DEFAULT_PORT = 8787
const DEFAULT_CLICKHOUSE_MCP_URL = 'http://127.0.0.1:8000/mcp'

function parsePort(value, fallback = DEFAULT_PORT) {
  if (value == null || value === '') return fallback

  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  return port
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
    port: parsePort(env.PORT),
  }
}
