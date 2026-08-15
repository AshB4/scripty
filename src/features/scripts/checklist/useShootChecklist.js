/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addManualShootChecklistItem,
  buildShootChecklistItems,
  getShootChecklistProgress,
  normalizeShootChecklistState,
  removeShootChecklistItem,
  toggleShootChecklistItem,
} from './shootChecklist.js'
import {
  loadShootChecklistState,
  saveShootChecklistState,
} from './shootChecklistStorage.js'

export function useShootChecklist({ parserMode, requirements, script }) {
  const [state, setState] = useState(() => normalizeShootChecklistState())
  const isHydratingRef = useRef(true)

  useEffect(() => {
    isHydratingRef.current = true
    setState(loadShootChecklistState(script, parserMode))
  }, [parserMode, script])

  useEffect(() => {
    if (isHydratingRef.current) {
      isHydratingRef.current = false
      return
    }
    saveShootChecklistState(script, parserMode, state)
  }, [parserMode, script, state])

  const items = useMemo(
    () => buildShootChecklistItems(requirements, state),
    [requirements, state],
  )

  return {
    items,
    progress: getShootChecklistProgress(items),
    addManualItem(text) {
      setState((current) => addManualShootChecklistItem(current, text))
    },
    removeItem(item) {
      setState((current) => removeShootChecklistItem(current, item))
    },
    toggleItem(itemId) {
      setState((current) => toggleShootChecklistItem(current, itemId))
    },
  }
}

