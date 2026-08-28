import { useCallback, useEffect, useMemo, useState } from 'react'
import { WHATS_LEFT_QUESTION } from '../../../productionMemoryQuestions.js'
import { askProductionMemory } from './productionMemoryApi.js'

export { WHATS_LEFT_QUESTION }

const INITIAL_STATE = Object.freeze({
  answer: null,
  completion: null,
  error: null,
  question: null,
  status: 'idle',
})

function safeErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : 'Production Assistant could not check current production work.'
}

export function createProductionMemoryAssistantController({
  askProductionMemoryRequest = askProductionMemory,
} = {}) {
  let requestId = 0
  let state = INITIAL_STATE
  const listeners = new Set()

  const publish = (nextState) => {
    state = nextState
    listeners.forEach((listener) => listener(state))
  }

  return {
    ask(productionId, question = WHATS_LEFT_QUESTION) {
      if (state.status === 'loading') return Promise.resolve({ skipped: true })

      const currentRequestId = ++requestId
      publish({ answer: null, completion: null, error: null, question, status: 'loading' })
      return Promise.resolve(askProductionMemoryRequest({
        productionId,
        question,
      })).then((result) => {
        if (currentRequestId !== requestId) return { skipped: true }
        publish({
          answer: result.answer,
          completion: result.completion ?? null,
          error: null,
          question,
          status: 'success',
        })
        return result
      }).catch((error) => {
        if (currentRequestId !== requestId) return { skipped: true }
        publish({ answer: null, completion: null, error: safeErrorMessage(error), question, status: 'error' })
        return { error, ok: false }
      })
    },

    getState() {
      return state
    },

    reset() {
      requestId += 1
      publish(INITIAL_STATE)
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useProductionMemoryAssistant(productionId) {
  const controller = useMemo(() => createProductionMemoryAssistantController(), [])
  const [state, setState] = useState(controller.getState())

  useEffect(() => controller.subscribe(setState), [controller])
  useEffect(() => controller.reset(), [controller, productionId])

  return {
    ...state,
    ask: useCallback(
      (question) => controller.ask(productionId, question),
      [controller, productionId],
    ),
  }
}
