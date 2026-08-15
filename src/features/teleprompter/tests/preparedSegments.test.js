import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import {
  saveFinalizedPrepareResult,
} from '../../scripts/prepare/prepareStorage.js'
import { parseScript } from '../../scripts/scriptParser.js'
import { buildRecordingProgressSections } from '../recordingProgress/useRecordingProgress.js'
import {
  createFinalizedTeleprompterModel,
  createFinalizedTeleprompterSegments,
  resolveTeleprompterSegmentModel,
} from '../preparedSegments.js'
import { createTrackableBlocks } from '../voiceFollow/voiceFollowMatcher.js'

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

function segment(id, originalText, type, options = {}) {
  return {
    clarificationReason: null,
    id,
    ignored: false,
    needsClarification: false,
    originalText,
    speaker: null,
    status: type === 'SPOKEN' ? null : 'confirmed',
    type,
    ...options,
  }
}

function finalizedResult() {
  const segments = [
    segment('seg-1', 'ASH:\nOkay, this is where things get weird.', 'SPOKEN', {
      speaker: 'ASH',
    }),
    segment('seg-2', '[cut to robot]', 'CAMERA_CUT'),
    segment('seg-3', 'ROBOT: You say that every episode.', 'SPOKEN', {
      speaker: 'ROBOT',
    }),
    segment('seg-4', 'show screenshot of the dashboard here', 'IMAGE_GRAPHIC'),
    segment('seg-5', 'record screen while opening analytics page', 'SCREEN_RECORDING'),
    segment('seg-6', 'need AI video of a robot running', 'AI_VIDEO'),
    segment('seg-7', 'grab phone and hold it up', 'PROP'),
    segment('seg-8', 'get coffee mug before this part', 'CREATOR_REMINDER'),
    segment('seg-9', 'maybe zoom in on the numbers???', 'PRODUCTION_CUE'),
    segment('seg-10', '[B ROLL - typing on laptop]', 'B_ROLL'),
    segment('seg-10-reminder', 'show graph from downloads', 'CREATOR_REMINDER'),
    segment('seg-11', 'Same repeated line.', 'SPOKEN', { speaker: 'ASH' }),
    segment('seg-12', 'Same repeated line.', 'SPOKEN', { speaker: 'ASH' }),
    segment('seg-13', 'ignore this unresolved note', 'UNKNOWN', {
      ignored: true,
      status: null,
    }),
  ]
  const requirements = segments
    .filter(
      (item) =>
        !item.ignored && item.type !== 'SPOKEN' && item.type !== 'CREATOR_REMINDER',
    )
    .map((item, index) => ({
      description: item.originalText,
      id: `req-${index + 1}`,
      ignored: false,
      segmentId: item.id,
      sourceText: item.originalText,
      status: item.status,
      type: item.type,
    }))

  return { clarifications: [], requirements, segments }
}

beforeEach(() => {
  globalThis.window = { localStorage: createLocalStorage() }
})

afterEach(() => {
  delete globalThis.window
})

test('matching finalized metadata becomes the authoritative teleprompter model', () => {
  const script = 'ASH:\nOkay, this is where things get weird.\n\nshow screenshot of the dashboard here'
  const parserMode = 'Auto'
  const sourceBefore = script
  const result = finalizedResult()
  saveFinalizedPrepareResult(script, parserMode, result)

  const model = resolveTeleprompterSegmentModel({
    parserMode,
    parserSegments: parseScript(script),
    script,
  })

  assert.equal(model.finalizedPrepareResult.segments.length, result.segments.length)
  assert.equal(model.segments.find((item) => item.id === 'seg-1').text, 'Okay, this is where things get weird.')
  assert.equal(model.segments.find((item) => item.id === 'seg-1').speakerLabel, 'ASH')
  assert.equal(model.segments.find((item) => item.id === 'seg-4').type, 'direction')
  assert.equal(model.segments.find((item) => item.id === 'seg-4').subtype, 'image-graphic')
  assert.equal(script, sourceBefore)
})

test('all finalized production types are non-spoken and ignored items are omitted', () => {
  const { reminders, segments } = createFinalizedTeleprompterModel(finalizedResult())
  const productionTypes = new Map(
    segments.filter((item) => item.prepareType !== 'SPOKEN').map((item) => [item.prepareType, item]),
  )

  for (const type of [
    'AI_VIDEO',
    'B_ROLL',
    'CAMERA_CUT',
    'IMAGE_GRAPHIC',
    'PRODUCTION_CUE',
    'PROP',
    'SCREEN_RECORDING',
  ]) {
    assert.equal(productionTypes.get(type).type, 'direction')
  }
  assert.deepEqual(
    reminders.map((item) => item.text),
    ['get coffee mug before this part', 'show graph from downloads'],
  )
  assert.equal(
    segments.some((item) => item.prepareType === 'CREATOR_REMINDER'),
    false,
  )
  assert.equal(segments.some((item) => item.id === 'seg-13'), false)
})

