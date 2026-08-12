/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import { SCROLL_MODES } from '../scrollMode.js'
import {
  loadRecordingProgress,
  normalizeRecordingProgressEntry,
  saveRecordingProgress,
} from './recordingProgressStorage.js'

const RECORDING_STATUSES = {
  GOOD: 'good',
  NOT_RECORDED: 'not-recorded',
  REDO: 'redo',
}

function createDefaultEntry() {
  return {
    note: '',
    status: RECORDING_STATUSES.NOT_RECORDED,
    takeCount: 0,
    updatedAt: null,
  }
}

function getStatusSymbol(status) {
  if (status === RECORDING_STATUSES.GOOD) return '✓'
  if (status === RECORDING_STATUSES.REDO) return '↻'

  return '○'
}

export function buildRecordingProgressSections(
  recordableBlocks = [],
  storedEntries = {},
) {
  return recordableBlocks.map((block, index) => {
    const entry = normalizeRecordingProgressEntry(storedEntries[block.id])
    return {
      ...block,
      ...entry,
      index,
      isSelected: false,
      symbol: getStatusSymbol(entry.status),
    }
  })
}

export function getRecordingProgressPercent(sections = []) {
  if (!sections.length) return 0

  const goodCount = sections.filter(
    (section) => section.status === RECORDING_STATUSES.GOOD,
  ).length
  return Math.round((goodCount / sections.length) * 100)
}

export function getRecordingResumeTarget(sections = []) {
  return (
    sections.find((section) => section.status === RECORDING_STATUSES.REDO) ??
    sections.find(
      (section) => section.status === RECORDING_STATUSES.NOT_RECORDED,
    ) ??
    null
  )
}

export function incrementRecordingTake(entry = createDefaultEntry()) {
  return {
    ...entry,
    takeCount: entry.takeCount + 1,
    updatedAt: new Date().toISOString(),
  }
}

export function setRecordingProgressStatus(entry = createDefaultEntry(), status) {
  return {
    ...entry,
    status,
    updatedAt: new Date().toISOString(),
  }
}

export function setRecordingProgressNote(entry = createDefaultEntry(), note) {
  return {
    ...entry,
    note,
    updatedAt: new Date().toISOString(),
  }
}

export function getTakeCompletionAction({
  isVoiceEnabled,
  scrollMode,
}) {
  if (scrollMode === SCROLL_MODES.VOICE) {
    return isVoiceEnabled ? 'none' : 'voice-follow'
  }

  return 'timed-scroll'
}

export function useRecordingProgress({ parserMode, recordableBlocks, script }) {
  const [storedEntries, setStoredEntries] = useState({})
  const [selectedSectionId, setSelectedSectionId] = useState(null)
  const [activeTake, setActiveTake] = useState(null)
  const isHydratingRef = useRef(true)

  useEffect(() => {
    isHydratingRef.current = true
    setStoredEntries(loadRecordingProgress(script, parserMode).sections ?? {})
    setSelectedSectionId(null)
    setActiveTake(null)
  }, [parserMode, script])

  const sections = useMemo(
    () => buildRecordingProgressSections(recordableBlocks, storedEntries),
    [recordableBlocks, storedEntries],
  )

  useEffect(() => {
    if (!sections.length) {
      setSelectedSectionId(null)
      return
    }

    const selectedExists = sections.some(
      (section) => section.id === selectedSectionId,
    )
    if (selectedExists) return

    const resumeTarget = getRecordingResumeTarget(sections) ?? sections[0]
    setSelectedSectionId(resumeTarget?.id ?? null)
  }, [selectedSectionId, sections])

  useEffect(() => {
    if (isHydratingRef.current) {
      isHydratingRef.current = false
      return
    }

    saveRecordingProgress(script, parserMode, {
      sections: storedEntries,
      updatedAt: new Date().toISOString(),
    })
  }, [parserMode, script, storedEntries])

  const updateSection = (sectionId, updater) => {
    setStoredEntries((current) => {
      const next = {
        ...current,
        [sectionId]: updater(
          normalizeRecordingProgressEntry(current[sectionId]) ??
            createDefaultEntry(),
        ),
      }
      return next
    })
  }

  const setSectionStatus = (sectionId, status) => {
    updateSection(sectionId, (entry) => setRecordingProgressStatus(entry, status))
    setActiveTake((current) =>
      current?.sectionId === sectionId ? null : current,
    )
  }

  const setSectionNote = (sectionId, note) => {
    updateSection(sectionId, (entry) => setRecordingProgressNote(entry, note))
  }

  const startTake = (sectionId) => {
    const section = sections.find((item) => item.id === sectionId)
    if (!section) return null

    let takeNumber = section.takeCount + 1
    updateSection(sectionId, (entry) => {
      const nextEntry = incrementRecordingTake(entry)
      takeNumber = nextEntry.takeCount
      return nextEntry
    })
    setSelectedSectionId(sectionId)
    setActiveTake({
      sectionId,
      takeNumber,
    })
    return {
      section,
      takeNumber,
    }
  }

  const resumeRecording = () => {
    const target = getRecordingResumeTarget(sections)
    if (!target) return null

    const take = startTake(target.id)
    if (!take) return null

    return {
      ...take,
      target,
    }
  }

  const clearActiveTake = () => {
    setActiveTake(null)
  }

  const selectedSection =
    sections.find((section) => section.id === selectedSectionId) ?? null

  const progressPercent = getRecordingProgressPercent(sections)
  const goodCount = sections.filter(
    (section) => section.status === RECORDING_STATUSES.GOOD,
  ).length
  const redoCount = sections.filter(
    (section) => section.status === RECORDING_STATUSES.REDO,
  ).length
  const notRecordedCount = sections.filter(
    (section) => section.status === RECORDING_STATUSES.NOT_RECORDED,
  ).length
  const isComplete = sections.length > 0 && goodCount === sections.length

  return {
    activeTake,
    goodCount,
    isComplete,
    notRecordedCount,
    progressPercent,
    redoCount,
    resumeTarget: getRecordingResumeTarget(sections),
    sections,
    selectedSection,
    selectedSectionId,
    clearActiveTake,
    setSectionNote,
    setSectionStatus,
    setSelectedSectionId,
    startTake,
    resumeRecording,
  }
}
