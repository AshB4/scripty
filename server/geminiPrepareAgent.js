import { GoogleGenAI } from '@google/genai'
import {
  PREPARE_REQUIREMENT_STATUSES,
  PREPARE_SEGMENT_TYPES,
} from '../src/features/scripts/prepare/prepareContract.js'
import { validateGeminiPrepareResponse } from './geminiPrepareValidation.js'

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          status: {
            anyOf: [
              { type: 'string', enum: PREPARE_REQUIREMENT_STATUSES },
              { type: 'null' },
            ],
          },
          type: { type: 'string', enum: PREPARE_SEGMENT_TYPES },
        },
        required: ['id', 'status', 'type'],
      },
    },
  },
  required: ['classifications'],
}

export class GeminiPrepareAgentError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'GeminiPrepareAgentError'
  }
}

function requiredConfigString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new GeminiPrepareAgentError(`${field} is required.`)
  }
  return value.trim()
}

export function getGeminiPrepareInstruction({ parserMode, parserSegments }) {
  return `You are Scripty's Prepare classifier. The parser has already determined every structural segment. Your job is semantic production classification only.

Parser mode: ${parserMode}

Rules:
- Classify every supplied segment exactly once, using only its supplied id.
- Never create, merge, split, reorder, or omit segments.
- Never rewrite source text, dialogue, punctuation, or formatting.
- Use only these classifications: ${PREPARE_SEGMENT_TYPES.join(', ')}.
- Use UNKNOWN with status null when the meaning needs creator clarification.
- Use SPOKEN with status null for spoken content.
- For every other classification, choose confirmed or tentative. Use tentative when the cue is uncertain.
- Return only the JSON object required by the response schema.

Parser-owned segments:
${JSON.stringify(parserSegments)}`
}

function parseJsonResponse(response) {
  if (typeof response?.text !== 'string' || !response.text.trim()) {
    throw new GeminiPrepareAgentError('Gemini did not return a classification response.')
  }
  try {
    return JSON.parse(response.text)
  } catch (error) {
    throw new GeminiPrepareAgentError('Gemini returned invalid JSON.', { cause: error })
  }
}

export function createGeminiPrepareAgent({
  GoogleGenAIClient = GoogleGenAI,
  googleAgentModel,
  googleCloudLocation,
  googleCloudProject,
  googleGenAiUseVertexAi = true,
} = {}) {
  return {
    async classify(request) {
      const config = {
        googleAgentModel: requiredConfigString(googleAgentModel, 'googleAgentModel'),
        googleCloudLocation: requiredConfigString(googleCloudLocation, 'googleCloudLocation'),
        googleCloudProject: requiredConfigString(googleCloudProject, 'googleCloudProject'),
      }
      if (googleGenAiUseVertexAi !== true) {
        throw new GeminiPrepareAgentError('Vertex AI must be enabled for Gemini Prepare.')
      }

      try {
        const client = new GoogleGenAIClient({
          location: config.googleCloudLocation,
          project: config.googleCloudProject,
          vertexai: true,
        })
        const response = await client.models.generateContent({
          model: config.googleAgentModel,
          contents: getGeminiPrepareInstruction(request),
          config: {
            responseJsonSchema: responseSchema,
            responseMimeType: 'application/json',
            temperature: 0,
          },
        })
        return validateGeminiPrepareResponse(
          parseJsonResponse(response),
          request.parserSegments,
        )
      } catch (error) {
        if (error instanceof GeminiPrepareAgentError) throw error
        throw new GeminiPrepareAgentError('Unable to classify Prepare segments.', {
          cause: error,
        })
      }
    },
  }
}
