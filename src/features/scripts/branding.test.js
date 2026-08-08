import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the script workspace uses the official Scripty icon asset', async () => {
  const source = await readFile(
    new URL('./ScriptWorkspace.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /scripty-icon-128\.png/)
  assert.match(source, /className="brand-mark brand-mark--image"/)
  assert.doesNotMatch(source, /className="brand-mark">S</)
})
