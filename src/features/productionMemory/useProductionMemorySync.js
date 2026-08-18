import { useCallback, useEffect, useMemo } from 'react'
import { syncProductionMemorySnapshot } from './productionMemoryApi.js'

export const PRODUCTION_MEMORY_SYNC_DEBOUNCE_MS = 750

export function getProductionMemorySnapshotKey(snapshot) {
  return JSON.stringify(snapshot ?? null)
}

function reportSyncFailure(error) {
  if (typeof console === 'undefined') return
  console.warn('Production memory sync failed.', {
    message: error instanceof Error ? error.message : 'Unknown error',
  })
}

export function createProductionMemorySyncController({
  cancel = clearTimeout,
  debounceMs = PRODUCTION_MEMORY_SYNC_DEBOUNCE_MS,
  onError = reportSyncFailure,
  schedule = setTimeout,
  syncSnapshot = syncProductionMemorySnapshot,
} = {}) {
  let latestSnapshot = null
  let latestKey = null
  let lastSyncedKey = null
  let timer = null
  let inFlight = false
  let needsSync = false
  let activePromise = Promise.resolve({ skipped: true })

  const clearPendingTimer = () => {
    if (timer === null) return
    cancel(timer)
    timer = null
  }

  const run = () => {
    clearPendingTimer()

    if (inFlight) {
      return activePromise.then(() => {
        if (needsSync && latestKey !== lastSyncedKey) {
          return run()
        }
        return { skipped: true }
      })
    }

    if (!needsSync || !latestSnapshot || latestKey === lastSyncedKey) {
      needsSync = false
      return Promise.resolve({ skipped: true })
    }

    const snapshot = latestSnapshot
    const key = latestKey
    needsSync = false
    inFlight = true

    activePromise = Promise.resolve()
      .then(() => syncSnapshot(snapshot))
      .then((result) => {
        lastSyncedKey = key
        return result
      })
      .catch((error) => {
        onError(error)
        return { error, ok: false }
      })
      .finally(() => {
        inFlight = false
      })

    return activePromise.then((result) => {
      if (needsSync && latestKey !== lastSyncedKey) {
        return run()
      }
      return result
    })
  }

  const setLatestSnapshot = (snapshot) => {
    latestSnapshot = snapshot
    latestKey = getProductionMemorySnapshotKey(snapshot)
    if (latestKey === lastSyncedKey) return false
    needsSync = true
    return true
  }

  return {
    dispose() {
      clearPendingTimer()
    },
    schedule(snapshot) {
      if (!setLatestSnapshot(snapshot)) return
      clearPendingTimer()
      timer = schedule(run, debounceMs)
    },
    syncNow(snapshot = latestSnapshot) {
      setLatestSnapshot(snapshot)
      return run()
    },
  }
}

export function useProductionMemorySync(snapshot, options = null) {
  const controller = useMemo(
    () => createProductionMemorySyncController(options ?? {}),
    [options],
  )

  useEffect(() => () => controller.dispose(), [controller])

  useEffect(() => {
    controller.schedule(snapshot)
  }, [controller, snapshot])

  return {
    syncNow: useCallback(() => controller.syncNow(snapshot), [
      controller,
      snapshot,
    ]),
  }
}
