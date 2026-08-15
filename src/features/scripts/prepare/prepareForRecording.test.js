import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import {
  PrepareValidationError,
  validatePrepareResult,
} from './prepareContract.js'
import {
  CHAOTIC_CREATOR_NOTES,
  SEMI_STRUCTURED_CREATOR_SCRIPT,
} from './prepareFixtures.js'
import {
  buildLocalPrepareResult,
  createLocalPrepareProvider,
} from './localPrepareProvider.js'
import {
  getPrepareFingerprint,
  loadFinalizedPrepareResult,
  loadPrepareResult,
  loadPrepareState,
  saveFinalizedPrepareResult,
  savePrepareResult,
} from './prepareStorage.js'
import {
  createPrepareWorkflow,
  finalizePrepareAndNavigate,
  getPrepareButtonState,
} from './prepareWorkflow.js'
import {
  canFinalizePrepare,
  finalizePrepareResult,
  getUnresolvedPrepareItems,
  normalizePrepareReviewResult,
  resolvePrepareClarification,
  updatePrepareRequirement,
  updatePrepareSegment,
} from './prepareReview.js'

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

function validResult() {
  return {
    segments: [
      {
        id: 'seg-1',
        originalText: 'HF: aliens. obviously.',
        type: 'SPOKEN',
        status: null,
        speaker: 'HF',
        needsClarification: false,
        clarificationReason: null,
        ignored: false,
      },
      {
        id: 'seg-2',
        originalText: 'maybe AI video of moon rotating??',
        type: 'AI_VIDEO',
        status: 'tentative',
        speaker: null,
        needsClarification: false,
        clarificationReason: null,
        ignored: false,
      },
      {
        id: 'seg-3',
        originalText: 'then ending idk',
        type: 'UNKNOWN',
        status: null,
        speaker: null,
        needsClarification: true,
        clarificationReason: 'The ending is incomplete.',
        ignored: false,
      },
    ],
    requirements: [
      {
        id: 'req-1',
        type: 'AI_VIDEO',
        description: 'maybe AI video of moon rotating??',
        sourceText: 'maybe AI video of moon rotating??',
        status: 'tentative',
        segmentId: 'seg-2',
        ignored: false,
      },
    ],
    clarifications: [
      {
        id: 'clar-1',
        sourceText: 'then ending idk',
        reason: 'The ending is incomplete.',
        segmentId: 'seg-3',
      },
    ],
  }
}

beforeEach(() => {
  globalThis.window = {
    localStorage: createLocalStorage(),
    setTimeout,
  }
})

afterEach(() => {
  delete globalThis.window
})

test('accepts a valid Prepare response and preserves explicit classifications', () => {
  const result = validatePrepareResult(validResult())
  assert.equal(result.segments[0].speaker, 'HF')
  assert.equal(result.segments[2].type, 'UNKNOWN')
  assert.equal(result.requirements[0].status, 'tentative')
})

test('rejects invalid and slash-combined segment classifications', () => {
  for (const type of ['OTHER', 'IMAGE_GRAPHIC / SCREEN_RECORDING']) {
    const result = validResult()
    result.segments[0].type = type
    assert.throws(() => validatePrepareResult(result), PrepareValidationError)
  }
})

test('rejects invalid requirement types and statuses', () => {
  const invalidType = validResult()
  invalidType.requirements[0].type = 'SPOKEN'
  assert.throws(
    () => validatePrepareResult(invalidType),
    PrepareValidationError,
  )

  const invalidStatus = validResult()
  invalidStatus.requirements[0].status = 'maybe'
  assert.throws(
    () => validatePrepareResult(invalidStatus),
    PrepareValidationError,
  )
})

test('rejects malformed and null Prepare responses safely', () => {
  for (const value of [null, undefined, {}, { segments: null }]) {
    assert.throws(() => validatePrepareResult(value), PrepareValidationError)
  }
})

test('local Prepare leaves source text untouched and returns separate metadata', () => {
  const source = SEMI_STRUCTURED_CREATOR_SCRIPT
  const original = `${source}`
  const result = buildLocalPrepareResult(source)

  assert.equal(source, original)
  assert.notEqual(result, source)
  assert.equal(result.segments.some((segment) => segment.type === 'SPOKEN'), true)
  assert.equal(
    result.requirements.some((requirement) => requirement.type === 'AI_VIDEO'),
    true,
  )
})

