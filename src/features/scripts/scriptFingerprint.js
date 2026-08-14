function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function hashScriptText(value) {
  let hash = 2166136261
  const text = String(value ?? '')

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function getScriptFingerprint(
  script,
  parserMode = 'Auto',
  { preserveWhitespace = false } = {},
) {
  const source = preserveWhitespace ? String(script ?? '') : collapseWhitespace(script)
  return `${parserMode}:${hashScriptText(source)}`
}
