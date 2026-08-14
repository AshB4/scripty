import { validatePrepareResult, PrepareValidationError } from './prepareContract.js'
import { localPrepareProvider } from './localPrepareProvider.js'
import {
  getPrepareFingerprint,
  loadPrepareState,
  saveFinalizedPrepareResult,
  savePrepareResult,
} from './prepareStorage.js'
import {
  finalizePrepareResult,
  normalizePrepareReviewResult,
  resolvePrepareClarification,
  updatePrepareRequirement,
  updatePrepareSegment,
} from './prepareReview.js'

const initialState = Object.freeze({
  error: '',
  finalizedAt: null,
  finalizedResult: null,
  result: null,
  status: 'idle',
})

function getPrepareError(error) {
  if (error instanceof PrepareValidationError) {
    return 'Scripty could not validate this Prepare result. Please try again.'
  }
  return 'Scripty could not prepare this script. Please try again.'
}

export function getPrepareButtonState({ hasScript, result, status }) {
  if (status === 'loading') {
    return { disabled: true, label: 'Preparing...' }
  }
  return {
    disabled: !hasScript,
    label: result ? 'Prepare again' : 'Prepare for Recording',
  }
}

export function createPrepareWorkflow({
  provider = localPrepareProvider,
  storage = {
    load: loadPrepareState,
    saveFinalized: saveFinalizedPrepareResult,
    save: savePrepareResult,
  },
} = {}) {
  let context = { fingerprint: '', parserMode: 'Auto', script: '' }
  let state = initialState
  let activeRequest = null
  const listeners = new Set()

  const emit = (nextState) => {
    state = nextState
    listeners.forEach((listener) => listener(state))
  }

  const setContext = (script, parserMode = 'Auto') => {
    const fingerprint = getPrepareFingerprint(script, parserMode)
    if (context.fingerprint === fingerprint) return

    context = { fingerprint, parserMode, script }
    const stored = String(script ?? '').trim()
      ? storage.load(script, parserMode)
      : { finalizedAt: null, finalizedResult: null, result: null }
    const result = normalizePrepareReviewResult(stored.result)
    emit({
      error: '',
      finalizedAt: stored.finalizedAt,
      finalizedResult: stored.finalizedResult,
      result,
      status: result ? 'success' : 'idle',
    })
  }

  const prepare = () => {
    if (activeRequest) return activeRequest
    if (!String(context.script ?? '').trim()) {
      const error = new Error('A script is required before Prepare can run.')
      emit({ ...state, error: getPrepareError(error), status: 'error' })
      return Promise.reject(error)
    }

    const requestContext = { ...context }
    emit({ ...state, error: '', status: 'loading' })

    activeRequest = Promise.resolve()
      .then(() => provider.prepare(requestContext.script))
      .then((rawResult) => validatePrepareResult(rawResult))
      .then((result) => {
        storage.save(
          requestContext.script,
          requestContext.parserMode,
          result,
        )
        if (context.fingerprint === requestContext.fingerprint) {
          emit({
            ...state,
            error: '',
            result: normalizePrepareReviewResult(result),
            status: 'success',
          })
        }
        return result
      })
      .catch((error) => {
        if (context.fingerprint === requestContext.fingerprint) {
          emit({ ...state, error: getPrepareError(error), status: 'error' })
        }
        throw error
      })
      .finally(() => {
        activeRequest = null
      })

    return activeRequest
  }

  const updateResult = (updater) => {
    if (!state.result) return null
    const result = normalizePrepareReviewResult(updater(state.result))
    storage.save(context.script, context.parserMode, result)
    emit({ ...state, error: '', result, status: 'success' })
    return result
  }

  const updateSegment = (segmentId, correction) =>
    updateResult((result) =>
      updatePrepareSegment(result, segmentId, correction),
    )

  const updateRequirement = (requirementId, correction) =>
    updateResult((result) =>
      updatePrepareRequirement(result, requirementId, correction),
    )

  const resolveClarification = (clarificationId, correction) =>
    updateResult((result) =>
      resolvePrepareClarification(result, clarificationId, correction),
    )

  const finalize = () => {
    if (!state.result) return null
    const finalizedResult = finalizePrepareResult(state.result)
    const saved = storage.saveFinalized(
      context.script,
      context.parserMode,
      finalizedResult,
    )
    emit({
      ...state,
      error: '',
      finalizedAt: saved.finalizedAt,
      finalizedResult: saved.finalizedResult,
      result: saved.finalizedResult,
      status: 'success',
    })
    return saved.finalizedResult
  }

  return {
    getState: () => state,
    finalize,
    prepare,
    resolveClarification,
    setContext,
    updateRequirement,
    updateSegment,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function finalizePrepareAndNavigate({ finalize, navigate }) {
  const finalizedResult = finalize()
  if (!finalizedResult) return false
  navigate('/teleprompter')
  return true
}
