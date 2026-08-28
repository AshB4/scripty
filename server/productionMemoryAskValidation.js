const MAX_ID_LENGTH = 512
const MAX_QUESTION_LENGTH = 2000

export class ProductionMemoryAskValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ProductionMemoryAskValidationError'
  }
}

function requiredString(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw new ProductionMemoryAskValidationError(`${field} must be a string.`)
  }

  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    throw new ProductionMemoryAskValidationError(`${field} is invalid.`)
  }

  return normalized
}

export function validateProductionMemoryAskRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new ProductionMemoryAskValidationError('Request must be an object.')
  }

  const question = requiredString(request.question, 'question', MAX_QUESTION_LENGTH)
  if (!isProductionMemoryQuestion(question)) {
    throw new ProductionMemoryAskValidationError('question is unsupported.')
  }

  return {
    productionId: requiredString(request.productionId, 'productionId', MAX_ID_LENGTH),
    question,
  }
}
import { isProductionMemoryQuestion } from '../productionMemoryQuestions.js'
