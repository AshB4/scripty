import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, test } from 'node:test'
import { SCROLL_MODES } from '../scrollMode.js'
import {
  loadRecordingProgress,
  saveRecordingProgress,
} from '../recordingProgress/recordingProgressStorage.js'
import {
  buildRecordingProgressSections,
  getPickupSections,
  getPickupTarget,
  getRecordingProgressPercent,
  getTakeCompletionAction,
  incrementRecordingTake,
  setRecordingProgressStatus,
} from '../recordingProgress/useRecordingProgress.js'

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

function block(id) {
  return { id, speakerLabel: 'Narrator', text: `Section ${id}` }
}

function entry(status, takeCount = 0) {
  return { note: '', status, takeCount, updatedAt: null }
}

function sections(statuses) {
  const blocks = Object.keys(statuses).map(block)
  const stored = Object.fromEntries(
    Object.entries(statuses).map(([id, status]) => [id, entry(status)]),
  )
  return buildRecordingProgressSections(blocks, stored)
}

beforeEach(() => {
  globalThis.window = { localStorage: createLocalStorage() }
})

afterEach(() => {
  delete globalThis.window
})

test('pickup queue contains only Redo sections and reports the correct count', () => {
  const queue = getPickupSections(
    sections({ first: 'good', second: 'redo', third: 'not-recorded', fourth: 'redo' }),
  )

  assert.deepEqual(queue.map((section) => section.id), ['second', 'fourth'])
  assert.equal(queue.length, 2)
})

test('Start Pickups targets the first outstanding Redo in script order', () => {
  const target = getPickupTarget(
    sections({ first: 'good', second: 'redo', third: 'redo' }),
  )

  assert.equal(target?.id, 'second')
})

test('a selected Redo remains the current pickup when the queue changes', () => {
  const target = getPickupTarget(
    sections({ first: 'redo', second: 'redo', third: 'good' }),
    'second',
  )

  assert.equal(target?.id, 'second')
})

test('Redo to Good removes the section and selects the next outstanding Redo', () => {
  const initial = sections({ first: 'redo', second: 'not-recorded', third: 'redo' })
  const updatedEntries = Object.fromEntries(
    initial.map((section) => [
      section.id,
      section.id === 'first'
        ? setRecordingProgressStatus(section, 'good')
        : section,
    ]),
  )
  const updated = buildRecordingProgressSections(
    [block('first'), block('second'), block('third')],
    updatedEntries,
  )

  assert.deepEqual(getPickupSections(updated).map((section) => section.id), ['third'])
  assert.equal(getPickupTarget(updated)?.id, 'third')
})

test('Redo to Redo remains outstanding', () => {
  const redo = setRecordingProgressStatus(entry('redo', 2), 'redo')
  const updated = buildRecordingProgressSections([block('first')], { first: redo })

  assert.equal(getPickupTarget(updated)?.id, 'first')
  assert.equal(updated[0].takeCount, 2)
})

test('last Redo to Good leaves no pickup while Not Recorded remains unchanged', () => {
  const updated = buildRecordingProgressSections(
    [block('pickup'), block('later')],
    {
      pickup: setRecordingProgressStatus(entry('redo', 1), 'good'),
      later: entry('not-recorded'),
    },
  )

  assert.deepEqual(getPickupSections(updated), [])
  assert.equal(getPickupTarget(updated), null)
  assert.equal(updated.find((section) => section.id === 'later')?.status, 'not-recorded')
  assert.equal(getRecordingProgressPercent(updated), 50)
})

test('refresh derives outstanding pickups from existing Recording Progress storage', () => {
  saveRecordingProgress('Script A', 'Auto', {
    sections: {
      first: entry('redo', 2),
      second: entry('good', 1),
    },
  })

  const restored = loadRecordingProgress('Script A', 'Auto')
  const restoredSections = buildRecordingProgressSections(
    [block('first'), block('second')],
    restored.sections,
  )

  assert.deepEqual(getPickupSections(restoredSections).map((section) => section.id), ['first'])
  assert.equal(restoredSections[0].takeCount, 2)
})

