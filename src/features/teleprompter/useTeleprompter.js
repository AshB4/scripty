import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeyboardControls } from '../../hooks/useKeyboardControls.js'

export function useTeleprompter({
  countdownEnabled = false,
  onAutoScrollStart,
  speed = 70,
  viewportRef: providedViewportRef,
} = {}) {
  const internalViewportRef = useRef(null)
  const viewportRef = providedViewportRef ?? internalViewportRef
  const animationRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const previousTimeRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [countdownValue, setCountdownValue] = useState(null)

  const cancelCountdown = useCallback(() => {
    window.clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = null
    setCountdownValue(null)
  }, [])

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
      viewport.scrollTop += (delta / 1000) * speed

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
      cancelCountdown()
      onAutoScrollStart?.()

      if (!withCountdown) {
        setIsPlaying(true)
        return
      }

      let remaining = 3
      setCountdownValue(remaining)
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1

        if (remaining === 0) {
          window.clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
          setCountdownValue(null)
          setIsPlaying(true)
          return
        }

        setCountdownValue(remaining)
      }, 1000)
    },
    [cancelCountdown, onAutoScrollStart],
  )

  const scrollBy = useCallback(
    (distance) => {
      viewportRef.current?.scrollBy({ behavior: 'smooth', top: distance })
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
      forward: () => scrollBy(320),
      jumpToStart: () => {
        if (viewportRef.current) {
          viewportRef.current.scrollTo({ behavior: 'smooth', top: 0 })
        }
      },
      pause,
      play,
      rewind: () => scrollBy(-320),
      toggle: () => {
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
      toggleFullscreen,
      viewportRef,
    ],
  )

  useKeyboardControls(
    useMemo(
      () => ({
        ' ': controls.toggle,
        ArrowLeft: controls.rewind,
        ArrowRight: controls.forward,
        f: controls.toggleFullscreen,
        F: controls.toggleFullscreen,
        Home: controls.jumpToStart,
        Escape: controls.pause,
      }),
      [controls],
    ),
  )

  return {
    controls,
    countdownValue,
    isPlaying,
    viewportRef,
  }
}
