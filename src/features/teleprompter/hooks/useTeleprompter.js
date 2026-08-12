import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeyboardControls } from '../../../hooks/useKeyboardControls.js'
import {
  advanceTimedViewport,
  MANUAL_SCROLL_DISTANCE,
  moveViewport,
  scrollViewportToTop,
} from '../teleprompterNavigation.js'

export function useTeleprompter({
  countdownEnabled = false,
  onPrimaryAction,
  speed = 70,
  timedPlaybackEnabled = true,
  viewportRef: providedViewportRef,
} = {}) {
  const internalViewportRef = useRef(null)
  const viewportRef = providedViewportRef ?? internalViewportRef
  const animationRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const previousTimeRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [countdownValue, setCountdownValue] = useState(null)
  const countdownCompleteRef = useRef(null)

  const cancelCountdown = useCallback(() => {
    window.clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = null
    countdownCompleteRef.current = null
    setCountdownValue(null)
  }, [])

  const startCountdown = useCallback(
    (onComplete) => {
      cancelCountdown()

      let remaining = 3
      countdownCompleteRef.current = onComplete ?? null
      setCountdownValue(remaining)
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1

        if (remaining === 0) {
          window.clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
          setCountdownValue(null)
          const complete = countdownCompleteRef.current
          countdownCompleteRef.current = null
          complete?.()
          return
        }

        setCountdownValue(remaining)
      }, 1000)
    },
    [cancelCountdown],
  )

  useEffect(() => {
    if (!isPlaying) {
      window.cancelAnimationFrame(animationRef.current)
      previousTimeRef.current = null
      return undefined
    }

    function scrollStep(timestamp) {
      const viewport = viewportRef.current
      if (!viewport) return

      const previous = previousTimeRef.current ?? timestamp
      const delta = timestamp - previous
      previousTimeRef.current = timestamp
      advanceTimedViewport(viewport, speed, delta)

      if (
        viewport.scrollTop + viewport.clientHeight >=
        viewport.scrollHeight - 1
      ) {
        setIsPlaying(false)
        return
      }

      animationRef.current = window.requestAnimationFrame(scrollStep)
    }

    animationRef.current = window.requestAnimationFrame(scrollStep)
    return () => window.cancelAnimationFrame(animationRef.current)
  }, [isPlaying, speed, viewportRef])

  useEffect(
    () => () => {
      window.cancelAnimationFrame(animationRef.current)
      window.clearInterval(countdownTimerRef.current)
    },
    [],
  )

  const pause = useCallback(() => {
    cancelCountdown()
    setIsPlaying(false)
  }, [cancelCountdown])

  const play = useCallback(
    (withCountdown = false) => {
      if (!timedPlaybackEnabled) return

      if (!withCountdown) {
        cancelCountdown()
        setIsPlaying(true)
        return
      }

      startCountdown(() => setIsPlaying(true))
    },
    [cancelCountdown, startCountdown, timedPlaybackEnabled],
  )

  const scrollBy = useCallback(
    (distance) => {
      moveViewport(viewportRef.current, distance)
    },
    [viewportRef],
  )

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Fullscreen can be blocked by browser or embedding permissions.
    }
  }, [])

  const controls = useMemo(
    () => ({
      forward: () => scrollBy(MANUAL_SCROLL_DISTANCE),
      jumpToStart: () => scrollViewportToTop(viewportRef.current),
      pause,
      play,
      startCountdown,
      rewind: () => scrollBy(-MANUAL_SCROLL_DISTANCE),
      toggle: () => {
        if (!timedPlaybackEnabled) return

        if (isPlaying || countdownValue !== null) {
          pause()
        } else {
          play(countdownEnabled)
        }
      },
      toggleFullscreen,
    }),
    [
      countdownEnabled,
      countdownValue,
      isPlaying,
      pause,
      play,
      scrollBy,
      startCountdown,
      toggleFullscreen,
      timedPlaybackEnabled,
      viewportRef,
    ],
  )

  useKeyboardControls(
    useMemo(
      () => ({
        ' ': onPrimaryAction ?? controls.toggle,
        ArrowLeft: controls.rewind,
        ArrowRight: controls.forward,
        f: controls.toggleFullscreen,
        F: controls.toggleFullscreen,
        Home: controls.jumpToStart,
        Escape: controls.pause,
      }),
      [controls, onPrimaryAction],
    ),
  )

  return {
    controls,
    countdownValue,
    isPlaying,
    startCountdown,
    viewportRef,
  }
}