test('chaotic fixture keeps HF exact, UNKNOWN unknown, and tentative tentative', () => {
  const result = buildLocalPrepareResult(CHAOTIC_CREATOR_NOTES)
  assert.equal(result.segments.some((segment) => segment.speaker === 'HF'), true)
  assert.equal(result.segments.some((segment) => segment.type === 'UNKNOWN'), true)
  assert.equal(
    result.requirements.some(
      (requirement) =>
        requirement.type === 'AI_VIDEO' && requirement.status === 'tentative',
    ),
    true,
  )
})

test('documents known local Prepare classification edge cases for later interpretation work', () => {
  const cases = [
    {
      text: 'Use this while Jerod is interviewing so you can test everything except microphone input.',
      currentLocalType: 'SPOKEN',
      observedIssue: 'Meta/instructional text is treated as spoken.',
    },
    {
      text: '## Test Script',
      currentLocalType: 'SPOKEN',
      observedIssue: 'A structural Markdown heading is treated as spoken.',
    },
    {
      text: '[SCREEN RECORDING: open settings and change refresh interval]',
      currentLocalType: 'PRODUCTION_CUE',
      observedIssue: 'A screen-recording cue is treated as a generic production cue.',
    },
    {
      text: 'Show graph from downloads - not sure which one yet',
      currentLocalType: 'SPOKEN',
      observedType: 'CREATOR_REMINDER',
      observedIssue:
        'Observed as a creator reminder in manual testing; it may represent a tentative image/graphic requirement.',
    },
  ]

  for (const regressionCase of cases) {
    const result = buildLocalPrepareResult(regressionCase.text)

    assert.equal(result.segments.length, 1, regressionCase.observedIssue)
    assert.equal(
      result.segments[0].originalText,
      regressionCase.text,
      regressionCase.observedIssue,
    )
    assert.equal(
      result.segments[0].type,
      regressionCase.currentLocalType,
      regressionCase.observedIssue,
    )
  }
})

test('known tentative requirements do not become clarifications', () => {
  const result = buildLocalPrepareResult(SEMI_STRUCTURED_CREATOR_SCRIPT)
  const tentativeRequirement = result.requirements.find(
    (requirement) => requirement.status === 'tentative',
  )

  assert.equal(Boolean(tentativeRequirement), true)
  assert.equal(
    result.clarifications.some(
      (clarification) =>
        clarification.sourceText === tentativeRequirement.sourceText,
    ),
    false,
  )
})

test('UNKNOWN is the only unresolved clarification route', () => {
  const result = normalizePrepareReviewResult(validResult())
  const unresolved = getUnresolvedPrepareItems(result)

  assert.deepEqual(unresolved.map((segment) => segment.id), ['seg-3'])
  assert.equal(result.clarifications.length, 1)
  assert.equal(result.clarifications[0].segmentId, 'seg-3')
})

test('creator can change an interpretation classification without changing source text', () => {
  const source = 'then ending idk'
  const result = updatePrepareSegment(validResult(), 'seg-3', {
    type: 'CREATOR_REMINDER',
    status: 'confirmed',
  })

  assert.equal(result.segments[2].type, 'CREATOR_REMINDER')
  assert.equal(result.segments[2].originalText, source)
  assert.equal(result.requirements.at(-1).type, 'CREATOR_REMINDER')
})

test('creator can switch a requirement between confirmed and tentative', () => {
  const confirmed = updatePrepareRequirement(validResult(), 'req-1', {
    status: 'confirmed',
  })
  const tentative = updatePrepareRequirement(confirmed, 'req-1', {
    status: 'tentative',
  })

  assert.equal(confirmed.requirements[0].status, 'confirmed')
  assert.equal(tentative.requirements[0].status, 'tentative')
  assert.equal(tentative.segments[1].status, 'tentative')
})

test('resolving a clarification moves it into corrected metadata', () => {
  const result = resolvePrepareClarification(validResult(), 'clar-1', {
    type: 'CAMERA_CUT',
    status: 'confirmed',
  })

  assert.equal(result.segments[2].type, 'CAMERA_CUT')
  assert.equal(result.clarifications.length, 0)
  assert.equal(getUnresolvedPrepareItems(result).length, 0)
  assert.equal(result.requirements.at(-1).type, 'CAMERA_CUT')
})

test('a clarification can be explicitly ignored and stops blocking finalize', () => {
  const result = resolvePrepareClarification(validResult(), 'clar-1', {
    ignored: true,
    type: 'UNKNOWN',
  })

  assert.equal(result.segments[2].ignored, true)
  assert.equal(result.clarifications.length, 0)
  assert.equal(canFinalizePrepare(result), true)
  assert.equal(result.requirements.some((item) => item.segmentId === 'seg-3'), false)
})

