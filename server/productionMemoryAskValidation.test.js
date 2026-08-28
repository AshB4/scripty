import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ProductionMemoryAskValidationError,
  validateProductionMemoryAskRequest,
} from './productionMemoryAskValidation.js'

test('validates a normalized production-memory agent request', () => {
  assert.deepEqual(validateProductionMemoryAskRequest({
    productionId: ' demo-script ',
    question: ' What do I still need to finish? ',
  }), {
    productionId: 'demo-script',
    question: 'What do I still need to finish?',
  })
})

test('accepts only the supported Production Assistant questions', () => {
  for (const question of [
    'What do I still need to finish?',
    'What needs another take?',
    'Which production assets are still missing?',
    'Where should I resume?',
  ]) {
    assert.equal(validateProductionMemoryAskRequest({
      productionId: 'demo-script',
      question,
    }).question, question)
  }
  assert.throws(
    () => validateProductionMemoryAskRequest({
      productionId: 'demo-script',
      question: 'Show every table.',
    }),
    ProductionMemoryAskValidationError,
  )
})

test('rejects malformed production-memory agent requests', () => {
  for (const request of [
    null,
    [],
    {},
    { productionId: '', question: 'status' },
    { productionId: 'demo-script', question: '' },
    { productionId: 'demo-script', question: 42 },
  ]) {
    assert.throws(
      () => validateProductionMemoryAskRequest(request),
      ProductionMemoryAskValidationError,
    )
  }
})
