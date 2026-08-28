import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the shared app header uses the official Scripty icon asset', async () => {
  const source = await readFile(
    new URL('../../components/AppHeader.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /scripty-icon-128\.png/)
  assert.match(source, /className="brand-mark brand-mark--image"/)
  assert.doesNotMatch(source, /className="brand-mark">S</)
})

test('workspace uses the shared app header', async () => {
  const source = await readFile(
    new URL('./ScriptWorkspace.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /import AppHeader/)
  assert.match(source, /<AppHeader>/)
})

test('the global application shell renders one copyright footer', async () => {
  const [app, footer] = await Promise.all([
    readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../components/AppFooter.jsx', import.meta.url), 'utf8'),
  ])

  assert.equal(app.match(/<AppFooter\s*\/?\s*>/g)?.length, 1)
  assert.match(footer, /© 2026 Ashley Broussard/)
})
