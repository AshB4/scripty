import { getScriptFingerprint } from '../scriptFingerprint.js'
import {
  validateFinalizedPrepareResult,
  validatePrepareResult,
} from './prepareContract.js'

const STORAGE_KEY = 'scripty.prepareResults'
const STORAGE_VERSION = 1

export function getPrepareFingerprint(script, parserMode = 'Auto') {
  return getScriptFingerprint(script, parserMode, { preserveWhitespace: true })
}

function readRoot() {
  if (typeof window === 'undefined') {
    return { scripts: {}, version: STORAGE_VERSION }
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return { scripts: {}, version: STORAGE_VERSION }
    const parsed = JSON.parse(stored)
    if (!parsed?.scripts || typeof parsed.scripts !== 'object') {
      return { scripts: {}, version: STORAGE_VERSION }
    }
    return { scripts: parsed.scripts, version: STORAGE_VERSION }
  } catch {
    return { scripts: {}, version: STORAGE_VERSION }
  }
}

function writeRoot(root) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root))
  } catch {
    // Prepare remains usable for the current session if storage is unavailable.
  }
}

export function loadPrepareResult(script, parserMode = 'Auto') {
  const fingerprint = getPrepareFingerprint(script, parserMode)
  const stored = readRoot().scripts[fingerprint]
  if (!stored) return null

  try {
    return validatePrepareResult(stored.result)
  } catch {
    return null
  }
}

export function loadPrepareState(script, parserMode = 'Auto') {
  const fingerprint = getPrepareFingerprint(script, parserMode)
  const stored = readRoot().scripts[fingerprint]
  if (!stored) {
    return { finalizedAt: null, finalizedResult: null, result: null }
  }

  let result = null
  let finalizedResult = null
  try {
    result = validatePrepareResult(stored.result)
  } catch {
    // Invalid drafts are ignored without affecting a valid finalized snapshot.
  }
  try {
    finalizedResult = validateFinalizedPrepareResult(stored.finalizedResult)
  } catch {
    // Invalid finalized data is never exposed to the recording workflow.
  }

  return {
    finalizedAt:
      finalizedResult && typeof stored.finalizedAt === 'string'
        ? stored.finalizedAt
        : null,
    finalizedResult,
    result,
  }
}

export function loadFinalizedPrepareResult(script, parserMode = 'Auto') {
  return loadPrepareState(script, parserMode).finalizedResult
}

export function savePrepareResult(script, parserMode = 'Auto', result) {
  const validated = validatePrepareResult(result)
  const fingerprint = getPrepareFingerprint(script, parserMode)
  const root = readRoot()
  writeRoot({
    version: STORAGE_VERSION,
    scripts: {
      ...root.scripts,
      [fingerprint]: {
        ...root.scripts[fingerprint],
        result: validated,
        updatedAt: new Date().toISOString(),
      },
    },
  })
  return validated
}

export function saveFinalizedPrepareResult(
  script,
  parserMode = 'Auto',
  result,
) {
  const validated = validateFinalizedPrepareResult(result)
  const fingerprint = getPrepareFingerprint(script, parserMode)
  const root = readRoot()
  const finalizedAt = new Date().toISOString()
  writeRoot({
    version: STORAGE_VERSION,
    scripts: {
      ...root.scripts,
      [fingerprint]: {
        ...root.scripts[fingerprint],
        finalizedAt,
        finalizedResult: validated,
        result: validated,
        updatedAt: finalizedAt,
      },
    },
  })
  return { finalizedAt, finalizedResult: validated }
}
