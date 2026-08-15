/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildReminderChecklistItems,
  normalizeShootChecklistState,
  toggleReminderChecklistItem,
} from './shootChecklist.js'
import {
  loadShootChecklistState,
  saveShootChecklistState,
} from './shootChecklistStorage.js'

export function useReminderChecklist({ parserMode, reminders, script }) {
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
    () => buildReminderChecklistItems(reminders, state),
    [reminders, state],
  )

  return {
    items,
    toggle(reminderId) {
      setState((current) => toggleReminderChecklistItem(current, reminderId))
    },
  }
}

