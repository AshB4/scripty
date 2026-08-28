import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getPrepareSummary } from './preparePresentation.js'

function preparedResult() {
  return {
    segments: [
      { id: 'spoken', type: 'SPOKEN', ignored: false },
      { id: 'known', type: 'CAMERA_CUT', ignored: false },
      { id: 'unknown', type: 'UNKNOWN', ignored: false },
      { id: 'ignored', type: 'UNKNOWN', ignored: true },
    ],
    requirements: [
      { id: 'one', ignored: false },
      { id: 'two', ignored: true },
    ],
    clarifications: [],
  }
}

test('compact Prepared summary derives only active review counts', () => {
  assert.deepEqual(getPrepareSummary(preparedResult()), {
    needsInput: 1,
    requirements: 1,
    spoken: 1,
  })
})

test('sidebar renders summary and Review Preparation without full editor lists', async () => {
  const source = await readFile(
    new URL('./PrepareForRecordingPanel.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /Review Preparation/)
  assert.match(source, /to="\/scripts\/review"/)
  assert.match(source, /getPrepareSummary/)
  assert.doesNotMatch(source, /PrepareItemEditor/)
  assert.doesNotMatch(source, /PrepareReviewContent/)
  assert.doesNotMatch(source, /Finalize & Start Recording/)
})

test('dedicated review page uses shared navigation and existing Prepare workflow', async () => {
  const source = await readFile(
    new URL('./PrepareReviewPage.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /import AppHeader/)
  assert.match(source, /<AppHeader/)
  assert.match(source, /usePrepareForRecording/)
  assert.match(source, /finalizePrepareAndNavigate/)
  assert.match(source, /Back to Script/)
  assert.doesNotMatch(source, /prepare\.prepare\(/)
})

test('review page exposes one secondary Script Guide entry without starting Prepare', async () => {
  const source = await readFile(
    new URL('./PrepareReviewPage.jsx', import.meta.url),
    'utf8',
  )

  assert.equal(source.match(/to="\/scripts\/guide\?from=review"/g)?.length, 1)
  assert.match(source, />\s*Script Guide\s*<\/Link>/)
  assert.doesNotMatch(source, /prepare\.prepare\(/)
})

test('review content retains editing, clarification, and finalize controls', async () => {
  const source = await readFile(
    new URL('./PrepareReviewContent.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /PrepareItemEditor/)
  assert.match(source, /prepare\.updateSegment/)
  assert.match(source, /prepare\.updateRequirement/)
  assert.match(source, /prepare\.resolveClarification/)
  assert.match(source, /disabled={!canFinalize}/)
  assert.match(source, /Finalize & Start Recording/)
  assert.match(source, /prepare-card__item--blocking/)
  assert.match(source, /data-blocks-finalize/)
})

test('review makes tentative classifications fast to confirm or change', async () => {
  const source = await readFile(
    new URL('./PrepareReviewContent.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /item\.status === 'tentative'/)
  assert.match(source, />\s*Confirm\s*<\/Button>/)
  assert.match(source, /status: 'confirmed'/)
  assert.match(source, />\s*Change type\s*<\/span>/)
})

test('router exposes the dedicated Preparation review route', async () => {
  const source = await readFile(
    new URL('../../../app/router.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /path: '\/scripts\/review'/)
  assert.match(source, /element: <PrepareReviewPage/)
})
