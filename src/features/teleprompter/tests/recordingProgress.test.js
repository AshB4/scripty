import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, test } from 'node:test'
import { SCROLL_MODES } from '../scrollMode.js'
import {
  getRecordingProgressFingerprint,
  loadRecordingProgress,
  saveRecordingProgress,
} from '../recordingProgress/recordingProgressStorage.js'
import {
  buildRecordingProgressSections,
  getPickupSections,
  getRecordingProgressPercent,
  getRecordingResumeTarget,
  getTakeCompletionAction,
  incrementRecordingTake,
  setRecordingProgressNote,
  setRecordingProgressStatus,
} from '../recordingProgress/useRecordingProgress.js'

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial))

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

beforeEach(() => {
  globalThis.window = {
    localStorage: createLocalStorage(),
  }
})

afterEach(() => {
  delete globalThis.window
})

test('new recordable sections default to Not Recorded', () => {
  const sections = buildRecordingProgressSections(
    [{ id: 'section-1', speakerLabel: 'Narrator', text: 'Hello there.' }],
    {},
  )

  assert.equal(sections[0].status, 'not-recorded')
  assert.equal(sections[0].takeCount, 0)
  assert.equal(sections[0].symbol, '○')
})

test('starting a take increments take count exactly once', () => {
  const entry = incrementRecordingTake({
    note: '',
    status: 'redo',
    takeCount: 2,
    updatedAt: '2026-08-11T00:00:00.000Z',
  })

  assert.equal(entry.takeCount, 3)
  assert.equal(entry.status, 'redo')
})

test('status updates keep their note and updated timestamp shape', () => {
  const noteEntry = setRecordingProgressNote(
    { note: '', status: 'not-recorded', takeCount: 1, updatedAt: null },
    'Stumbled near ending',
  )
  const statusEntry = setRecordingProgressStatus(noteEntry, 'good')

  assert.equal(statusEntry.note, 'Stumbled near ending')
  assert.equal(statusEntry.status, 'good')
  assert.equal(typeof statusEntry.updatedAt, 'string')
})

test('card status transitions reuse the recording entry state for counts and pickups', () => {
  const initial = { note: 'Keep this note', status: 'not-recorded', takeCount: 2, updatedAt: null }
  const good = setRecordingProgressStatus(initial, 'good')
  const redo = setRecordingProgressStatus(good, 'redo')
  const notRecorded = setRecordingProgressStatus(redo, 'not-recorded')
  const sections = buildRecordingProgressSections(
    [
      { id: 'first', speakerLabel: 'Narrator', text: 'First section' },
      { id: 'second', speakerLabel: 'Narrator', text: 'Second section' },
    ],
    {
      first: redo,
      second: good,
    },
  )

  assert.equal(good.status, 'good')
  assert.equal(redo.status, 'redo')
  assert.equal(notRecorded.status, 'not-recorded')
  assert.equal(notRecorded.note, 'Keep this note')
  assert.equal(notRecorded.takeCount, 2)
  assert.equal(getRecordingProgressPercent(sections), 50)
  assert.deepEqual(getPickupSections(sections).map((section) => section.id), ['first'])
})

