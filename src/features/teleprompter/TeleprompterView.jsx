import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Focus, FlipHorizontal2, Maximize2, Settings } from 'lucide-react'
import Modal from '../../components/Modal.jsx'
import IconButton from '../../components/IconButton.jsx'
import { useLocalStorage } from '../../hooks/useLocalStorage.js'
import SpeakerSettings from '../scripts/SpeakerSettings.jsx'
import {
  getSpeakers,
  normalizeSpeakerColors,
  parseScript,
  speakerColorsAreEqual,
} from '../scripts/scriptParser.js'
import {
  DEFAULT_SETTINGS,
  getFontStack,
  resolveSettings,
} from '../scripts/scriptSettings.js'
import FloatingTrackpad from './FloatingTrackpad.jsx'
import {
  canStartTimedScroll,
  getModeSwitchEffects,
  SCROLL_MODES,
} from './scrollMode.js'
import TeleprompterControls from './TeleprompterControls.jsx'
import { useTeleprompter } from './useTeleprompter.js'
import { useVoiceFollow } from './useVoiceFollow.js'
import {
  getDiagnosticTime,
  logVoiceFollowDiagnostic,
} from './voiceFollowDiagnostics.js'
import {
  createTrackableBlocks,
  toVoiceWords,
} from './voiceFollowMatcher.js'

const promptBlockLabels = {
  direction: 'Direction',
  display: 'Display',
  metadata: 'File metadata',
  notice: 'Notice',
  pause: 'Pause',
  scene: 'Scene heading',
  section: 'Section',
  transition: 'Transition',
}

function getPromptBlockLabel(block) {
  if (block.type === 'direction' && block.subtype === 'audio') return 'Audio cue'
  if (block.type === 'direction' && block.subtype === 'visual') return 'Visual cue'
  if (block.type === 'direction' && block.subtype === 'display-cue') {
    return 'Display cue'
  }
  return promptBlockLabels[block.type] ?? 'Direction'
}

function renderDialogueProgress(text, matchedWordCount) {
  let wordIndex = 0

  return text.split(/(\s+)/).map((token, tokenIndex) => {
    const tokenWordCount = toVoiceWords(token).length
    const isSpoken =
      tokenWordCount > 0 && wordIndex + tokenWordCount <= matchedWordCount
    wordIndex += tokenWordCount

    return (
      <span
        className={
          tokenWordCount
            ? `prompt-word prompt-word--${isSpoken ? 'spoken' : 'remaining'}`
            : undefined
        }
        key={`${tokenIndex}-${token}`}
      >
        {token}
      </span>
    )
  })
}

export default function TeleprompterView() {
  const [script] = useLocalStorage('scripty.script', '')
  const [storedSettings, setSettings] = useLocalStorage(
    'scripty.settings',
    DEFAULT_SETTINGS,
  )
  const [speakerColors, setSpeakerColors] = useLocalStorage(
    'scripty.speakerColors',
    {},
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [scrollMode, setScrollMode] = useState(SCROLL_MODES.TIMED)
  const settings = resolveSettings(storedSettings)
  const segments = useMemo(() => parseScript(script), [script])
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
  const voiceScrollEndHandlerRef = useRef(null)
  const voiceScrollTimerRef = useRef(null)
  const isVoiceScrollingRef = useRef(false)

  const centerVoiceMatch = useCallback((match, timing = {}) => {
    const viewport = viewportRef.current
    const segment = segmentRefs.current[match.block.segmentIndex]
    if (!viewport || !segment) return

    const scrollStartedAt = getDiagnosticTime()
    const targetTop =
      segment.offsetTop -
      viewport.clientHeight / 2 +
      segment.offsetHeight / 2
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
      isVoiceScrollingRef.current = false
      logVoiceFollowDiagnostic('scroll-settled', {
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

  const changeScrollMode = useCallback(
    (nextMode) => {
      if (nextMode === scrollMode) return

      const effects = getModeSwitchEffects(nextMode)
      if (effects.stopTimed) controls.pause()
      if (effects.stopVoice) voiceFollow.disable()

      setScrollMode(effects.nextMode)
      if (effects.startVoice) voiceFollow.enable()
    },
    [controls, scrollMode, voiceFollow],
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
        <Link className="brand-link" to="/scripts">
          <span className="brand-mark">S</span>
          <span>Scripty</span>
        </Link>
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
              const blockType = segment.type ?? 'dialogue'
              const isDialogue = blockType === 'dialogue'
              const voiceBlockIndex = voiceBlockIndexes.get(segmentIndex)
              const isActive =
                isDialogue && segmentIndex === activeSegmentIndex
              const isSpoken =
                isDialogue && voiceBlockIndex < voiceFollow.currentBlockIndex
              const isUpcoming =
                isDialogue && voiceBlockIndex > voiceFollow.currentBlockIndex

              return (
                <article
                  className={`prompt-segment prompt-segment--${blockType} ${
                    isActive ? 'prompt-segment--active' : ''
                  } ${isSpoken ? 'prompt-segment--spoken' : ''} ${
                    isUpcoming ? 'prompt-segment--upcoming' : ''
                  }`}
                  aria-current={isActive ? 'true' : undefined}
                  data-voice-state={
                    isActive
                      ? 'current'
                      : isSpoken
                        ? 'spoken'
                        : isUpcoming
                          ? 'upcoming'
                          : undefined
                  }
                  data-word-progress={
                    isActive && voiceFollow.isEnabled
                      ? `${voiceFollow.matchedWordCount}/${voiceFollow.totalWordCount}`
                      : undefined
                  }
                  key={segment.id}
                  ref={(element) => {
                    segmentRefs.current[segmentIndex] = element
                  }}
                  style={
                    isDialogue
                      ? {
                          '--speaker-color':
                            normalizedSpeakerColors[segment.speakerId] ??
                            segment.color,
                        }
                      : undefined
                  }
                >
                  <span>
                    {isDialogue
                      ? segment.speakerLabel
                      : getPromptBlockLabel(segment)}
                  </span>
                  <p>
                    {isActive && voiceFollow.isEnabled
                      ? renderDialogueProgress(
                          segment.text,
                          voiceFollow.matchedWordCount,
                        )
                      : segment.text}
                  </p>
                </article>
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
