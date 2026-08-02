import { useCallback, useEffect, useRef, useState } from 'react'
import {
  findVoiceMatch,
  getOrderedPrefixProgress,
} from './voiceFollowMatcher.js'
import {
  canScheduleRecognitionRestart,
  getRecognitionErrorState,
  resolveVoiceMatchState,
} from './voiceFollowState.js'
import {
  getDiagnosticTime,
  logVoiceFollowDiagnostic,
} from './voiceFollowDiagnostics.js'
import {
  clearRecognitionTranscript,
  createRecognitionSessionState,
  processRecognitionEvent,
} from './voiceRecognitionResults.js'

const WAITING_DELAY = 1500
const RESTART_DELAY = 250
const UNSUPPORTED_MESSAGE =
  'Voice Follow is unavailable in this browser. Use current Chrome for the best experience.'

function getRecognitionConstructor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function useVoiceFollow({ blocks, onPositionChange }) {
  const isSupported = Boolean(getRecognitionConstructor())
  const initialStatus = isSupported ? 'Off' : 'Unsupported'
  const [isEnabled, setIsEnabled] = useState(false)
  const [status, setStatus] = useState(initialStatus)
  const [message, setMessage] = useState(
    isSupported ? '' : UNSUPPORTED_MESSAGE,
  )
  const [currentBlockIndex, setCurrentBlockIndexState] = useState(0)
  const [currentTranscriptWords, setCurrentTranscriptWords] = useState([])
  const [matchedWordCount, setMatchedWordCount] = useState(0)
  const [wordProgressTiming, setWordProgressTiming] = useState(null)
  const blocksRef = useRef(blocks)
  const currentBlockIndexRef = useRef(0)
  const enabledRef = useRef(false)
  const recognitionRef = useRef(null)
  const recognitionSessionRef = useRef(createRecognitionSessionState())
  const restartTimerRef = useRef(null)
  const waitingTimerRef = useRef(null)
  const pendingMatchRef = useRef({ count: 0, index: null })
  const lowConfidenceCountRef = useRef(0)
  const lastSpeechAtRef = useRef(null)
  const lastMovementRef = useRef(null)
  const matchedWordCountRef = useRef(0)
  const onPositionChangeRef = useRef(onPositionChange)
  const progressBlockIndexRef = useRef(0)
  const startRecognitionRef = useRef(null)
  const statusRef = useRef(initialStatus)

  const updateStatus = useCallback((nextStatus, context = {}) => {
    if (statusRef.current !== nextStatus) {
      logVoiceFollowDiagnostic('status-change', {
        from: statusRef.current,
        time: Number(getDiagnosticTime().toFixed(2)),
        to: nextStatus,
        ...context,
      })
    }
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const resetWordProgress = useCallback(
    (blockIndex = currentBlockIndexRef.current, clearRecognitionBuffer = true) => {
      progressBlockIndexRef.current = blockIndex
      matchedWordCountRef.current = 0
      setCurrentTranscriptWords([])
      setMatchedWordCount(0)
      setWordProgressTiming(null)
      if (clearRecognitionBuffer) {
        recognitionSessionRef.current = clearRecognitionTranscript(
          recognitionSessionRef.current,
        )
      }
    },
    [],
  )

  useEffect(() => {
    blocksRef.current = blocks
    const safeIndex = Math.min(
      Math.max(0, blocks.length - 1),
      currentBlockIndexRef.current,
    )
    currentBlockIndexRef.current = safeIndex
    pendingMatchRef.current = { count: 0, index: null }
    lowConfidenceCountRef.current = 0
    lastMovementRef.current = null
    setCurrentBlockIndexState(safeIndex)
    resetWordProgress(safeIndex)
  }, [blocks, resetWordProgress])

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange
  }, [onPositionChange])

  const setCurrentBlockIndex = useCallback((nextIndex) => {
    const lastIndex = Math.max(0, blocksRef.current.length - 1)
    const safeIndex = Math.min(lastIndex, Math.max(0, nextIndex))
    if (safeIndex === currentBlockIndexRef.current) return

    const previousIndex = currentBlockIndexRef.current
    currentBlockIndexRef.current = safeIndex
    lastMovementRef.current = {
      at: Date.now(),
      fromIndex: previousIndex,
      source: 'manual',
      toIndex: safeIndex,
    }
    pendingMatchRef.current = { count: 0, index: null }
    lowConfidenceCountRef.current = 0
    resetWordProgress(safeIndex)
    setCurrentBlockIndexState(safeIndex)
  }, [resetWordProgress])

  const scheduleWaitingStatus = useCallback(() => {
    window.clearTimeout(waitingTimerRef.current)
    const elapsed = Date.now() - (lastSpeechAtRef.current ?? Date.now())
    waitingTimerRef.current = window.setTimeout(() => {
      if (enabledRef.current) updateStatus('Waiting', { reason: 'silence' })
    }, Math.max(0, WAITING_DELAY - elapsed))
  }, [updateStatus])

  const handleTranscript = useCallback(
    (transcriptWords, diagnosticContext = {}) => {
      lastSpeechAtRef.current = Date.now()
      scheduleWaitingStatus()

      const matchStartedAt = getDiagnosticTime()
      const currentIndex = currentBlockIndexRef.current
      const match = findVoiceMatch({
        blocks: blocksRef.current,
        currentIndex,
        transcript: transcriptWords,
      })
      const decisionAt = Date.now()
      const nextState = resolveVoiceMatchState({
        currentIndex,
        lastMovement: lastMovementRef.current,
        lowConfidenceCount: lowConfidenceCountRef.current,
        match,
        now: decisionAt,
        pendingMatch: pendingMatchRef.current,
      })

      logVoiceFollowDiagnostic('match', {
        confidence: match?.confidenceLevel ?? 'none',
        confirmationCount: nextState.confirmationCount,
        currentBlock: currentIndex,
        isCooldownBlocked: nextState.isCooldownBlocked,
        matchLatencyMs: Number(
          (getDiagnosticTime() - matchStartedAt).toFixed(2),
        ),
        resultKind: diagnosticContext.resultKind,
        score: match ? Number(match.score.toFixed(3)) : null,
        selectedBlock: match?.index ?? null,
        status: nextState.status,
        transcriptWords,
      })

      lowConfidenceCountRef.current = nextState.lowConfidenceCount
      pendingMatchRef.current = nextState.pendingMatch
      updateStatus(nextState.status, { reason: 'match' })

      if (nextState.shouldMove) {
        const positionChangedAt = getDiagnosticTime()
        lastMovementRef.current = {
          at: decisionAt,
          fromIndex: currentIndex,
          source: 'voice',
          toIndex: nextState.nextIndex,
        }
        currentBlockIndexRef.current = nextState.nextIndex
        setCurrentBlockIndexState(nextState.nextIndex)
        resetWordProgress(nextState.nextIndex)
        logVoiceFollowDiagnostic('position-change', {
          currentBlock: currentIndex,
          recognitionToPositionMs: diagnosticContext.receivedAt
            ? Number(
                (positionChangedAt - diagnosticContext.receivedAt).toFixed(2),
              )
            : null,
          selectedBlock: nextState.nextIndex,
          time: Number(positionChangedAt.toFixed(2)),
        })
        onPositionChangeRef.current?.(match, {
          positionChangedAt,
          recognitionReceivedAt: diagnosticContext.receivedAt,
        })
      }

      const activeIndex = currentBlockIndexRef.current
      const progressStartedAt = getDiagnosticTime()
      const previousMatchedCount =
        progressBlockIndexRef.current === activeIndex
          ? matchedWordCountRef.current
          : 0
      const progressWords = diagnosticContext.progressWords?.length
        ? diagnosticContext.progressWords
        : transcriptWords
      const activeBlockWords = blocksRef.current[activeIndex]?.words ?? []
      const nextMatchedCount = getOrderedPrefixProgress({
        blockWords: activeBlockWords,
        previousMatchedCount,
        transcriptWords: progressWords,
      })

      logVoiceFollowDiagnostic('word-progress', {
        calculationLatencyMs: Number(
          (getDiagnosticTime() - progressStartedAt).toFixed(2),
        ),
        currentBlock: activeIndex,
        matchedWords: nextMatchedCount,
        previousMatchedWords: previousMatchedCount,
        totalWords: activeBlockWords.length,
      })

      if (nextMatchedCount !== previousMatchedCount) {
        const progressCalculatedAt = getDiagnosticTime()
        progressBlockIndexRef.current = activeIndex
        matchedWordCountRef.current = nextMatchedCount
        setMatchedWordCount(nextMatchedCount)
        setWordProgressTiming({
          matchedWordCount: nextMatchedCount,
          progressCalculatedAt,
          recognitionReceivedAt: diagnosticContext.receivedAt,
        })
      }

      setCurrentTranscriptWords(transcriptWords)
    },
    [resetWordProgress, scheduleWaitingStatus, updateStatus],
  )

  const processRecognitionResult = useCallback(
    (event) => {
      const receivedAt = getDiagnosticTime()
      const processedResult = processRecognitionEvent({
        event,
        sessionState: recognitionSessionRef.current,
      })
      recognitionSessionRef.current = processedResult.sessionState

      if (!processedResult.receivedSpeech) return

      logVoiceFollowDiagnostic('recognition-result', {
        resultIndex: event.resultIndex ?? 0,
        resultKind: processedResult.resultKind,
        time: Number(receivedAt.toFixed(2)),
        transcriptWords: processedResult.rollingWords,
      })
      handleTranscript(processedResult.rollingWords, {
        progressWords: processedResult.changedWords,
        receivedAt,
        resultKind: processedResult.resultKind,
      })
    },
    [handleTranscript],
  )

  const stopRecognition = useCallback(() => {
    window.clearTimeout(restartTimerRef.current)
    restartTimerRef.current = null

    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (!recognition) return

    recognition.onend = null
    try {
      recognition.stop()
    } catch {
      // The browser may already have ended this recognition session.
    }
  }, [])

  const disable = useCallback(() => {
    enabledRef.current = false
    setIsEnabled(false)
    updateStatus(isSupported ? 'Off' : 'Unsupported', {
      reason: 'disabled',
    })
    setMessage(isSupported ? '' : UNSUPPORTED_MESSAGE)
    window.clearTimeout(waitingTimerRef.current)
    resetWordProgress()
    stopRecognition()
  }, [isSupported, resetWordProgress, stopRecognition, updateStatus])

  const scheduleRestart = useCallback(() => {
    if (
      !canScheduleRecognitionRestart({
        hasRecognition: Boolean(recognitionRef.current),
        isEnabled: enabledRef.current,
        isRestartScheduled: Boolean(restartTimerRef.current),
      })
    ) {
      return
    }

    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null
      startRecognitionRef.current?.()
    }, RESTART_DELAY)
  }, [])

  const startRecognition = useCallback(() => {
    if (!enabledRef.current || recognitionRef.current) return

    const Recognition = getRecognitionConstructor()
    if (!Recognition) {
      enabledRef.current = false
      setIsEnabled(false)
      updateStatus('Unsupported', { reason: 'browser-support' })
      setMessage(UNSUPPORTED_MESSAGE)
      resetWordProgress()
      return
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionSessionRef.current = createRecognitionSessionState()

    recognition.onstart = () => {
      lastSpeechAtRef.current = Date.now()
      setMessage('')
      updateStatus('Listening', { reason: 'recognition-started' })
      scheduleWaitingStatus()
    }
    recognition.onresult = processRecognitionResult
    recognition.onerror = (event) => {
      if (!enabledRef.current && event.error === 'aborted') return

      const errorState = getRecognitionErrorState(event.error)
      updateStatus(errorState.status, { reason: `error:${event.error}` })
      setMessage(errorState.message)

      if (errorState.disable) {
        enabledRef.current = false
        setIsEnabled(false)
        resetWordProgress()
        stopRecognition()
        return
      }

      if (errorState.retry) {
        try {
          recognition.stop()
        } catch {
          // The end handler will restart if this session already stopped.
        }
      }
    }
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return

      recognitionRef.current = null
      scheduleRestart()
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      enabledRef.current = false
      setIsEnabled(false)
      updateStatus('Lost', { reason: 'recognition-start-failed' })
      resetWordProgress()
      setMessage(
        'Speech recognition could not start. Manual teleprompter controls are still available.',
      )
    }
  }, [
    processRecognitionResult,
    resetWordProgress,
    scheduleRestart,
    scheduleWaitingStatus,
    stopRecognition,
    updateStatus,
  ])

  useEffect(() => {
    startRecognitionRef.current = startRecognition
  }, [startRecognition])

  const enable = useCallback(() => {
    if (!isSupported || enabledRef.current) return

    enabledRef.current = true
    setIsEnabled(true)
    setMessage('')
    updateStatus('Listening', { reason: 'enabled' })
    pendingMatchRef.current = { count: 0, index: null }
    lowConfidenceCountRef.current = 0
    resetWordProgress()
    startRecognitionRef.current?.()
  }, [isSupported, resetWordProgress, updateStatus])

  const toggle = useCallback(() => {
    if (enabledRef.current) disable()
    else enable()
  }, [disable, enable])

  useEffect(
    () => () => {
      enabledRef.current = false
      window.clearTimeout(waitingTimerRef.current)
      window.clearTimeout(restartTimerRef.current)
      const recognition = recognitionRef.current
      recognitionRef.current = null
      if (recognition) {
        recognition.onend = null
        try {
          recognition.stop()
        } catch {
          // The browser may already have ended this recognition session.
        }
      }
    },
    [],
  )

  return {
    currentBlockIndex,
    currentTranscriptWords,
    disable,
    enable,
    isEnabled,
    isSupported,
    message,
    matchedWordCount,
    setCurrentBlockIndex,
    status,
    totalWordCount: blocks[currentBlockIndex]?.words.length ?? 0,
    toggle,
    wordProgressTiming,
  }
}