test('refresh does not resurrect a pickup completed through Recording Progress', () => {
  saveRecordingProgress('Script A', 'Auto', {
    sections: { first: entry('good', 3) },
  })

  const restored = loadRecordingProgress('Script A', 'Auto')
  const restoredSections = buildRecordingProgressSections(
    [block('first')],
    restored.sections,
  )

  assert.deepEqual(getPickupSections(restoredSections), [])
  assert.equal(restoredSections[0].takeCount, 3)
})

test('pickup derivation remains isolated by existing script identity', () => {
  saveRecordingProgress('Script A', 'Auto', {
    sections: { shared: entry('redo', 1) },
  })
  saveRecordingProgress('Script B', 'Auto', {
    sections: { shared: entry('good', 4) },
  })

  const scriptA = buildRecordingProgressSections(
    [block('shared')],
    loadRecordingProgress('Script A', 'Auto').sections,
  )
  const scriptB = buildRecordingProgressSections(
    [block('shared')],
    loadRecordingProgress('Script B', 'Auto').sections,
  )

  assert.equal(getPickupSections(scriptA).length, 1)
  assert.equal(getPickupSections(scriptB).length, 0)
})

test('Pickup Mode preserves existing take increment and status behavior', () => {
  const next = incrementRecordingTake(entry('redo', 4))

  assert.equal(next.takeCount, 5)
  assert.equal(next.status, 'redo')
})

test('Pickup Mode preserves existing countdown completion routing', () => {
  assert.equal(
    getTakeCompletionAction({
      isVoiceEnabled: false,
      scrollMode: SCROLL_MODES.TIMED,
    }),
    'timed-scroll',
  )
  assert.equal(
    getTakeCompletionAction({
      isVoiceEnabled: false,
      scrollMode: SCROLL_MODES.VOICE,
    }),
    'voice-follow',
  )
  assert.equal(
    getTakeCompletionAction({
      isVoiceEnabled: true,
      scrollMode: SCROLL_MODES.VOICE,
    }),
    'none',
  )
})

test('Pickup UI reuses the existing take path and exposes completion clearly', async () => {
  const view = await readFile(
    new URL('../view/TeleprompterView.jsx', import.meta.url),
    'utf8',
  )
  const panel = await readFile(
    new URL('../view/RecordingProgressPanel.jsx', import.meta.url),
    'utf8',
  )

  assert.match(view, /return startRecordingTake\(target\.id\)/)
  assert.match(panel, /Start Pickups/)
  assert.match(panel, /All Pickups Complete/)
  assert.match(panel, /Not Recorded sections are unchanged/)
})