test('saving UNKNOWN without a known classification remains unresolved', () => {
  const result = updatePrepareSegment(validResult(), 'seg-3', {
    type: 'UNKNOWN',
  })

  assert.equal(getUnresolvedPrepareItems(result).length, 1)
  assert.equal(result.clarifications.length, 1)
  assert.equal(canFinalizePrepare(result), false)
})

test('saving a known classification resolves and persists through the workflow', () => {
  const source = 'then ending idk'
  savePrepareResult(source, 'Auto', validResult())
  const workflow = createPrepareWorkflow()
  workflow.setContext(source, 'Auto')

  const corrected = workflow.updateSegment('seg-3', {
    status: 'tentative',
    type: 'CREATOR_REMINDER',
  })

  assert.equal(getUnresolvedPrepareItems(corrected).length, 0)
  assert.equal(corrected.clarifications.length, 0)
  assert.equal(corrected.requirements.at(-1).type, 'CREATOR_REMINDER')
  assert.equal(workflow.getState().result.segments[2].originalText, source)
  assert.deepEqual(loadPrepareResult(source, 'Auto'), corrected)
})

test('unresolved UNKNOWN blocks Finalize while known tentative does not', () => {
  assert.equal(canFinalizePrepare(validResult()), false)
  assert.throws(() => finalizePrepareResult(validResult()), PrepareValidationError)

  const resolved = resolvePrepareClarification(validResult(), 'clar-1', {
    type: 'CREATOR_REMINDER',
    status: 'tentative',
  })
  assert.equal(resolved.requirements.at(-1).status, 'tentative')
  assert.doesNotThrow(() => finalizePrepareResult(resolved))
})

test('successful Prepare metadata persists and restores for the same script', () => {
  const source = 'AJ: Keep the source unchanged.'
  const saved = savePrepareResult(source, 'Documentary', validResult())
  const restored = loadPrepareResult(source, 'Documentary')

  assert.deepEqual(restored, saved)
  assert.equal(getPrepareFingerprint(source, 'Documentary').length > 0, true)
})

test('Finalize persists corrections separately without changing the script', () => {
  const script = 'then ending idk'
  const original = `${script}`
  const corrected = resolvePrepareClarification(validResult(), 'clar-1', {
    type: 'CREATOR_REMINDER',
    status: 'tentative',
  })
  savePrepareResult(script, 'Auto', validResult())
  saveFinalizedPrepareResult(script, 'Auto', corrected)

  const stored = loadPrepareState(script, 'Auto')
  assert.equal(script, original)
  assert.equal(stored.finalizedResult.segments[2].type, 'CREATOR_REMINDER')
  assert.equal(stored.finalizedResult.segments[2].originalText, 'then ending idk')
  assert.equal(typeof stored.finalizedAt, 'string')
})

test('finalized corrections restore after refresh and remain isolated per script', () => {
  const corrected = resolvePrepareClarification(validResult(), 'clar-1', {
    type: 'CAMERA_CUT',
    status: 'confirmed',
  })
  saveFinalizedPrepareResult('Script A', 'Auto', corrected)

  assert.deepEqual(loadFinalizedPrepareResult('Script A', 'Auto'), corrected)
  assert.equal(loadFinalizedPrepareResult('Script B', 'Auto'), null)
})

test('re-prepare draft persistence preserves the last finalized snapshot', () => {
  const corrected = resolvePrepareClarification(validResult(), 'clar-1', {
    type: 'CAMERA_CUT',
    status: 'confirmed',
  })
  saveFinalizedPrepareResult('Script A', 'Auto', corrected)
  savePrepareResult('Script A', 'Auto', validResult())

  assert.deepEqual(
    loadFinalizedPrepareResult('Script A', 'Auto'),
    corrected,
  )
  assert.equal(loadPrepareResult('Script A', 'Auto').segments[2].type, 'UNKNOWN')
})

test('successful Finalize navigates to the existing teleprompter route', () => {
  const routes = []
  const result = finalizePrepareAndNavigate({
    finalize: () => finalizePrepareResult(
      resolvePrepareClarification(validResult(), 'clar-1', {
        type: 'CREATOR_REMINDER',
        status: 'confirmed',
      }),
    ),
    navigate: (route) => routes.push(route),
  })

  assert.equal(result, true)
  assert.deepEqual(routes, ['/teleprompter'])
})

