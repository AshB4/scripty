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