test('recording section cards expose all status pills through the shared status handler', async () => {
  const panel = await readFile(
    new URL('../view/RecordingProgressPanel.jsx', import.meta.url),
    'utf8',
  )

  for (const status of ['not-recorded', 'redo', 'good']) {
    assert.match(panel, new RegExp(`status: '${status}'`))
  }
  assert.match(panel, /onSetStatus\(section\.id, status\)/)
  assert.match(panel, /aria-pressed=\{section\.status === status\}/)
  assert.doesNotMatch(panel, /useState\(/)
})

test('recording progress survives refresh for the same script', () => {
  const script = 'Narrator: Welcome back.'
  const parserMode = 'Generic Teleprompter'
  const fingerprint = getRecordingProgressFingerprint(script, parserMode)

  saveRecordingProgress(script, parserMode, {
    sections: {
      intro: {
        note: 'fix pacing',
        status: 'redo',
        takeCount: 3,
        updatedAt: '2026-08-11T12:00:00.000Z',
      },
    },
    updatedAt: '2026-08-11T12:00:00.000Z',
  })

  const loaded = loadRecordingProgress(script, parserMode)

  assert.equal(fingerprint.length > 0, true)
  assert.deepEqual(loaded.sections.intro, {
    note: 'fix pacing',
    status: 'redo',
    takeCount: 3,
    updatedAt: '2026-08-11T12:00:00.000Z',
  })
})

test('good and redo states persist across refresh', () => {
  const script = 'Narrator: Welcome back.'
  const parserMode = 'Generic Teleprompter'

  saveRecordingProgress(script, parserMode, {
    sections: {
      intro: {
        note: '',
        status: 'good',
        takeCount: 2,
        updatedAt: '2026-08-11T12:00:00.000Z',
      },
    },
    updatedAt: '2026-08-11T12:00:00.000Z',
  })

  const loaded = loadRecordingProgress(script, parserMode)

  assert.equal(loaded.sections.intro.status, 'good')
  assert.equal(loaded.sections.intro.takeCount, 2)
})

test('recording progress stays isolated between scripts', () => {
  const parserMode = 'Generic Teleprompter'

  saveRecordingProgress('Script A', parserMode, {
    sections: {
      intro: {
        note: 'A',
        status: 'redo',
        takeCount: 1,
        updatedAt: '2026-08-11T12:00:00.000Z',
      },
    },
    updatedAt: '2026-08-11T12:00:00.000Z',
  })
  saveRecordingProgress('Script B', parserMode, {
    sections: {
      intro: {
        note: 'B',
        status: 'good',
        takeCount: 4,
        updatedAt: '2026-08-11T12:00:00.000Z',
      },
    },
    updatedAt: '2026-08-11T12:00:00.000Z',
  })

  assert.equal(loadRecordingProgress('Script A', parserMode).sections.intro.note, 'A')
  assert.equal(loadRecordingProgress('Script B', parserMode).sections.intro.note, 'B')
})

test('resume prioritizes Redo before Not Recorded', () => {
  const sections = buildRecordingProgressSections(
    [
      { id: 'section-1', speakerLabel: 'Narrator', text: 'One' },
      { id: 'section-2', speakerLabel: 'Narrator', text: 'Two' },
      { id: 'section-3', speakerLabel: 'Narrator', text: 'Three' },
    ],
    {
      'section-1': { status: 'good', takeCount: 1, note: '', updatedAt: null },
      'section-2': { status: 'redo', takeCount: 2, note: '', updatedAt: null },
      'section-3': {
        status: 'not-recorded',
        takeCount: 0,
        note: '',
        updatedAt: null,
      },
    },
  )

  assert.equal(getRecordingResumeTarget(sections)?.id, 'section-2')
})

test('resume falls back to the first Not Recorded section', () => {
  const sections = buildRecordingProgressSections(
    [
      { id: 'section-1', speakerLabel: 'Narrator', text: 'One' },
      { id: 'section-2', speakerLabel: 'Narrator', text: 'Two' },
    ],
    {
      'section-1': { status: 'good', takeCount: 1, note: '', updatedAt: null },
      'section-2': {
        status: 'not-recorded',
        takeCount: 0,
        note: '',
        updatedAt: null,
      },
    },
  )

  assert.equal(getRecordingResumeTarget(sections)?.id, 'section-2')
})

test('all Good sections produce a completed state and 100 percent progress', () => {
  const sections = buildRecordingProgressSections(
    [
      { id: 'section-1', speakerLabel: 'Narrator', text: 'One' },
      { id: 'section-2', speakerLabel: 'Narrator', text: 'Two' },
    ],
    {
      'section-1': { status: 'good', takeCount: 1, note: '', updatedAt: null },
      'section-2': { status: 'good', takeCount: 2, note: '', updatedAt: null },
    },
  )

  assert.equal(getRecordingProgressPercent(sections), 100)
  assert.equal(getRecordingResumeTarget(sections), null)
})

test('countdown completion does not double-start Voice Follow', () => {
  assert.equal(
    getTakeCompletionAction({
      isVoiceEnabled: true,
      scrollMode: SCROLL_MODES.VOICE,
    }),
    'none',
  )
  assert.equal(
    getTakeCompletionAction({
      isVoiceEnabled: false,
      scrollMode: SCROLL_MODES.VOICE,
    }),
    'voice-follow',
  )
})
