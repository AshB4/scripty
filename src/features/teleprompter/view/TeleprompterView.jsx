import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Focus,
  FlipHorizontal2,
  Maximize2,
  Settings,
} from 'lucide-react'
import Button from '../../../components/Button.jsx'
import Modal from '../../../components/Modal.jsx'
import IconButton from '../../../components/IconButton.jsx'
import scriptyIcon from '../../../assets/scripty-icon-128.png'
import { useLocalStorage } from '../../../hooks/useLocalStorage.js'
import SpeakerSettings from '../../scripts/SpeakerSettings.jsx'
import {
  getSpeakers,
  normalizeSpeakerColors,
  parseScript,
  resolveParserMode,
  speakerColorsAreEqual,
} from '../../scripts/scriptParser.js'
import {
  DEFAULT_SETTINGS,
  getFontStack,
  resolveSettings,
} from '../../scripts/scriptSettings.js'
import FloatingTrackpad from '../controls/FloatingTrackpad.jsx'
import PromptSegment from './PromptSegment.jsx'
import {
  canStartTimedScroll,
  getModeControlEffects,
  SCROLL_MODES,
} from '../scrollMode.js'
import TeleprompterControls from '../controls/TeleprompterControls.jsx'
import { useTeleprompter } from '../hooks/useTeleprompter.js'
import { useVoiceFollow } from '../voiceFollow/useVoiceFollow.js'
import VoiceFollowDiagnosticsPanel from '../voiceFollow/VoiceFollowDiagnosticsPanel.jsx'
import {
  getDiagnosticTime,
  logVoiceFollowDiagnostic,
} from '../voiceFollow/voiceFollowDiagnostics.js'
import { shouldRequestVoiceScroll } from '../voiceFollow/voiceFollowScroll.js'
import { leaveTeleprompter } from '../teleprompterNavigation.js'
import {
  createTrackableBlocks,
} from '../voiceFollow/voiceFollowMatcher.js'

