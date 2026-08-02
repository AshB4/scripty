import { useCallback, useEffect, useRef, useState } from 'react'
import {
  findVoiceMatch,
  ROLLING_TRANSCRIPT_WORDS,
  toVoiceWords,
} from './voiceFollowMatcher.js'

const WAITING_DELAY = 1500
const LOST_RESULT_LIMIT = 4
const RESTART_DELAY = 250

function getRecognitionConstructor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function useVoiceFollow({ blocks, onPositionChange }) {
  const isSupported = Boolean(getRecognitionConstructor())
  const [isEnabled, setIsEnabled] = useState(false)
  const [status, setStatus] = useState(isSupported ? 'Off' : 'Unsupported')
  const [message, setMessage] = useState(
    isSupported
      ? ''
      : 'Voice Follow is unavailable in this browser. Use Chrome for the best experience.',
  )
  const [currentBlockIndex, setCurrentBlockIndexState] = useState(0)
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
  const onPositionChangeRef = useRef(onPositionChange)
  const startRecognitionRef = useRef(null)

  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange
  }, [onPositionChange])

  const setCurrentBlockIndex = useCallback((nextIndex) => {
    const lastIndex = Math.max(0, blocksRef.current.length - 1)
    const safeIndex = Math.min(lastIndex, Math.max(0, nextIndex))
    currentBlockIndexRef.current = safeIndex
    pendingMatchRef.current = { count: 0, index: null }
    lowConfidenceCountRef.current = 0
    setCurrentBlockIndexState(safeIndex)
  }, [])

  const scheduleWaitingStatus = useCallback(() => {
    window.clearTimeout(waitingTimerRef.current)
    const elapsed = Date.now() - (lastSpeechAtRef.current ?? Date.now())
    waitingTimerRef.current = window.setTimeout(() => {
      if (enabledRef.current) setStatus('Waiting')
    }, Math.max(0, WAITING_DELAY - elapsed))
  }, [])

  const handleTranscript = useCallback(
    (transcriptWords) => {
      lastSpeechAtRef.current = Date.now()
      scheduleWaitingStatus()

      const match = findVoiceMatch({
        blocks: blocksRef.current,
        currentIndex: currentBlockIndexRef.current,
        transcript: transcriptWords,
      })

      if (!match?.isConfident) {
        lowConfidenceCountRef.current += 1
        pendingMatchRef.current = { count: 0, index: null }
        setStatus(
          lowConfidenceCountRef.current >= LOST_RESULT_LIMIT
            ? 'Lost'
            : 'Listening',
        )
        return
      }

      lowConfidenceCountRef.current = 0
      const pending = pendingMatchRef.current
      const confirmationCount = pending.index === match.index ? pending.count + 1 : 1
      pendingMatchRef.current = { count: confirmationCount, index: match.index }

      if (!match.isVeryHighConfidence && confirmationCount < 2) {
        setStatus('Listening')
        return
      }

      pendingMatchRef.current = { count: 0, index: null }
      setStatus('Following')

      if (match.index === currentBlockIndexRef.current) return

      currentBlockIndexRef.current = match.index
      setCurrentBlockIndexState(match.index)
      onPositionChangeRef.current?.(match)
    },
    [scheduleWaitingStatus],
  )

  const processRecognitionResult = useCallback(
    (event) => {
      const interimWords = []
      let receivedSpeech = false

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        const words = toVoiceWords(result[0]?.transcript)
        if (!words.length) continue

        receivedSpeech = true
        if (result.isFinal) {
          if (!processedFinalResultsRef.current.has(index)) {
            processedFinalResultsRef.current.add(index)
            finalWordsRef.current = [
              ...finalWordsRef.current,
              ...words,
            ].slice(-ROLLING_TRANSCRIPT_WORDS)
          }
        } else {
          interimWords.push(...words)
        }
      }

      if (!receivedSpeech) return

      const rollingWords = [
        ...finalWordsRef.current,
        ...interimWords,
      ].slice(-ROLLING_TRANSCRIPT_WORDS)
      handleTranscript(rollingWords)
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
    window.clearTimeout(waitingTimerRef.current)
    stopRecognition()
  }, [isSupported, stopRecognition])

  const startRecognition = useCallback(() => {
    if (!enabledRef.current || recognitionRef.current) return

    const Recognition = getRecognitionConstructor()
    if (!Recognition) {
      enabledRef.current = false
      setIsEnabled(false)
      setStatus('Unsupported')
      setMessage(
        'Voice Follow is unavailable in this browser. Use Chrome for the best experience.',
      )
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

      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed'
      ) {
        enabledRef.current = false
        setIsEnabled(false)
        setStatus('Off')
        setMessage(
          'Microphone permission was denied. Manual teleprompter controls are still available.',
        )
        stopRecognition()
        return
      }

      if (event.error === 'no-speech' || event.error === 'aborted') {
        setStatus('Waiting')
        return
      }

      setStatus('Lost')
      setMessage(
        event.error === 'audio-capture'
          ? 'No microphone is available. Manual teleprompter controls are still available.'
          : 'Speech recognition was interrupted. Voice Follow will retry automatically.',
      )
    }
    recognition.onend = () => {
      recognitionRef.current = null
      if (!enabledRef.current) return

      restartTimerRef.current = window.setTimeout(() => {
        startRecognitionRef.current?.()
      }, RESTART_DELAY)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setStatus('Lost')
      setMessage(
        'Speech recognition could not start. Manual teleprompter controls are still available.',
      )
    }
  }, [processRecognitionResult, scheduleWaitingStatus, stopRecognition])

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
    finalWordsRef.current = []
    startRecognitionRef.current?.()
  }, [isSupported])

  const toggle = useCallback(() => {
    if (enabledRef.current) disable()
    else enable()
  }, [disable, enable])

  useEffect(() => {
    if (currentBlockIndexRef.current >= blocks.length) {
      setCurrentBlockIndex(Math.max(0, blocks.length - 1))
    }
  }, [blocks.length, setCurrentBlockIndex])

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
    disable,
    enable,
    isEnabled,
    isSupported,
    message,
    setCurrentBlockIndex,
    status,
    toggle,
  }
}