test('Finalize is a local transition and does not invoke the Prepare provider', () => {
  let providerCalls = 0
  const corrected = resolvePrepareClarification(validResult(), 'clar-1', {
    type: 'CREATOR_REMINDER',
    status: 'confirmed',
  })
  savePrepareResult('Script A', 'Auto', corrected)
  const workflow = createPrepareWorkflow({
    provider: {
      prepare() {
        providerCalls += 1
        return corrected
      },
    },
  })
  workflow.setContext('Script A', 'Auto')

  const finalized = workflow.finalize()

  assert.equal(providerCalls, 0)
  assert.equal(finalized.segments[2].type, 'CREATOR_REMINDER')
  assert.deepEqual(loadFinalizedPrepareResult('Script A', 'Auto'), finalized)
})

test('teleprompter storage access returns creator-corrected finalized metadata', () => {
  const corrected = resolvePrepareClarification(validResult(), 'clar-1', {
    type: 'PRODUCTION_CUE',
    status: 'tentative',
  })
  saveFinalizedPrepareResult('Script A', 'Auto', corrected)

  const teleprompterMetadata = loadFinalizedPrepareResult('Script A', 'Auto')
  assert.equal(teleprompterMetadata.segments[2].type, 'PRODUCTION_CUE')
  assert.equal(teleprompterMetadata.segments[2].originalText, 'then ending idk')
})

test('Prepare metadata remains isolated between scripts and exact source text', () => {
  savePrepareResult('Script A', 'Auto', validResult())

  assert.deepEqual(loadPrepareResult('Script A', 'Auto'), validResult())
  assert.equal(loadPrepareResult('Script B', 'Auto'), null)
  assert.equal(loadPrepareResult('Script A ', 'Auto'), null)
})

test('invalid stored Prepare data fails safely', () => {
  window.localStorage.setItem(
    'scripty.prepareResults',
    JSON.stringify({
      version: 1,
      scripts: {
        [getPrepareFingerprint('Script A', 'Auto')]: { result: null },
      },
    }),
  )
  assert.equal(loadPrepareResult('Script A', 'Auto'), null)
})

test('rapid repeated Prepare calls invoke exactly one provider operation', async () => {
  let invocationCount = 0
  let resolveProvider
  const providerPromise = new Promise((resolve) => {
    resolveProvider = resolve
  })
  const workflow = createPrepareWorkflow({
    provider: {
      prepare() {
        invocationCount += 1
        return providerPromise
      },
    },
  })
  workflow.setContext('HF: aliens. obviously.', 'Auto')

  const first = workflow.prepare()
  const second = workflow.prepare()
  const third = workflow.prepare()

  assert.equal(workflow.getState().status, 'loading')
  assert.equal(first, second)
  assert.equal(second, third)
  await Promise.resolve()
  assert.equal(invocationCount, 1)

  resolveProvider(validResult())
  await Promise.all([first, second, third])
  assert.equal(workflow.getState().status, 'success')
})

test('loading button state disables immediately and success clears loading', async () => {
  const workflow = createPrepareWorkflow({
    provider: createLocalPrepareProvider({ delayMs: 0 }),
  })
  workflow.setContext(SEMI_STRUCTURED_CREATOR_SCRIPT, 'Auto')
  const request = workflow.prepare()

  assert.deepEqual(
    getPrepareButtonState({
      hasScript: true,
      result: null,
      status: workflow.getState().status,
    }),
    { disabled: true, label: 'Preparing...' },
  )
  await request
  assert.equal(workflow.getState().status, 'success')
})

test('failure clears loading, keeps a previous result, and allows retry', async () => {
  let shouldFail = false
  let calls = 0
  const workflow = createPrepareWorkflow({
    provider: {
      async prepare() {
        calls += 1
        if (shouldFail) throw new Error('network-style failure')
        return validResult()
      },
    },
  })
  workflow.setContext('HF: aliens. obviously.', 'Auto')
  await workflow.prepare()
  const previous = workflow.getState().result

  shouldFail = true
  await assert.rejects(workflow.prepare())
  assert.equal(workflow.getState().status, 'error')
  assert.deepEqual(workflow.getState().result, previous)

  shouldFail = false
  await workflow.prepare()
  assert.equal(calls, 3)
  assert.equal(workflow.getState().status, 'success')
})

test('a malformed provider result preserves source and prior prepared metadata', async () => {
  const source = 'HF: aliens. obviously.'
  let response = validResult()
  const workflow = createPrepareWorkflow({
    provider: { async prepare() { return response } },
  })
  workflow.setContext(source, 'Auto')
  await workflow.prepare()
  const previous = workflow.getState().result

  response = null
  await assert.rejects(workflow.prepare(), PrepareValidationError)
  assert.equal(source, 'HF: aliens. obviously.')
  assert.deepEqual(workflow.getState().result, previous)
  assert.equal(workflow.getState().status, 'error')
})
