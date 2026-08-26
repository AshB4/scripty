import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createGeminiPrepareAgent,
  GeminiPrepareAgentError,
} from './geminiPrepareAgent.js'

const request = {
  parserMode: 'Auto',
  parserSegments: [
    { id: '1-dialogue', text: 'Hello there.', type: 'dialogue' },
    { id: '2-direction', text: '[cut to robot]', type: 'direction' },
  ],
}

function createFakeClient(text) {
  const captured = {}
  class FakeGoogleGenAI {
    constructor(options) {
      captured.options = options
      this.models = {
        async generateContent(options) {
          captured.request = options
          return { text }
        },
      }
    }
  }
  return { FakeGoogleGenAI, captured }
}

test('Gemini Prepare uses Vertex structured output and validates parser IDs', async () => {
  const fake = createFakeClient(JSON.stringify({
    classifications: [
      { id: '1-dialogue', status: null, type: 'SPOKEN' },
      { id: '2-direction', status: 'confirmed', type: 'CAMERA_CUT' },
    ],
  }))
  const agent = createGeminiPrepareAgent({
    GoogleGenAIClient: fake.FakeGoogleGenAI,
    googleAgentModel: 'gemini-test-flash',
    googleCloudLocation: 'us-central1',
    googleCloudProject: 'test-project',
  })

  const result = await agent.classify(request)

  assert.deepEqual(result.classifications.map((item) => item.id), ['1-dialogue', '2-direction'])
  assert.deepEqual(fake.captured.options, {
    location: 'us-central1',
    project: 'test-project',
    vertexai: true,
  })
  assert.equal(fake.captured.request.config.responseMimeType, 'application/json')
  assert.equal(fake.captured.request.config.temperature, 0)
  assert.match(fake.captured.request.contents, /Never create, merge, split, reorder, or omit segments/)
  assert.match(fake.captured.request.contents, /1-dialogue/)
})

test('Gemini Prepare rejects malformed or structurally invalid model output', async () => {
  for (const text of [
    'not json',
    JSON.stringify({ classifications: [{ id: 'invented', status: null, type: 'SPOKEN' }] }),
  ]) {
    const fake = createFakeClient(text)
    const agent = createGeminiPrepareAgent({
      GoogleGenAIClient: fake.FakeGoogleGenAI,
      googleAgentModel: 'gemini-test-flash',
      googleCloudLocation: 'us-central1',
      googleCloudProject: 'test-project',
    })
    await assert.rejects(agent.classify(request), GeminiPrepareAgentError)
  }
})
