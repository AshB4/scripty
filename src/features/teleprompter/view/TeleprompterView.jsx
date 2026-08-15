import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
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
import { useReminderChecklist } from '../../scripts/checklist/useReminderChecklist.js'
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
import CountdownOverlay from './CountdownOverlay.jsx'
import PromptSegment from './PromptSegment.jsx'
import RecordingProgressPanel from './RecordingProgressPanel.jsx'
import {
  canStartTimedScroll,
  getModeControlEffects,
  SCROLL_MODES,
} from '../scrollMode.js'
import TeleprompterControls from '../controls/TeleprompterControls.jsx'
import { useTeleprompter } from '../hooks/useTeleprompter.js'
import {
  getTakeCompletionAction,
  useRecordingProgress,
} from '../recordingProgress/useRecordingProgress.js'
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
import { resolveTeleprompterSegmentModel } from '../preparedSegments.js'

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
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(() => {
    if (typeof window === 'undefined') return false

    try {
      return window.sessionStorage.getItem('scripty.voiceFollowDiagnosticsOpen') === 'true'
    } catch {
      return false
    }
  })
  const [scrollMode, setScrollMode] = useState(SCROLL_MODES.TIMED)
  const [pickupSession, setPickupSession] = useState({
    contextKey: null,
    isActive: false,
  })
  const settings = resolveSettings(storedSettings)
  const parserMode = useMemo(
    () => resolveParserMode(script, scriptTypeOverride),
    [script, scriptTypeOverride],
  )
  const pickupContextKey = `${parserMode}\u0000${script}`
  const isPickupMode =
    pickupSession.isActive && pickupSession.contextKey === pickupContextKey
  const parserSegments = useMemo(
    () => parseScript(script, { scriptType: parserMode }),
    [parserMode, script],
  )
  const teleprompterSegmentModel = useMemo(
    () =>
      resolveTeleprompterSegmentModel({
        parserMode,
        parserSegments,
        script,
      }),
    [parserMode, parserSegments, script],
  )
  const { finalizedPrepareResult, reminders, segments } = teleprompterSegmentModel
  const reminderChecklist = useReminderChecklist({
    parserMode,
    reminders,
    script,
  })
  const speakers = useMemo(() => getSpeakers(segments), [segments])
  const normalizedSpeakerColors = useMemo(
    () => normalizeSpeakerColors(speakerColors, speakers),
    [speakerColors, speakers],
  )
  const trackableBlocks = useMemo(
    () => createTrackableBlocks(segments),
    [segments],
  )
  const recordingProgress = useRecordingProgress({
    parserMode,
    recordableBlocks: trackableBlocks,
    script,
  })
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
  const voiceTimingReporterRef = useRef(() => {})
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
    voiceTimingReporterRef.current({
      id: timing.visibleUpdateId,
      scrollRequestedAt,
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
      voiceTimingReporterRef.current({
        id: timing.visibleUpdateId,
        scrollSettledAt: getDiagnosticTime(),
      })
    })
    return true
  }, [])

  const voiceFollow = useVoiceFollow({
    blocks: trackableBlocks,
    onPositionChange: centerVoiceMatch,
  })
  const {
    recordVisibleTiming,
    visibleUpdateTiming,
  } = voiceFollow
  useEffect(() => {
    voiceTimingReporterRef.current = recordVisibleTiming
  }, [recordVisibleTiming])
  const isTimedPlaybackEnabled = canStartTimedScroll(
    scrollMode,
    voiceFollow.isEnabled,
  )
  const { controls, countdownValue, isPlaying, startCountdown } = useTeleprompter({
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

  useLayoutEffect(() => {
    if (!visibleUpdateTiming) return

    recordVisibleTiming({
      commitAt: getDiagnosticTime(),
      id: visibleUpdateTiming.id,
    })
  }, [recordVisibleTiming, visibleUpdateTiming])

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

  const scrollToRecordableBlock = useCallback(
    (recordableIndex) => {
      const viewport = viewportRef.current
      const recordableBlock = trackableBlocks[recordableIndex]
      const activeSegment =
        recordableBlock &&
        segmentRefs.current[recordableBlock.segmentIndex]
      if (!viewport || !activeSegment || !recordableBlock) return false

      const previousRecordableBlock =
        recordableIndex > 0 ? trackableBlocks[recordableIndex - 1] : null
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
        previousBlock: previousRecordableBlock
          ? getScrollBounds(
              segmentRefs.current[previousRecordableBlock.segmentIndex],
            )
          : null,
        viewportHeight: viewport.clientHeight,
        viewportScrollHeight: viewport.scrollHeight,
      })

      viewport.scrollTo({
        behavior: VOICE_FOLLOW_SCROLL_BEHAVIOR,
        top: targetTop,
      })
      isVoiceScrollingRef.current = true
      window.cancelAnimationFrame(voiceScrollFrameRef.current)
      voiceScrollFrameRef.current = window.requestAnimationFrame(() => {
        isVoiceScrollingRef.current = false
      })

      return true
    },
    [trackableBlocks],
  )

  const startRecordingTake = useCallback(
    (sectionId) => {
      const take = recordingProgress.startTake(sectionId)
      if (!take) return null

      const recordableIndex = recordingProgress.sections.findIndex(
        (section) => section.id === sectionId,
      )
      if (recordableIndex >= 0) {
        setCurrentVoiceBlock(recordableIndex)
        scrollToRecordableBlock(recordableIndex)
      }

      const shouldStartVoiceAfterCountdown =
        scrollMode === SCROLL_MODES.VOICE
      if (shouldStartVoiceAfterCountdown && voiceFollow.isEnabled) {
        voiceFollow.disable()
      }

      startCountdown(() => {
        recordingProgress.clearActiveTake()
        const completionAction = getTakeCompletionAction({
          isVoiceEnabled: shouldStartVoiceAfterCountdown
            ? false
            : voiceFollow.isEnabled,
          scrollMode,
        })

        if (completionAction === 'voice-follow') {
          voiceFollow.enable()
        } else if (completionAction === 'timed-scroll') {
          controls.play(false)
        }
      })

      return take
    },
    [
      controls,
      recordingProgress,
      scrollToRecordableBlock,
      scrollMode,
      setCurrentVoiceBlock,
      startCountdown,
      voiceFollow,
    ],
  )

  const resumeRecording = useCallback(() => {
    const target = recordingProgress.resumeTarget
    if (!target) return null

    return startRecordingTake(target.id)
  }, [recordingProgress.resumeTarget, startRecordingTake])

  const startPickups = useCallback(() => {
    const target = isPickupMode
      ? recordingProgress.pickupTarget
      : recordingProgress.pickupSections[0] ?? null
    if (!target) return null

    setPickupSession({ contextKey: pickupContextKey, isActive: true })
    return startRecordingTake(target.id)
  }, [
    isPickupMode,
    pickupContextKey,
    recordingProgress.pickupSections,
    recordingProgress.pickupTarget,
    startRecordingTake,
  ])

  const setRecordingStatus = useCallback(
    (sectionId, status) => {
      const isCurrentPickup = recordingProgress.pickupSections.some(
        (section) => section.id === sectionId,
      )
      const nextPickup =
        isPickupMode && isCurrentPickup && status === 'good'
          ? recordingProgress.pickupSections.find(
              (section) => section.id !== sectionId,
            ) ?? null
          : null

      recordingProgress.setSectionStatus(sectionId, status)

      if (!nextPickup) return
      recordingProgress.setSelectedSectionId(nextPickup.id)
      const nextIndex = recordingProgress.sections.findIndex(
        (section) => section.id === nextPickup.id,
      )
      if (nextIndex < 0) return
      setCurrentVoiceBlock(nextIndex)
      scrollToRecordableBlock(nextIndex)
    },
    [
      isPickupMode,
      recordingProgress,
      scrollToRecordableBlock,
      setCurrentVoiceBlock,
    ],
  )

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

  const setDiagnosticsOpen = useCallback((isOpen) => {
    setIsDiagnosticsOpen(isOpen)
    try {
      window.sessionStorage.setItem(
        'scripty.voiceFollowDiagnosticsOpen',
        String(isOpen),
      )
    } catch {
      // Diagnostics remain usable when browser storage is unavailable.
    }
  }, [])

  return (
    <main
      data-prepare-status={finalizedPrepareResult ? 'finalized' : 'unprepared'}
      className={`teleprompter ${settings.focusMode ? 'teleprompter--focus' : ''} ${
        recordingProgress.sections.length ? 'teleprompter--recording-open' : ''
      } ${
        voiceFollow.diagnostics.enabled && isDiagnosticsOpen
          ? 'teleprompter--diagnostics-open'
          : ''
      }`}
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
          {voiceFollow.diagnostics.enabled ? (
            <Button
              className="teleprompter__diagnostics-button"
              icon={Activity}
              onClick={() => setDiagnosticsOpen(!isDiagnosticsOpen)}
              title={isDiagnosticsOpen ? 'Hide diagnostics' : 'Show diagnostics'}
              variant="ghost"
            >
              Diagnostics
            </Button>
          ) : null}
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

      {recordingProgress.sections.length ? (
        <RecordingProgressPanel
          activeTake={recordingProgress.activeTake}
          goodCount={recordingProgress.goodCount}
          isCountdownActive={countdownValue !== null}
          isComplete={recordingProgress.isComplete}
          isPickupMode={isPickupMode}
          notRecordedCount={recordingProgress.notRecordedCount}
          onResumeRecording={resumeRecording}
          onSelectSection={recordingProgress.setSelectedSectionId}
          onSetNote={recordingProgress.setSectionNote}
          onSetStatus={setRecordingStatus}
          onStartPickups={startPickups}
          onStartTake={startRecordingTake}
          pickupCount={recordingProgress.pickupCount}
          pickupTarget={recordingProgress.pickupTarget}
          redoCount={recordingProgress.redoCount}
          progressPercent={recordingProgress.progressPercent}
          resumeTarget={recordingProgress.resumeTarget}
          sections={recordingProgress.sections}
          selectedSection={recordingProgress.selectedSection}
          selectedSectionId={recordingProgress.selectedSectionId}
        />
      ) : null}

      <VoiceFollowDiagnosticsPanel
        diagnostics={voiceFollow.diagnostics}
        isOpen={isDiagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
      />

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
          {reminderChecklist.items.length ? (
            <section
              aria-labelledby="teleprompter-reminders-title"
              className="teleprompter-reminders"
            >
              <h2 id="teleprompter-reminders-title">Reminders</h2>
              <ul>
                {reminderChecklist.items.map((reminder) => (
                  <li key={reminder.id}>
                    <label>
                      <input
                        checked={reminder.completed}
                        onChange={() => reminderChecklist.toggle(reminder.id)}
                        type="checkbox"
                      />
                      <span>{reminder.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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

      <CountdownOverlay
        countdownValue={countdownValue}
        takeNumber={recordingProgress.activeTake?.takeNumber}
      />

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
