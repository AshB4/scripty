import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GeminiPrepareValidationError,
  validateGeminiPrepareRequest,
  validateGeminiPrepareResponse,
} from './geminiPrepareValidation.js'

const parserSegments = [
  { id: '1-dialogue', text: 'Hello there.', type: 'dialogue' },
  { id: '2-direction', text: '[cut to robot]', type: 'direction' },
]

function validResponse() {
  return {
    classifications: [
      { id: '1-dialogue', status: null, type: 'SPOKEN' },
      { id: '2-direction', status: 'confirmed', type: 'CAMERA_CUT' },
    ],
  }
}

test('Gemini Prepare request retains only parser-owned segment data', () => {
  const request = validateGeminiPrepareRequest({
    parserMode: 'Auto',
    parserSegments,
    script: 'This is intentionally not forwarded to Gemini.',
  })

  assert.deepEqual(request, {
    parserMode: 'Auto',
    parserSegments: parserSegments.map((segment) => ({
      ...segment,
      speaker: null,
      subtype: null,
    })),
  })
})

test('Gemini Prepare response requires one supported classification for each parser ID', () => {
  assert.deepEqual(
    validateGeminiPrepareResponse(validResponse(), parserSegments),
    validResponse(),
  )

  const cases = [
    { ...validResponse(), classifications: [...validResponse().classifications, { id: 'invented', status: null, type: 'SPOKEN' }] },
    { classifications: [validResponse().classifications[0]] },
    { classifications: [{ id: '1-dialogue', type: 'SPOKEN' }, validResponse().classifications[1]] },
    { classifications: [{ ...validResponse().classifications[0] }, { ...validResponse().classifications[0] }] },
    { classifications: [{ ...validResponse().classifications[0], type: 'OTHER' }, validResponse().classifications[1]] },
  ]
  for (const response of cases) {
    assert.throws(
      () => validateGeminiPrepareResponse(response, parserSegments),
      GeminiPrepareValidationError,
    )
  }
})
