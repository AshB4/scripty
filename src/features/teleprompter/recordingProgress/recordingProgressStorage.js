const STORAGE_KEY = 'scripty.recordingProgress'
const STORAGE_VERSION = 1

function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function hashText(value) {
  let hash = 2166136261
  const text = String(value ?? '')

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function getRecordingProgressFingerprint(script, parserMode = 'Auto') {
  return `${parserMode}:${hashText(collapseWhitespace(script))}`
}

function isValidStatus(value) {
  return value === 'not-recorded' || value === 'redo' || value === 'good'
}

function normalizeEntry(entry) {
  return {
    note: typeof entry?.note === 'string' ? entry.note : '',
    status: isValidStatus(entry?.status) ? entry.status : 'not-recorded',
    takeCount: Number.isFinite(entry?.takeCount)
      ? Math.max(0, Math.floor(entry.takeCount))
      : 0,
    updatedAt:
      typeof entry?.updatedAt === 'string' && entry.updatedAt
        ? entry.updatedAt
        : null,
  }
}

function normalizeScriptEntry(entry) {
  const sections = entry?.sections && typeof entry.sections === 'object'
    ? Object.fromEntries(
        Object.entries(entry.sections).map(([sectionId, sectionEntry]) => [
          sectionId,
          normalizeEntry(sectionEntry),
        ]),
      )
    : {}

  return {
    sections,
    updatedAt:
      typeof entry?.updatedAt === 'string' && entry.updatedAt
        ? entry.updatedAt
        : null,
  }
}

function readRoot() {
  if (typeof window === 'undefined') return { scripts: {}, version: STORAGE_VERSION }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return { scripts: {}, version: STORAGE_VERSION }

    const parsed = JSON.parse(stored)
    const scripts = parsed?.scripts && typeof parsed.scripts === 'object'
      ? Object.fromEntries(
          Object.entries(parsed.scripts).map(([fingerprint, entry]) => [
            fingerprint,
            normalizeScriptEntry(entry),
          ]),
        )
      : {}

    return { scripts, version: STORAGE_VERSION }
  } catch {
    return { scripts: {}, version: STORAGE_VERSION }
  }
}

function writeRoot(root) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root))
  } catch {
    // Recording progress should remain usable when storage is unavailable.
  }
}

export function loadRecordingProgress(script, parserMode = 'Auto') {
  const fingerprint = getRecordingProgressFingerprint(script, parserMode)
  const root = readRoot()
  return normalizeScriptEntry(root.scripts[fingerprint])
}

export function saveRecordingProgress(
  script,
  parserMode = 'Auto',
  progress = {},
) {
  const fingerprint = getRecordingProgressFingerprint(script, parserMode)
  const root = readRoot()
  root.version = STORAGE_VERSION
  root.scripts = {
    ...root.scripts,
    [fingerprint]: normalizeScriptEntry(progress),
  }
  writeRoot(root)
}

export function removeRecordingProgress(script, parserMode = 'Auto') {
  const fingerprint = getRecordingProgressFingerprint(script, parserMode)
  const root = readRoot()

  if (!root.scripts[fingerprint]) return

  const nextScripts = { ...root.scripts }
  delete nextScripts[fingerprint]
  writeRoot({ version: STORAGE_VERSION, scripts: nextScripts })
}

export function normalizeRecordingProgressEntry(entry) {
  return normalizeEntry(entry)
}

