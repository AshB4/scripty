import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, test } from 'node:test'
import {
  addManualShootChecklistItem,
  buildReminderChecklistItems,
  buildShootChecklistItems,
  removeShootChecklistItem,
  toggleReminderChecklistItem,
  toggleShootChecklistItem,
} from './shootChecklist.js'
import {
  getShootChecklistFingerprint,
  loadShootChecklistState,
  saveShootChecklistState,
} from './shootChecklistStorage.js'

function createLocalStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
  }
}

function requirement(id, type, description, status = 'confirmed') {
  return {
    description,
    id,
    ignored: false,
    segmentId: `segment-${id}`,
    sourceText: description,
    status,
    type,
  }
}

beforeEach(() => {
  globalThis.window = { localStorage: createLocalStorage() }
})

afterEach(() => {
  delete globalThis.window
})

test('confirmed production requirements become normal checklist items', () => {
  const items = buildShootChecklistItems([
    requirement('req-1', 'B_ROLL', 'Capture the exterior shot'),
  ])

  assert.deepEqual(items, [
    {
      completed: false,
      id: 'req-1',
      kind: 'generated',
      sourceText: 'Capture the exterior shot',
      status: 'confirmed',
      text: 'Capture the exterior shot',
      type: 'B_ROLL',
    },
  ])
})

test('tentative production requirements retain their uncertainty', () => {
  const [item] = buildShootChecklistItems([
    requirement('req-1', 'PROP', 'Bring the red mug', 'tentative'),
  ])

  assert.equal(item.status, 'tentative')
})

test('UNKNOWN, SPOKEN, and CREATOR_REMINDER do not become shoot items', () => {
  const items = buildShootChecklistItems([
    requirement('unknown', 'UNKNOWN', 'Maybe something happens'),
    requirement('spoken', 'SPOKEN', 'Read this line'),
    requirement('reminder', 'CREATOR_REMINDER', 'Drink water first'),
    requirement('shot', 'CAMERA_CUT', 'Cut to the wide camera'),
  ])

  assert.deepEqual(items.map((item) => item.id), ['shot'])
})

test('reminder wording and order pass through unchanged', () => {
  const reminders = [
    { id: 'reminder-1', text: 'Bring the original red mug.' },
    { id: 'reminder-2', text: 'Pause before the final line.' },
  ]
  const original = structuredClone(reminders)

  const items = buildReminderChecklistItems(reminders)

  assert.deepEqual(
    items.map(({ id, text }) => ({ id, text })),
    original,
  )
  assert.deepEqual(reminders, original)
})

test('obvious exact duplicates collapse deterministically while distinct types remain', () => {
  const items = buildShootChecklistItems([
    requirement('first', 'B_ROLL', 'Capture   the laptop'),
    requirement('duplicate', 'B_ROLL', ' capture the LAPTOP '),
    requirement('different-type', 'IMAGE_GRAPHIC', 'Capture the laptop'),
  ])

  assert.deepEqual(items.map((item) => item.id), ['first', 'different-type'])
})

test('removing the canonical item does not reveal a duplicate behind it', () => {
  const requirements = [
    requirement('first', 'B_ROLL', 'Capture the laptop'),
    requirement('duplicate', 'B_ROLL', ' capture the LAPTOP '),
  ]
  const state = removeShootChecklistItem({}, {
    id: 'first',
    kind: 'generated',
  })

  assert.deepEqual(buildShootChecklistItems(requirements, state), [])
})

test('new Prepare requirements merge without disturbing existing progress', () => {
  const state = toggleShootChecklistItem({}, 'existing')
  const items = buildShootChecklistItems(
    [
      requirement('existing', 'B_ROLL', 'Capture the exterior'),
      requirement('new', 'PROP', 'Bring the slate'),
    ],
    state,
  )

  assert.deepEqual(
    items.map((item) => [item.id, item.completed]),
    [
      ['existing', true],
      ['new', false],
    ],
  )
})

test('check and uncheck state survives persistence', () => {
  const checked = toggleShootChecklistItem({}, 'req-1')
  saveShootChecklistState('Script A', 'Auto', checked)

  const restored = loadShootChecklistState('Script A', 'Auto')
  assert.deepEqual(restored.completedItemIds, ['req-1'])

  const unchecked = toggleShootChecklistItem(restored, 'req-1')
  saveShootChecklistState('Script A', 'Auto', unchecked)
  assert.deepEqual(
    loadShootChecklistState('Script A', 'Auto').completedItemIds,
    [],
  )
})

