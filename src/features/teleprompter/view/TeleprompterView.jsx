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
import {
  VOICE_FOLLOW_SCROLL_BEHAVIOR,
  getVoiceFollowScrollTarget,
  shouldRequestVoiceScroll,
} from '../voiceFollow/voiceFollowScroll.js'
import { findNearestActiveVoiceBlock } from '../voiceFollow/activeBlockTracker.js'
import { leaveTeleprompter } from '../teleprompterNavigation.js'
import {
  createTrackableBlocks,
} from '../voiceFollow/voiceFollowMatcher.js'
import TeleprompterScript from './TeleprompterScript.jsx'

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
  const voiceScrollFrameRef = useRef(null)
  const isVoiceScrollingRef = useRef(false)
  const trackedVoiceBlockIndexRef = useRef(0)

  const centerVoiceMatch = useCallback((match, timing = {}) => {
    const viewport = viewportRef.current
    const activeSegment = segmentRefs.current[match.block.segmentIndex]
    if (!viewport || !activeSegment) return false
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
    const priorSegmentIndex =
      match.block.segmentIndex > 0 ? match.block.segmentIndex - 1 : null
    const priorSegment =
      priorSegmentIndex === null
        ? null
        : segmentRefs.current[priorSegmentIndex]
    const viewportBounds = viewport.getBoundingClientRect()
    const getScrollBounds = (element) => {
      if (!element) return null
      const bounds = element.getBoundingClientRect()
      return {
        height: bounds.height,
        top: viewport.scrollTop + bounds.top - viewportBounds.top,
      }
    }
    const targetTop = getVoiceFollowScrollTarget({
      activeBlock: getScrollBounds(activeSegment),
      previousBlock: getScrollBounds(priorSegment),
      viewportHeight: viewport.clientHeight,
      viewportScrollHeight: viewport.scrollHeight,
    })
    pendingVoiceScrollBlockRef.current = match.index
    isVoiceScrollingRef.current = true
    const scrollRequestedAt = getDiagnosticTime()
    logVoiceFollowDiagnostic('scroll-requested', {
      positionToScrollRequestMs: timing.positionChangedAt
        ? Number((scrollRequestedAt - timing.positionChangedAt).toFixed(2))
        : null,
      recognitionToScrollRequestMs: timing.recognitionReceivedAt
        ? Number((scrollRequestedAt - timing.recognitionReceivedAt).toFixed(2))
        : null,
      selectedBlock: match.index,
    })
    viewport.scrollTo({
      behavior: VOICE_FOLLOW_SCROLL_BEHAVIOR,
      top: targetTop,
    })
    window.cancelAnimationFrame(voiceScrollFrameRef.current)
    voiceScrollFrameRef.current = window.requestAnimationFrame(() => {
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
        source: 'snap',
        targetErrorPx: Number(Math.abs(viewport.scrollTop - targetTop).toFixed(1)),
      })
    })
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

  useEffect(() => {
    trackedVoiceBlockIndexRef.current = voiceFollow.currentBlockIndex
  }, [voiceFollow.currentBlockIndex])
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
        const viewportBounds = viewport.getBoundingClientRect()
        const nearestBlockIndex = findNearestActiveVoiceBlock({
          blocks: trackableBlocks,
          currentIndex: trackedVoiceBlockIndexRef.current,
          getBlockBounds: (block) => {
            const element = segmentRefs.current[block.segmentIndex]
            return element?.getBoundingClientRect() ?? null
          },
          viewportCenter: viewportBounds.top + viewport.clientHeight / 2,
        })

        if (nearestBlockIndex === trackedVoiceBlockIndexRef.current) return

        trackedVoiceBlockIndexRef.current = nearestBlockIndex
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
      window.cancelAnimationFrame(voiceScrollFrameRef.current)
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
          <TeleprompterScript
  activeSegmentIndex={activeSegmentIndex}
  normalizedSpeakerColors={normalizedSpeakerColors}
  segments={segments}
  setSegmentElement={setSegmentElement}
  structuralPromptSegments={structuralPromptSegments}
  voiceBlockIndexes={voiceBlockIndexes}
  voiceFollow={voiceFollow}
/>
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
