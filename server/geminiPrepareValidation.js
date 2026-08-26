import {
  isPrepareRequirementStatus,
  isPrepareSegmentType,
} from '../src/features/scripts/prepare/prepareContract.js'

const MAX_SEGMENTS = 5000
const MAX_ID_LENGTH = 512
const MAX_TEXT_LENGTH = 20000

export class GeminiPrepareValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GeminiPrepareValidationError'
  }
}

function requiredString(value, field, maxLength = MAX_ID_LENGTH) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new GeminiPrepareValidationError(`${field} is invalid.`)
  }
  return value
}

function nullableString(value, field) {
  if (value == null) return null
  return requiredString(value, field, MAX_ID_LENGTH)
}

export function validateGeminiPrepareRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new GeminiPrepareValidationError('Request must be an object.')
  }
  if (!Array.isArray(request.parserSegments) || request.parserSegments.length > MAX_SEGMENTS) {
    throw new GeminiPrepareValidationError('parserSegments is invalid.')
  }

  const ids = new Set()
  const parserSegments = request.parserSegments.map((segment, index) => {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
      throw new GeminiPrepareValidationError(`parserSegments[${index}] is invalid.`)
    }
    const id = requiredString(segment.id, `parserSegments[${index}].id`)
    if (ids.has(id)) {
      throw new GeminiPrepareValidationError('parserSegments contains duplicate IDs.')
    }
    ids.add(id)
    return {
      id,
      speaker: nullableString(segment.speaker, `parserSegments[${index}].speaker`),
      subtype: nullableString(segment.subtype, `parserSegments[${index}].subtype`),
      text: requiredString(segment.text, `parserSegments[${index}].text`, MAX_TEXT_LENGTH),
      type: requiredString(segment.type, `parserSegments[${index}].type`),
    }
  })

  return {
    parserMode: requiredString(request.parserMode, 'parserMode'),
    parserSegments,
  }
}

export function validateGeminiPrepareResponse(response, parserSegments) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new GeminiPrepareValidationError('Gemini response must be an object.')
  }
  if (!Array.isArray(response.classifications) || response.classifications.length !== parserSegments.length) {
    throw new GeminiPrepareValidationError('Gemini response must classify every parser segment.')
  }

  const parserIds = new Set(parserSegments.map((segment) => segment.id))
  const ids = new Set()
  const classifications = response.classifications.map((classification, index) => {
    if (!classification || typeof classification !== 'object' || Array.isArray(classification)) {
      throw new GeminiPrepareValidationError(`classifications[${index}] is invalid.`)
    }
    if (!Object.hasOwn(classification, 'status')) {
      throw new GeminiPrepareValidationError(`classifications[${index}].status is required.`)
    }
    const id = requiredString(classification.id, `classifications[${index}].id`)
    if (!parserIds.has(id) || ids.has(id)) {
      throw new GeminiPrepareValidationError('Gemini response contains an invalid segment ID.')
    }
    ids.add(id)
    const type = requiredString(classification.type, `classifications[${index}].type`)
    if (!isPrepareSegmentType(type)) {
      throw new GeminiPrepareValidationError('Gemini response contains an unsupported classification.')
    }
    const status = classification.status ?? null
    if (type === 'SPOKEN' || type === 'UNKNOWN') {
      if (status !== null) {
        throw new GeminiPrepareValidationError('Gemini response has an invalid status.')
      }
    } else if (!isPrepareRequirementStatus(status)) {
      throw new GeminiPrepareValidationError('Gemini response has an invalid status.')
    }
    return { id, status, type }
  })

  return { classifications }
}
