import { useEffect } from 'react'

export function useKeyboardControls(bindings, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const handleKeyDown = (event) => {
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