export default function TeleprompterView() {
  const navigate = useNavigate()
  const [script] = useLocalStorage('scripty.script', '')
  const [storedSettings, setSettings] = useLocalStorage(
    'scripty.settings',
    DEFAULT_SETTINGS,
  )
  const [speakerColors, setSpeakerColors] = useLocalStorage(
    'scripty.speakerColors',
    {},
  )
  const [scriptTypeOverride] = useLocalStorage(
    'scripty.scriptTypeOverride',
    'Auto',
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [scrollMode, setScrollMode] = useState(SCROLL_MODES.TIMED)
  const settings = resolveSettings(storedSettings)
  const parserMode = useMemo(
    () => resolveParserMode(script, scriptTypeOverride),
    [script, scriptTypeOverride],
  )
  const segments = useMemo(
    () => parseScript(script, { scriptType: parserMode }),
    [parserMode, script],
  )
  const speakers = useMemo(() => getSpeakers(segments), [segments])
  const normalizedSpeakerColors = useMemo(
    () => normalizeSpeakerColors(speakerColors, speakers),
    [speakerColors, speakers],
  )
  const trackableBlocks = useMemo(
    () => createTrackableBlocks(segments),
    [segments],
  )
  const voiceBlockIndexes = useMemo(
    () =>
      new Map(
        trackableBlocks.map((block, blockIndex) => [
          block.segmentIndex,
          blockIndex,
        ]),
      ),
    [trackableBlocks],
  )
  const viewportRef = useRef(null)
  const segmentRefs = useRef([])
  const pendingVoiceScrollBlockRef = useRef(null)
  const voiceScrollEndHandlerRef = useRef(null)
  const voiceScrollTimerRef = useRef(null)
  const isVoiceScrollingRef = useRef(false)

  const centerVoiceMatch = useCallback((match, timing = {}) => {
    const viewport = viewportRef.current
    const segment = segmentRefs.current[match.block.segmentIndex]
    if (!viewport || !segment) return false
    if (
      !shouldRequestVoiceScroll(
        pendingVoiceScrollBlockRef.current,
        match.index,
      )
    ) {
      logVoiceFollowDiagnostic('scroll-suppressed', {
        reason: 'same-pending-block',
        selectedBlock: match.index,
      })
      return false
    }

    const scrollStartedAt = getDiagnosticTime()
    const maximumScrollTop = Math.max(
      0,
      viewport.scrollHeight - viewport.clientHeight,
    )
    const targetTop = Math.min(
      maximumScrollTop,
      Math.max(
        0,
        segment.offsetTop -
          viewport.clientHeight / 2 +
          segment.offsetHeight / 2,
      ),
    )
    pendingVoiceScrollBlockRef.current = match.index
    isVoiceScrollingRef.current = true
    window.clearTimeout(voiceScrollTimerRef.current)
    if (voiceScrollEndHandlerRef.current) {
      viewport.removeEventListener(
        'scrollend',
        voiceScrollEndHandlerRef.current,
      )
    }

    const finishVoiceScroll = (source) => {
      window.clearTimeout(voiceScrollTimerRef.current)
      viewport.removeEventListener('scrollend', voiceScrollEndHandlerRef.current)
      voiceScrollEndHandlerRef.current = null
      if (pendingVoiceScrollBlockRef.current === match.index) {
        pendingVoiceScrollBlockRef.current = null
      }
      isVoiceScrollingRef.current = false
      logVoiceFollowDiagnostic('scroll-settled', {
        positionToScrollCompleteMs: timing.positionChangedAt
          ? Number((getDiagnosticTime() - timing.positionChangedAt).toFixed(2))
          : null,
        recognitionToScrollCompleteMs: timing.recognitionReceivedAt
          ? Number(
              (getDiagnosticTime() - timing.recognitionReceivedAt).toFixed(2),
            )
          : null,
        scrollLatencyMs: Number(
          (getDiagnosticTime() - scrollStartedAt).toFixed(2),
        ),
        selectedBlock: match.index,
        source,
        targetErrorPx: Number(Math.abs(viewport.scrollTop - targetTop).toFixed(1)),
      })
    }

    voiceScrollEndHandlerRef.current = () => finishVoiceScroll('scrollend')
    viewport.addEventListener('scrollend', voiceScrollEndHandlerRef.current, {
      once: true,
    })
    viewport.scrollTo({
      behavior: 'smooth',
      top: targetTop,
    })
    window.requestAnimationFrame(() => {
      logVoiceFollowDiagnostic('scroll-render-start', {
        positionToRenderMs: timing.positionChangedAt
          ? Number((getDiagnosticTime() - timing.positionChangedAt).toFixed(2))
          : null,
        selectedBlock: match.index,
      })
    })
    voiceScrollTimerRef.current = window.setTimeout(() => {
      finishVoiceScroll('fallback')
    }, 700)
    return true
  }, [])

  const voiceFollow = useVoiceFollow({
    blocks: trackableBlocks,
    onPositionChange: centerVoiceMatch,
  })
  const isTimedPlaybackEnabled = canStartTimedScroll(
    scrollMode,
    voiceFollow.isEnabled,
  )
  const { controls, countdownValue, isPlaying } = useTeleprompter({
    countdownEnabled: settings.countdown,
    onPrimaryAction:
      scrollMode === SCROLL_MODES.VOICE ? voiceFollow.toggle : undefined,
    speed: settings.speed,
    timedPlaybackEnabled: isTimedPlaybackEnabled,
    viewportRef,
  })
  const activeSegmentIndex =
    trackableBlocks[voiceFollow.currentBlockIndex]?.segmentIndex ?? 0
  const setCurrentVoiceBlock = voiceFollow.setCurrentBlockIndex
  const isTimedActive = isPlaying || countdownValue !== null
  const setSegmentElement = useCallback((segmentIndex, element) => {
    segmentRefs.current[segmentIndex] = element
  }, [])
  const structuralPromptSegments = useMemo(
    () =>
      segments.map((segment, segmentIndex) =>
        (segment.type ?? 'dialogue') === 'dialogue' ? null : (
          <PromptSegment
            key={segment.id}
            matchedWordCount={null}
            segment={segment}
            segmentIndex={segmentIndex}
            setSegmentElement={setSegmentElement}
            totalWordCount={0}
          />
        ),
      ),
    [segments, setSegmentElement],
  )

  useEffect(() => {
    const timing = voiceFollow.wordProgressTiming
    if (!timing) return

    logVoiceFollowDiagnostic('word-progress-rendered', {
      calculationToRenderMs: Number(
        (getDiagnosticTime() - timing.progressCalculatedAt).toFixed(2),
      ),
      matchedWords: timing.matchedWordCount,
      recognitionToRenderMs: timing.recognitionReceivedAt
        ? Number(
            (getDiagnosticTime() - timing.recognitionReceivedAt).toFixed(2),
          )
        : null,
    })
  }, [voiceFollow.wordProgressTiming])

  const changeScrollMode = useCallback(
    (nextMode) => {
      const effects = getModeControlEffects({
        currentMode: scrollMode,
        isVoiceEnabled: voiceFollow.isEnabled,
        nextMode,
      })
      if (effects.stopTimed) controls.pause()
      if (effects.stopVoice) voiceFollow.disable()

      setScrollMode(effects.nextMode)
      if (effects.startVoice) voiceFollow.enable()
    },
    [controls, scrollMode, voiceFollow],
  )

  const handleBackToScript = useCallback(
    (event) => {
      event?.preventDefault()
      leaveTeleprompter({
        navigate,
        stopTimed: controls.pause,
        stopVoice: voiceFollow.disable,
      })
    },
    [controls.pause, navigate, voiceFollow.disable],
  )

  const handlePrimaryAction =
    scrollMode === SCROLL_MODES.VOICE
      ? voiceFollow.toggle
      : controls.toggle

  useEffect(() => {
    if (!speakerColorsAreEqual(speakerColors, normalizedSpeakerColors)) {
      setSpeakerColors(normalizedSpeakerColors)
    }
  }, [normalizedSpeakerColors, setSpeakerColors, speakerColors])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined

    let frame = null
    const updateCurrentBlock = () => {
      if (isVoiceScrollingRef.current) return

      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const viewportCenter =
          viewport.getBoundingClientRect().top + viewport.clientHeight / 2
        let nearestBlockIndex = 0
        let nearestDistance = Number.POSITIVE_INFINITY

        trackableBlocks.forEach((block, blockIndex) => {
          const element = segmentRefs.current[block.segmentIndex]
          if (!element) return

          const bounds = element.getBoundingClientRect()
          const distance = Math.abs(
            bounds.top + bounds.height / 2 - viewportCenter,
          )
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearestBlockIndex = blockIndex
          }
        })

        setCurrentVoiceBlock(nearestBlockIndex)
      })
    }

    viewport.addEventListener('scroll', updateCurrentBlock, { passive: true })
    return () => {
      viewport.removeEventListener('scroll', updateCurrentBlock)
      window.cancelAnimationFrame(frame)
    }
  }, [setCurrentVoiceBlock, trackableBlocks, viewportRef])

  useEffect(
    () => () => {
      window.clearTimeout(voiceScrollTimerRef.current)
      const viewport = viewportRef.current
      if (viewport && voiceScrollEndHandlerRef.current) {
        viewport.removeEventListener(
          'scrollend',
          voiceScrollEndHandlerRef.current,
        )
      }
      pendingVoiceScrollBlockRef.current = null
    },
    [],
  )

  const updateSetting = (key, value) => {
    setSettings({ ...settings, [key]: value })
  }

  const changeSpeakerColor = (speaker, color) => {
    setSpeakerColors((current) => ({ ...current, [speaker]: color }))
  }

  return (
    <main
      className={`teleprompter ${settings.focusMode ? 'teleprompter--focus' : ''}`}
    >
      <header className="teleprompter__topbar">
        <div className="teleprompter__identity">
          <Link
            aria-label="Scripty, back to script"
            className="brand-link"
            onClick={handleBackToScript}
            to="/scripts"
          >
            <img
              alt=""
              aria-hidden="true"
              className="brand-mark brand-mark--image"
              height="32"
              src={scriptyIcon}
              width="32"
            />
            <span>Scripty</span>
          </Link>
          <Button
            className="teleprompter__back"
            icon={ArrowLeft}
            onClick={handleBackToScript}
            variant="ghost"
          >
            Back to Script
          </Button>
        </div>
        <div className="teleprompter__actions">
          <IconButton
            className={settings.focusMode ? 'icon-button--active' : ''}
            icon={Focus}
            label="Toggle focus mode"
            onClick={() => updateSetting('focusMode', !settings.focusMode)}
          />
          <IconButton
            className={settings.mirror ? 'icon-button--active' : ''}
            icon={FlipHorizontal2}
            label="Toggle mirror mode"
            onClick={() => updateSetting('mirror', !settings.mirror)}
          />
          <IconButton
            icon={Maximize2}
            label="Toggle fullscreen"
            onClick={controls.toggleFullscreen}
          />
          <IconButton
            icon={Settings}
            label="Open settings"
            onClick={() => setIsSettingsOpen(true)}
          />
          <TeleprompterControls
            controls={controls}
            isPlaying={isTimedActive}
            onModeChange={changeScrollMode}
            onPrimaryAction={handlePrimaryAction}
            scrollMode={scrollMode}
            voiceFollow={{
              isEnabled: voiceFollow.isEnabled,
              isSupported: voiceFollow.isSupported,
              status: voiceFollow.status,
            }}
          />
        </div>
      </header>

      {voiceFollow.message ? (
        <div
          aria-live="polite"
          className="voice-follow-message"
          role="status"
        >
          {voiceFollow.message}
        </div>
      ) : null}

      <VoiceFollowDiagnosticsPanel diagnostics={voiceFollow.diagnostics} />

      <section
        className="teleprompter__viewport"
        ref={viewportRef}
        style={{
          '--prompter-font-family': getFontStack(settings.fontFamily),
          '--prompter-font-size': `${settings.fontSize}px`,
          '--prompter-line-height': settings.lineHeight,
        }}
      >
        <div
          className={`teleprompter__content ${settings.mirror ? 'teleprompter__content--mirrored' : ''}`}
        >
          {segments.length ? (
            segments.map((segment, segmentIndex) => {
              const voiceBlockIndex = voiceBlockIndexes.get(segmentIndex)
              const isDialogue = (segment.type ?? 'dialogue') === 'dialogue'
              let voiceState

              if (!isDialogue) return structuralPromptSegments[segmentIndex]

              if (segmentIndex === activeSegmentIndex) {
                voiceState = 'current'
              } else if (voiceBlockIndex < voiceFollow.currentBlockIndex) {
                voiceState = 'spoken'
              } else if (voiceBlockIndex > voiceFollow.currentBlockIndex) {
                voiceState = 'upcoming'
              }

              return (
                <PromptSegment
                  key={segment.id}
                  matchedWordCount={
                    voiceState === 'current' && voiceFollow.isEnabled
                      ? voiceFollow.matchedWordCount
                      : null
                  }
                  segment={segment}
                  segmentIndex={segmentIndex}
                  setSegmentElement={setSegmentElement}
                  speakerColor={normalizedSpeakerColors[segment.speakerId]}
                  totalWordCount={
                    voiceState === 'current' ? voiceFollow.totalWordCount : 0
                  }
                  voiceState={voiceState}
                />
              )
            })
          ) : (
            <article className="prompt-segment">
              <span>Scripty</span>
              <p>Add a script in the workspace before starting the read.</p>
            </article>
          )}
        </div>
      </section>

      {countdownValue ? (
        <div aria-live="assertive" className="countdown-overlay">
          <span>{countdownValue}</span>
        </div>
      ) : null}

      <FloatingTrackpad
        isActive={
          scrollMode === SCROLL_MODES.VOICE
            ? voiceFollow.isEnabled
            : isTimedActive
        }
        mode={scrollMode}
        onSpeedChange={(speed) => setSettings({ ...settings, speed })}
        onToggle={handlePrimaryAction}
        speed={settings.speed}
      />

      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Prompt settings"
      >
        <SpeakerSettings
          onChange={setSettings}
          onSpeakerColorChange={changeSpeakerColor}
          settings={settings}
          speakerColors={normalizedSpeakerColors}
          speakers={speakers}
        />
      </Modal>
    </main>
  )
}
