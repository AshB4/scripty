const IS_DEVELOPMENT = Boolean(import.meta.env?.DEV)

function diagnosticsEnabled() {
  if (!IS_DEVELOPMENT || typeof window === 'undefined') return false

  try {
    return (
      new URLSearchParams(window.location.search).get('voiceDebug') === '1' ||
      window.localStorage.getItem('scripty.voiceFollowDiagnostics') === 'true'
    )
  } catch {
    return false
  }
}

export function getDiagnosticTime() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export function logVoiceFollowDiagnostic(event, details = {}) {
  if (!diagnosticsEnabled()) return

  console.debug(`[Scripty Voice Follow] ${event}`, details)
}
