import { useEffect } from 'react'

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

export function isEditableShortcutTarget(target) {
  if (!target || typeof target !== 'object') return false

  const element = target

  if (typeof element.matches === 'function' && element.matches(EDITABLE_SELECTOR)) {
    return true
  }

  if (typeof element.closest === 'function') {
    return Boolean(element.closest(EDITABLE_SELECTOR))
  }

  return Boolean(
    element.isContentEditable ||
      element.contentEditable === 'true' ||
      element.contentEditable === 'plaintext-only',
  )
}

export function useKeyboardControls(bindings, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (isEditableShortcutTarget(event.target)) {
        return
      }

      const handler = bindings[event.key]
      if (!handler) {
        return
      }

      event.preventDefault()
      handler(event)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bindings, enabled])
}