test('reminder check and uncheck state survives persistence', () => {
  const script = 'HOST: Keep the script unchanged.'
  const prepareMetadata = {
    id: 'reminder-1',
    text: 'Bring the red mug.',
  }
  const originalMetadata = structuredClone(prepareMetadata)
  const checked = toggleReminderChecklistItem({}, prepareMetadata.id)
  saveShootChecklistState(script, 'Auto', checked)

  let restored = loadShootChecklistState(script, 'Auto')
  assert.deepEqual(restored.completedReminderIds, ['reminder-1'])
  assert.equal(
    buildReminderChecklistItems([prepareMetadata], restored)[0].completed,
    true,
  )

  restored = toggleReminderChecklistItem(restored, prepareMetadata.id)
  saveShootChecklistState(script, 'Auto', restored)
  assert.deepEqual(
    loadShootChecklistState(script, 'Auto').completedReminderIds,
    [],
  )
  assert.equal(script, 'HOST: Keep the script unchanged.')
  assert.deepEqual(prepareMetadata, originalMetadata)
})

test('manual additions survive persistence', () => {
  const state = addManualShootChecklistItem({}, '  Charge camera batteries  ')
  saveShootChecklistState('Script A', 'Auto', state)

  assert.deepEqual(loadShootChecklistState('Script A', 'Auto').manualItems, [
    { id: 'manual-1', text: 'Charge camera batteries' },
  ])
})

test('generated and manual removals survive persistence', () => {
  let state = addManualShootChecklistItem({}, 'Pack tripod')
  state = removeShootChecklistItem(state, {
    id: 'manual-1',
    kind: 'manual',
  })
  state = removeShootChecklistItem(state, {
    id: 'req-1',
    kind: 'generated',
  })
  saveShootChecklistState('Script A', 'Auto', state)

  const restored = loadShootChecklistState('Script A', 'Auto')
  assert.deepEqual(restored.manualItems, [])
  assert.deepEqual(restored.removedGeneratedIds, ['req-1'])
  assert.deepEqual(
    buildShootChecklistItems(
      [requirement('req-1', 'B_ROLL', 'Capture the exterior')],
      restored,
    ),
    [],
  )
})

test('checklist state remains isolated by the existing script fingerprint', () => {
  saveShootChecklistState(
    'Script A',
    'Auto',
    toggleShootChecklistItem({}, 'req-1'),
  )
  saveShootChecklistState(
    'Script B',
    'Auto',
    addManualShootChecklistItem({}, 'Bring slate'),
  )

  assert.notEqual(
    getShootChecklistFingerprint('Script A', 'Auto'),
    getShootChecklistFingerprint('Script B', 'Auto'),
  )
  assert.deepEqual(
    loadShootChecklistState('Script A', 'Auto').completedItemIds,
    ['req-1'],
  )
  assert.deepEqual(loadShootChecklistState('Script A', 'Auto').manualItems, [])
  assert.deepEqual(loadShootChecklistState('Script B', 'Auto').manualItems, [
    { id: 'manual-1', text: 'Bring slate' },
  ])
})

test('reminder completion remains isolated between scripts', () => {
  saveShootChecklistState(
    'Script A',
    'Auto',
    toggleReminderChecklistItem({}, 'reminder-1'),
  )

  assert.deepEqual(
    loadShootChecklistState('Script A', 'Auto').completedReminderIds,
    ['reminder-1'],
  )
  assert.deepEqual(
    loadShootChecklistState('Script B', 'Auto').completedReminderIds,
    [],
  )
})

test('checklist generation never mutates Prepare requirements or script text', () => {
  const script = 'HOST: Keep this source exactly as written.'
  const requirements = [
    requirement('req-1', 'SCREEN_RECORDING', 'Record the dashboard'),
  ]
  const originalRequirements = structuredClone(requirements)

  buildShootChecklistItems(requirements)

  assert.equal(script, 'HOST: Keep this source exactly as written.')
  assert.deepEqual(requirements, originalRequirements)
})

test('checklist page exposes only the required creator controls and tentative state', async () => {
  const source = await readFile(
    new URL('./ShootChecklistPage.jsx', import.meta.url),
    'utf8',
  )
  const router = await readFile(
    new URL('../../../app/router.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /checklist\.toggleItem/)
  assert.match(source, /checklist\.addManualItem/)
  assert.match(source, /checklist\.removeItem/)
  assert.match(source, /Tentative/)
  assert.match(source, /checklist\.progress/)
  assert.match(router, /path: '\/scripts\/checklist'/)
})

test('top Reminders UI retains reminders with checklist-owned checkboxes', async () => {
  const teleprompter = await readFile(
    new URL('../../teleprompter/view/TeleprompterView.jsx', import.meta.url),
    'utf8',
  )
  const checklistPage = await readFile(
    new URL('./ShootChecklistPage.jsx', import.meta.url),
    'utf8',
  )

  assert.match(teleprompter, /id="teleprompter-reminders-title"/)
  assert.match(teleprompter, /reminderChecklist\.items\.map/)
  assert.match(teleprompter, /reminderChecklist\.toggle\(reminder\.id\)/)
  assert.match(teleprompter, /type="checkbox"/)
  assert.doesNotMatch(checklistPage, /CREATOR_REMINDER/)
  assert.doesNotMatch(checklistPage, /reminderChecklist/)
})
