import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'

export class McpClickhouseError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'McpClickhouseError'
  }
}

function parseTextContent(content) {
  const text = content
    ?.filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('\n')

  if (!text) return null

  try {
    return JSON.parse(text)
  } catch (error) {
    throw new McpClickhouseError('mcp-clickhouse returned invalid JSON.', {
      cause: error,
    })
  }
}

function normalizeToolResult(result) {
  if (result?.isError) {
    throw new McpClickhouseError('mcp-clickhouse rejected the query.')
  }

  let value = result?.structuredContent
  if (value && typeof value === 'object' && typeof value.result === 'string') {
    try {
      value = JSON.parse(value.result)
    } catch (error) {
      throw new McpClickhouseError('mcp-clickhouse returned invalid structured JSON.', {
        cause: error,
      })
    }
  }

  value ??= parseTextContent(result?.content)

  if (
    !value ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.rows)
  ) {
    throw new McpClickhouseError('mcp-clickhouse returned an unexpected query result.')
  }

  return {
    columns: value.columns.map(String),
    rows: value.rows,
  }
}

function defaultClientFactory() {
  return new Client({ name: 'scripty-server', version: '1.0.0' })
}

function defaultTransportFactory(url, authToken) {
  const options = authToken
    ? { authProvider: { token: async () => authToken } }
    : undefined
  return new StreamableHTTPClientTransport(new URL(url), options)
}

export function createMcpClickhouseClient({
  authToken = null,
  clientFactory = defaultClientFactory,
  mcpUrl,
  transportFactory = defaultTransportFactory,
} = {}) {
  if (!mcpUrl) throw new Error('mcpUrl is required.')

  let client = null
  let connection = null

  async function getClient() {
    if (!connection) {
      client = clientFactory()
      const transport = transportFactory(mcpUrl, authToken)
      connection = client.connect(transport).then(() => client).catch((error) => {
        client = null
        connection = null
        throw error
      })
    }

    return connection
  }

  return {
    async close() {
      const activeClient = client
      client = null
      connection = null
      await activeClient?.close()
    },

    async runQuery(query) {
      if (typeof query !== 'string' || !query.trim()) {
        throw new TypeError('query must be a non-empty string.')
      }

      try {
        const activeClient = await getClient()
        const result = await activeClient.callTool({
          name: 'run_query',
          arguments: { query },
        })
        return normalizeToolResult(result)
      } catch (error) {
        if (error instanceof McpClickhouseError) throw error
        client = null
        connection = null
        throw new McpClickhouseError('Unable to execute query through mcp-clickhouse.', {
          cause: error,
        })
      }
    },
  }
}
