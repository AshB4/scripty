import { useCallback, useEffect, useRef, useState } from 'react'
import {
  findVoiceMatch,
  getOrderedPrefixProgress,
  ROLLING_TRANSCRIPT_WORDS,
  toVoiceWords,
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
  const [isEnabled, setIsEnabled] = useState(false)
  const [status, setStatus] = useState(isSupported ? 'Off' : 'Unsupported')
  const [message, setMessage] = useState(
    isSupported ? '' : UNSUPPORTED_MESSAGE,
  )
  const [currentBlockIndex, setCurrentBlockIndexState] = useState(0)
  const [currentTranscriptWords, setCurrentTranscriptWords] = useState([])
  const [matchedWordCount, setMatchedWordCount] = useState(0)
  const blocksRef = useRef(blocks)
  const currentBlockIndexRef = useRef(0)
  const enabledRef = useRef(false)
  const recognitionRef = useRef(null)
  const restartTimerRef = useRef(null)
  const waitingTimerRef = useRef(null)
  const processedFinalResultsRef = useRef(new Set())
  const finalWordsRef = useRef([])
  const pendingMatchRef = useRef({ count: 0, index: null })
  const lowConfidenceCountRef = useRef(0)
  const lastSpeechAtRef = useRef(null)
  const lastMovementRef = useRef(null)
  const matchedWordCountRef = useRef(0)
  const onPositionChangeRef = useRef(onPositionChange)
  const progressBlockIndexRef = useRef(0)
  const startRecognitionRef = useRef(null)

  const resetWordProgress = useCallback(
    (blockIndex = currentBlockIndexRef.current, clearRecognitionBuffer = true) => {
      progressBlockIndexRef.current = blockIndex
      matchedWordCountRef.current = 0
      setCurrentTranscriptWords([])
      setMatchedWordCount(0)
      if (clearRecognitionBuffer) finalWordsRef.current = []
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
      if (enabledRef.current) setStatus('Waiting')
    }, Math.max(0, WAITING_DELAY - elapsed))
  }, [])

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
        transcriptWords,
      })

      lowConfidenceCountRef.current = nextState.lowConfidenceCount
      pendingMatchRef.current = nextState.pendingMatch
      setStatus(nextState.status)

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
      if (match?.isConfident && match.index === activeIndex) {
        const previousMatchedCount =
          progressBlockIndexRef.current === activeIndex
            ? matchedWordCountRef.current
            : 0
        const nextMatchedCount = getOrderedPrefixProgress({
          blockWords: blocksRef.current[activeIndex]?.words ?? [],
          previousMatchedCount,
          transcriptWords,
        })

        progressBlockIndexRef.current = activeIndex
        matchedWordCountRef.current = nextMatchedCount
        setMatchedWordCount(nextMatchedCount)
      }

      setCurrentTranscriptWords(transcriptWords)
    },
    [resetWordProgress, scheduleWaitingStatus],
  )

  const processRecognitionResult = useCallback(
    (event) => {
      const receivedAt = getDiagnosticTime()
      const interimWords = []
      const resultKinds = new Set()
      let receivedSpeech = false

      const firstChangedResult = event.resultIndex ?? 0

      for (
        let index = firstChangedResult;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index]
        const words = toVoiceWords(result[0]?.transcript)
        if (!words.length) continue

        receivedSpeech = true
        if (result.isFinal) {
          resultKinds.add('final')
          if (!processedFinalResultsRef.current.has(index)) {
            processedFinalResultsRef.current.add(index)
            finalWordsRef.current = [
              ...finalWordsRef.current,
              ...words,
            ].slice(-ROLLING_TRANSCRIPT_WORDS)
          }
        } else {
          resultKinds.add('interim')
          interimWords.push(...words)
        }
      }

      if (!receivedSpeech) return

      const rollingWords = [
        ...finalWordsRef.current,
        ...interimWords,
      ].slice(-ROLLING_TRANSCRIPT_WORDS)
      const resultKind = [...resultKinds].join('+')
      logVoiceFollowDiagnostic('recognition-result', {
        resultKind,
        time: Number(receivedAt.toFixed(2)),
        transcriptWords: rollingWords,
      })
      handleTranscript(rollingWords, { receivedAt, resultKind })
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
    setStatus(isSupported ? 'Off' : 'Unsupported')
    setMessage(isSupported ? '' : UNSUPPORTED_MESSAGE)
    window.clearTimeout(waitingTimerRef.current)
    resetWordProgress()
    stopRecognition()
  }, [isSupported, resetWordProgress, stopRecognition])

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
      setStatus('Unsupported')
      setMessage(UNSUPPORTED_MESSAGE)
      resetWordProgress()
      return
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    processedFinalResultsRef.current = new Set()

    recognition.onstart = () => {
      lastSpeechAtRef.current = Date.now()
      setMessage('')
      setStatus('Listening')
      scheduleWaitingStatus()
    }
    recognition.onresult = processRecognitionResult
    recognition.onerror = (event) => {
      if (!enabledRef.current && event.error === 'aborted') return

      const errorState = getRecognitionErrorState(event.error)
      setStatus(errorState.status)
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
      setStatus('Lost')
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
  ])

  useEffect(() => {
    startRecognitionRef.current = startRecognition
  }, [startRecognition])

  const enable = useCallback(() => {
    if (!isSupported || enabledRef.current) return

    enabledRef.current = true
    setIsEnabled(true)
    setMessage('')
    setStatus('Listening')
    pendingMatchRef.current = { count: 0, index: null }
    lowConfidenceCountRef.current = 0
    resetWordProgress()
    startRecognitionRef.current?.()
  }, [isSupported, resetWordProgress])

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
  }
}
