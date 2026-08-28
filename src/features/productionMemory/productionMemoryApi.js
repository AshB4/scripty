export class ProductionMemoryApiError extends Error {
  constructor(message, { status = null } = {}) {
    super(message)
    this.name = 'ProductionMemoryApiError'
    this.status = status
  }
}

async function readJsonResponse(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function syncProductionMemorySnapshot(
  snapshot,
  { fetchImpl = globalThis.fetch } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new ProductionMemoryApiError('Production memory sync is unavailable.')
  }

  let response
  try {
    response = await fetchImpl('/api/production-memory/sync', {
      body: JSON.stringify(snapshot),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  } catch {
    throw new ProductionMemoryApiError('Production memory sync failed.')
  }

  const body = await readJsonResponse(response)
  if (!response.ok) {
    throw new ProductionMemoryApiError(
      body?.message ?? 'Production memory sync failed.',
      { status: response.status },
    )
  }

  return body
}

export async function askProductionMemory(
  { productionId, question },
  { fetchImpl = globalThis.fetch } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new ProductionMemoryApiError('Production Assistant is unavailable.')
  }

  let response
  try {
    response = await fetchImpl('/api/production-memory/ask', {
      body: JSON.stringify({ productionId, question }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  } catch {
    throw new ProductionMemoryApiError('Production Assistant is unavailable.')
  }

  const body = await readJsonResponse(response)
  if (!response.ok) {
    throw new ProductionMemoryApiError(
      body?.message ?? 'Production Assistant could not check current production work.',
      { status: response.status },
    )
  }
  if (typeof body?.answer !== 'string' || !body.answer.trim()) {
    throw new ProductionMemoryApiError('Production Assistant returned an invalid response.')
  }

  return {
    answer: body.answer.trim(),
    productionId: body.productionId,
  }
}
