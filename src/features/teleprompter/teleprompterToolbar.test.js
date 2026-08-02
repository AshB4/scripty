import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const controlsSource = await readFile(
  new URL('./TeleprompterControls.jsx', import.meta.url),
  'utf8',
)
const viewSource = await readFile(
  new URL('./TeleprompterView.jsx', import.meta.url),
  'utf8',
)

test('toolbar exposes a labeled Back to Script control with ArrowLeft', () => {
  assert.match(viewSource, /ArrowLeft/)
  assert.match(viewSource, />\s*Back to Script\s*</)
  assert.match(viewSource, /aria-label="Scripty, back to script"/)
})

test('Top uses an up-style icon and describes its scroll behavior', () => {
  assert.match(controlsSource, /ChevronsUp/)
  assert.doesNotMatch(controlsSource, /\bHome\b/)
  assert.match(controlsSource, /label="Top"/)
  assert.match(controlsSource, /title="Scroll to top"/)
})

test('mode and primary controls expose screen-reader state and labels', () => {
  assert.match(controlsSource, /aria-pressed=/)
  assert.match(controlsSource, /aria-live="polite"/)
  assert.match(controlsSource, /aria-label=\{voiceControlLabel\}/)
  assert.match(controlsSource, /label=\{primaryControl\.label\}/)
})
