import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { loadServerConfig } from './config.js'

const root = new URL('../', import.meta.url)

test('local ClickHouse tooling and env files are ignored by git and ESLint', async () => {
  const [gitignore, eslintConfig] = await Promise.all([
    readFile(new URL('.gitignore', root), 'utf8'),
    readFile(new URL('eslint.config.js', root), 'utf8'),
  ])

  assert.match(gitignore, /^\.env$/m)
  assert.match(gitignore, /^\.env\.\*$/m)
  assert.match(gitignore, /^mcp-clickhouse\/$/m)
  assert.match(eslintConfig, /'mcp-clickhouse\/\*\*'/)
})

test('local env template contains placeholders and local-only MCP defaults', async () => {
  const [template, packageJson] = await Promise.all([
    readFile(new URL('.env.example', root), 'utf8'),
    readFile(new URL('package.json', root), 'utf8'),
  ])

  for (const value of [
    'your-clickhouse-host',
    'your-clickhouse-user',
    'your-clickhouse-password',
    'your-google-cloud-project',
  ]) {
    assert.match(template, new RegExp(value))
  }
  assert.match(template, /CLICKHOUSE_MCP_BIND_HOST='127\.0\.0\.1'/)
  assert.match(template, /CLICKHOUSE_MCP_AUTH_DISABLED='true'/)
  assert.match(template, /FASTMCP_JSON_RESPONSE='true'/)
  assert.match(packageJson, /FASTMCP_JSON_RESPONSE=\$\{FASTMCP_JSON_RESPONSE:-true\}/)
  assert.doesNotMatch(template, /^VITE_/m)
})

test('production server configuration remains environment-driven', () => {
  assert.deepEqual(loadServerConfig({
    CLICKHOUSE_MCP_URL: 'https://mcp.example.test/mcp',
    GOOGLE_CLOUD_PROJECT: 'production-project',
  }), {
    clickhouseMcpAuthToken: null,
    clickhouseMcpUrl: 'https://mcp.example.test/mcp',
    googleAgentModel: 'gemini-2.5-flash',
    googleCloudLocation: 'us-central1',
    googleCloudProject: 'production-project',
    googleGenAiUseVertexAi: true,
    port: 8787,
  })
})
