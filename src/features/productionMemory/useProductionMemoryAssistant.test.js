import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProductionMemoryAssistantController,
  WHATS_LEFT_QUESTION,
} from './useProductionMemoryAssistant.js'
import { PRODUCTION_MEMORY_QUESTIONS } from '../../../productionMemoryQuestions.js'

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
    completion: null,
    error: null,
    question: WHATS_LEFT_QUESTION,
    status: 'loading',
  })
  await controller.ask('current-production', 'What needs another take?')
  assert.equal(requests.length, 1)

  resolveRequest({ answer: 'Redo: Scene 2.' })
  await firstRequest
  assert.deepEqual(controller.getState(), {
    answer: 'Redo: Scene 2.',
    completion: null,
    error: null,
    question: WHATS_LEFT_QUESTION,
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

test('Production Assistant permits a new request after a failed request', async () => {
  let calls = 0
  const controller = createProductionMemoryAssistantController({
    askProductionMemoryRequest: async () => {
      calls += 1
      if (calls === 1) throw new Error('Production Assistant is unavailable.')
      return { answer: 'Redo: Scene 2.' }
    },
  })

  await controller.ask('current-production')
  assert.equal(controller.getState().status, 'error')
  await controller.ask('current-production', 'What needs another take?')
  assert.deepEqual(controller.getState(), {
    answer: 'Redo: Scene 2.',
    completion: null,
    error: null,
    question: 'What needs another take?',
    status: 'success',
  })
  assert.equal(calls, 2)
})

test('Production Assistant renders no-work answers and safe failures without local fallback', async () => {
  const completeController = createProductionMemoryAssistantController({
    askProductionMemoryRequest: async () => ({ answer: 'The production work is complete.' }),
  })
  await completeController.ask('current-production')
  assert.deepEqual(completeController.getState(), {
    answer: 'The production work is complete.',
    completion: null,
    error: null,
    question: WHATS_LEFT_QUESTION,
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
    completion: null,
    error: 'Production Assistant is unavailable.',
    question: WHATS_LEFT_QUESTION,
    status: 'error',
  })
})

test('Production Assistant sends each fixed question once and never auto-queries', async () => {
  const requests = []
  const controller = createProductionMemoryAssistantController({
    askProductionMemoryRequest: async (request) => {
      requests.push(request)
      return { answer: 'Grounded answer.' }
    },
  })

  assert.equal(requests.length, 0)
  controller.reset()
  assert.equal(requests.length, 0)

  for (const { label } of PRODUCTION_MEMORY_QUESTIONS) {
    await controller.ask('current-production', label)
  }

  assert.deepEqual(requests, PRODUCTION_MEMORY_QUESTIONS.map(({ label }) => ({
    productionId: 'current-production',
    question: label,
  })))
})