test('reminders are separated without changing inline spoken or production order', () => {
  const result = finalizedResult()
  const original = structuredClone(result)
  const model = createFinalizedTeleprompterModel(result)

  assert.deepEqual(
    model.reminders.map((item) => item.id),
    ['seg-8', 'seg-10-reminder'],
  )
  assert.deepEqual(
    model.segments.map((item) => item.id),
    [
      'seg-1',
      'seg-2',
      'seg-3',
      'seg-4',
      'seg-5',
      'seg-6',
      'seg-7',
      'seg-9',
      'seg-10',
      'seg-11',
      'seg-12',
    ],
  )
  assert.deepEqual(result, original)
})

test('finalized Prepare reminders remain available to the top Reminders area', () => {
  const script = 'ASH: Keep this line.\n\nRemember the original prop wording.'
  const result = finalizedResult()
  saveFinalizedPrepareResult(script, 'Auto', result)

  const model = resolveTeleprompterSegmentModel({
    parserMode: 'Auto',
    parserSegments: parseScript(script),
    script,
  })

  assert.deepEqual(model.reminders, [
    { id: 'seg-8', text: 'get coffee mug before this part' },
    { id: 'seg-10-reminder', text: 'show graph from downloads' },
  ])
})

test('a finalized result without reminders produces no reminder section data', () => {
  const result = finalizedResult()
  result.segments = result.segments.filter(
    (item) => item.type !== 'CREATOR_REMINDER',
  )

  assert.deepEqual(createFinalizedTeleprompterModel(result).reminders, [])
})

test('Recording Progress and Voice Follow receive finalized spoken segments only', () => {
  const segments = createFinalizedTeleprompterSegments(finalizedResult())
  const trackable = createTrackableBlocks(segments)
  const progressSections = buildRecordingProgressSections(trackable, {})

  assert.deepEqual(
    trackable.map((item) => item.id),
    ['seg-1', 'seg-3', 'seg-11', 'seg-12'],
  )
  assert.equal(progressSections.length, 4)
  assert.equal(progressSections.every((item) => item.status === 'not-recorded'), true)
})

test('repeated finalized lines retain distinct stable occurrence IDs', () => {
  const segments = createFinalizedTeleprompterSegments(finalizedResult())
  const repeated = segments.filter((item) => item.text === 'Same repeated line.')

  assert.deepEqual(repeated.map((item) => item.id), ['seg-11', 'seg-12'])
})

test('another script and invalid finalized data fall back to parser segments', () => {
  saveFinalizedPrepareResult('Script A', 'Auto', finalizedResult())
  const parserSegments = parseScript('Script B')
  const isolated = resolveTeleprompterSegmentModel({
    parserMode: 'Auto',
    parserSegments,
    script: 'Script B',
  })
  const malformed = resolveTeleprompterSegmentModel({
    loadFinalized: () => ({
      clarifications: [],
      requirements: [],
      segments: [segment('seg-1', 'Unresolved', 'UNKNOWN')],
    }),
    parserMode: 'Auto',
    parserSegments,
    script: 'Script B',
  })

  assert.equal(isolated.finalizedPrepareResult, null)
  assert.deepEqual(isolated.reminders, [])
  assert.equal(isolated.segments, parserSegments)
  assert.equal(malformed.finalizedPrepareResult, null)
  assert.deepEqual(malformed.reminders, [])
  assert.equal(malformed.segments, parserSegments)
})

test('finalized interpretation restores from storage for the same script', () => {
  const script = 'ASH: A prepared line.'
  saveFinalizedPrepareResult(script, 'Auto', finalizedResult())

  const restored = resolveTeleprompterSegmentModel({
    parserMode: 'Auto',
    parserSegments: parseScript(script),
    script,
  })

  assert.equal(restored.finalizedPrepareResult.segments[0].id, 'seg-1')
  assert.equal(restored.segments[0].prepareType, 'SPOKEN')
  assert.deepEqual(
    restored.reminders.map((item) => item.id),
    ['seg-8', 'seg-10-reminder'],
  )
})