test('Voice Follow pickup pauses for the shared countdown and restarts afterward', async () => {
  const view = await readFile(
    new URL('../view/TeleprompterView.jsx', import.meta.url),
    'utf8',
  )
  const startTake = view.slice(
    view.indexOf('const startRecordingTake'),
    view.indexOf('const resumeRecording'),
  )

  assert.match(
    startTake,
    /scrollMode === SCROLL_MODES\.VOICE[\s\S]*?voiceFollow\.disable\(\)[\s\S]*?startCountdown\([\s\S]*?voiceFollow\.enable\(\)/,
  )
  assert.doesNotMatch(startTake, /setScrollMode/)
})

test('next pickup focus preserves the selected teleprompter mode', async () => {
  const view = await readFile(
    new URL('../view/TeleprompterView.jsx', import.meta.url),
    'utf8',
  )
  const setStatus = view.slice(
    view.indexOf('const setRecordingStatus'),
    view.indexOf('useEffect(() =>', view.indexOf('const setRecordingStatus')),
  )

  assert.match(setStatus, /setCurrentVoiceBlock\(nextIndex\)/)
  assert.match(setStatus, /scrollToRecordableBlock\(nextIndex\)/)
  assert.doesNotMatch(setStatus, /setScrollMode/)
})

test('selected Redo exposes Start This Pickup through the shared take path', async () => {
  const panel = await readFile(
    new URL('../view/RecordingProgressPanel.jsx', import.meta.url),
    'utf8',
  )

  assert.match(panel, /onClick=\{\(\) => onStartTake\(selectedSectionId\)\}/)
  assert.match(
    panel,
    /selectedSection\.status === 'redo'[\s\S]*?'Start This Pickup'[\s\S]*?: 'Start Take'/,
  )
})

test('starting a specific pickup leaves other Redo entries unchanged', () => {
  const initial = sections({ first: 'redo', second: 'redo' })
  const updatedEntries = Object.fromEntries(
    initial.map((section) => [
      section.id,
      section.id === 'second' ? incrementRecordingTake(section) : section,
    ]),
  )
  const updated = buildRecordingProgressSections(
    [block('first'), block('second')],
    updatedEntries,
  )

  assert.equal(updated[0].status, 'redo')
  assert.equal(updated[0].takeCount, 0)
  assert.equal(updated[1].status, 'redo')
  assert.equal(updated[1].takeCount, 1)
})

test('Good, Redo, and Not Recorded sections can all start another take', async () => {
  const progressHook = await readFile(
    new URL('../recordingProgress/useRecordingProgress.js', import.meta.url),
    'utf8',
  )
  const startTake = progressHook.slice(
    progressHook.indexOf('const startTake'),
    progressHook.indexOf('const resumeRecording'),
  )

  for (const status of ['good', 'redo', 'not-recorded']) {
    const next = incrementRecordingTake(entry(status, 2))
    assert.equal(next.takeCount, 3)
    assert.equal(next.status, status)
  }

  assert.match(startTake, /sections\.find\(\(item\) => item\.id === sectionId\)/)
  assert.match(startTake, /incrementRecordingTake\(entry\)/)
  assert.doesNotMatch(startTake, /section\.status/)
})

test('every selected section retains a normal recording action', async () => {
  const panel = await readFile(
    new URL('../view/RecordingProgressPanel.jsx', import.meta.url),
    'utf8',
  )
  const detail = panel.slice(panel.indexOf('{selectedSectionId ?'))

  assert.match(detail, /onStartTake\(selectedSectionId\)/)
  assert.match(detail, /'Start This Pickup'[\s\S]*?: 'Start Take'/)
  assert.match(detail, /disabled=\{isCountdownActive\}/)
  assert.doesNotMatch(detail, /disabled=\{[^}]*status/)
  assert.doesNotMatch(detail, /disabled=\{[^}]*isComplete/)
  assert.doesNotMatch(detail, /disabled=\{[^}]*isPickupMode/)
})

test('pickup completion leaves normal per-section recording available', async () => {
  const panel = await readFile(
    new URL('../view/RecordingProgressPanel.jsx', import.meta.url),
    'utf8',
  )

  assert.ok(panel.indexOf('All Pickups Complete') < panel.indexOf('<RecordingProgressSectionList'))
  assert.ok(panel.indexOf('<RecordingProgressSectionList') < panel.indexOf('{selectedSectionId ?'))
  assert.match(panel, /\{selectedSectionId \?[\s\S]*?onStartTake\(selectedSectionId\)/)
})

test('recording one selected section preserves every other section status', () => {
  const initial = sections({ first: 'good', second: 'not-recorded', third: 'redo' })
  const updatedEntries = Object.fromEntries(
    initial.map((section) => [
      section.id,
      section.id === 'first' ? incrementRecordingTake(section) : section,
    ]),
  )
  const updated = buildRecordingProgressSections(
    [block('first'), block('second'), block('third')],
    updatedEntries,
  )

  assert.deepEqual(
    updated.map(({ status, takeCount }) => ({ status, takeCount })),
    [
      { status: 'good', takeCount: 1 },
      { status: 'not-recorded', takeCount: 0 },
      { status: 'redo', takeCount: 0 },
    ],
  )
})
