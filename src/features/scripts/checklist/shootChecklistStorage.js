import { getPrepareFingerprint } from '../prepare/prepareStorage.js'
import { normalizeShootChecklistState } from './shootChecklist.js'

const STORAGE_KEY = 'scripty.shootChecklist'
const STORAGE_VERSION = 1

function readRoot() {
  if (typeof window === 'undefined') {
    return { scripts: {}, version: STORAGE_VERSION }
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return { scripts: {}, version: STORAGE_VERSION }
    const parsed = JSON.parse(stored)
    return {
      scripts:
        parsed?.scripts && typeof parsed.scripts === 'object'
          ? parsed.scripts
          : {},
      version: STORAGE_VERSION,
    }
  } catch {
    return { scripts: {}, version: STORAGE_VERSION }
  }
}

function writeRoot(root) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root))
  } catch {
    // The checklist remains usable for the current session without storage.
  }
}

export function getShootChecklistFingerprint(script, parserMode = 'Auto') {
  return getPrepareFingerprint(script, parserMode)
}

export function loadShootChecklistState(script, parserMode = 'Auto') {
  const fingerprint = getShootChecklistFingerprint(script, parserMode)
  return normalizeShootChecklistState(readRoot().scripts[fingerprint])
}

export function saveShootChecklistState(
  script,
  parserMode = 'Auto',
  state = {},
) {
  const fingerprint = getShootChecklistFingerprint(script, parserMode)
  const root = readRoot()
  const normalized = normalizeShootChecklistState({
    ...state,
    updatedAt: new Date().toISOString(),
  })
  writeRoot({
    version: STORAGE_VERSION,
    scripts: { ...root.scripts, [fingerprint]: normalized },
  })
  return normalized
}

