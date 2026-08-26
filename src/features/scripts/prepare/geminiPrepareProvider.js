import { buildPrepareResultFromClassifications } from './localPrepareProvider.js'
import { localPrepareProvider } from './localPrepareProvider.js'

const DEFAULT_ENDPOINT = '/api/prepare/classify'
const DEFAULT_TIMEOUT_MS = 8000

function parserPayload(parserSegments) {
  return parserSegments.map((segment) => ({
    id: segment.id,
    speaker: segment.speakerLabel ?? segment.speaker ?? null,
    subtype: segment.subtype ?? null,
    text: segment.text,
    type: segment.type,
  }))
}

async function readJsonResponse(response) {
  try {
    return await response.json()
  } catch {
    throw new Error('Gemini Prepare returned invalid JSON.')
  }
}

export function createGeminiPrepareProvider({
  endpoint = DEFAULT_ENDPOINT,
  fallbackProvider = localPrepareProvider,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return {
    async prepare(context) {
      try {
        if (typeof fetchImpl !== 'function') {
          throw new Error('Gemini Prepare is unavailable.')
        }
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)
        let response
        try {
          response = await fetchImpl(endpoint, {
            body: JSON.stringify({
              parserMode: context.parserMode,
              parserSegments: parserPayload(context.parserSegments),
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeout)
        }
        const body = await readJsonResponse(response)
        if (!response.ok) throw new Error('Gemini Prepare request failed.')
        if (
          !Array.isArray(body?.classifications) ||
          body.classifications.some(
            (classification) => !Object.hasOwn(classification ?? {}, 'status'),
          )
        ) {
          throw new Error('Gemini Prepare response is incomplete.')
        }
        return buildPrepareResultFromClassifications(context, body?.classifications)
      } catch {
        return fallbackProvider.prepare(context)
      }
    },
  }
}

export const geminiPrepareProvider = createGeminiPrepareProvider()
