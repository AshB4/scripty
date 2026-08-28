import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProductionMemoryAssistantController,
  WHATS_LEFT_QUESTION,
} from './useProductionMemoryAssistant.js'

test('Production Assistant shows loading, renders the grounded answer, and asks again', async () => {
  const requests = []
  let resolveRequest
  const controller = createProductionMemoryAssistantController({
    askProductionMemoryRequest: (request) => {
      requests.push(request)
      if (requests.length > 1) return Promise.resolve({ answer: 'Nothing else.' })
      return new Promise((resolve) => { resolveRequest = resolve })
    },
  })

  const firstRequest = controller.ask('current-production')
  assert.deepEqual(controller.getState(), {
    answer: null,
    error: null,
    status: 'loading',
  })
  await controller.ask('current-production')
  assert.equal(requests.length, 1)

  resolveRequest({ answer: 'Redo: Scene 2.' })
  await firstRequest
  assert.deepEqual(controller.getState(), {
    answer: 'Redo: Scene 2.',
    error: null,
    status: 'success',
  })

  await controller.ask('current-production')
  assert.deepEqual(requests, [
    {
      productionId: 'current-production',
      question: WHATS_LEFT_QUESTION,
    },
    {
      productionId: 'current-production',
      question: WHATS_LEFT_QUESTION,
    },
  ])
})

test('Production Assistant renders no-work answers and safe failures without local fallback', async () => {
  const completeController = createProductionMemoryAssistantController({
    askProductionMemoryRequest: async () => ({ answer: 'The production work is complete.' }),
  })
  await completeController.ask('current-production')
  assert.deepEqual(completeController.getState(), {
    answer: 'The production work is complete.',
    error: null,
    status: 'success',
  })

  const failingController = createProductionMemoryAssistantController({
    askProductionMemoryRequest: async () => {
      throw new Error('Production Assistant is unavailable.')
    },
  })
  await failingController.ask('current-production')
  assert.deepEqual(failingController.getState(), {
    answer: null,
    error: 'Production Assistant is unavailable.',
    status: 'error',
  })
})
