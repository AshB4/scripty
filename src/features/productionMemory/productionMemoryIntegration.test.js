import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { buildProductionMemorySnapshot } from './productionMemorySnapshot.js'
import { buildShootChecklistItems } from '../scripts/checklist/shootChecklist.js'
import { buildRecordingProgressSections } from '../teleprompter/recordingProgress/useRecordingProgress.js'

test('snapshot builder receives real Recording Progress and Shoot Checklist shapes', () => {
  const recordingSections = buildRecordingProgressSections(
    [
      {
        id: 'section-a',
        speakerLabel: 'Host',
        text: 'Completed section',
      },
      {
        id: 'section-b',
        speakerLabel: 'Host',
        text: 'Redo section',
      },
    ],
    {
      'section-a': { status: 'good', takeCount: 1 },
      'section-b': { status: 'redo', takeCount: 2 },
    },
  )
  const checklistItems = buildShootChecklistItems(
    [{
      description: 'Dashboard screenshot',
      id: 'asset-a',
      status: 'confirmed',
      type: 'SCREEN_RECORDING',
    }],
    {},
  )

  const snapshot = buildProductionMemorySnapshot({
    checklistItems,
    parserMode: 'Auto',
    recordingSections,
    script: 'HOST: Completed section\n\nHOST: Redo section',
  })

  assert.deepEqual(
    snapshot.items.map((item) => [
      item.kind,
      item.sourceId,
      item.status,
      item.isComplete,
      item.description,
    ]),
    [
      ['recording', 'section-a', 'good', true, 'Completed section'],
      ['recording', 'section-b', 'redo', false, 'Redo section'],
      ['asset', 'asset-a', 'unchecked', false, 'Dashboard screenshot'],
    ],
  )
})

test('Teleprompter mounts production-memory sync from live recording state', async () => {
  const source = await readFile(
    new URL('../teleprompter/view/TeleprompterView.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /buildProductionMemorySnapshot/)
  assert.match(source, /recordingSections: recordingProgress\.sections/)
  assert.match(source, /buildShootChecklistItems/)
  assert.match(source, /loadShootChecklistState\(script, parserMode\)/)
  assert.match(source, /useProductionMemorySync\(productionMemorySnapshot\)/)
})

test('Shoot Checklist page mounts production-memory sync from live checklist state', async () => {
  const source = await readFile(
    new URL('../scripts/checklist/ShootChecklistPage.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /buildProductionMemorySnapshot/)
  assert.match(source, /checklistItems: checklist\.items/)
  assert.match(source, /buildRecordingProgressSections/)
  assert.match(source, /loadRecordingProgress\(script, parserMode\)\.sections/)
  assert.match(source, /useProductionMemorySync\(productionMemorySnapshot\)/)
  assert.match(source, /ProductionAssistant/)
  assert.match(source, /productionId=\{productionMemorySnapshot\.productionId\}/)
})

test('Production Assistant exposes only fixed production-memory question actions', async () => {
  const source = await readFile(
    new URL('./ProductionAssistant.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /PRODUCTION_MEMORY_QUESTIONS\.map/)
  assert.match(source, /assistant\.ask\(item\.label\)/)
  assert.doesNotMatch(source, /<input/)
})
