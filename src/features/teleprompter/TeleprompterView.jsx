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
import TeleprompterControls from './TeleprompterControls.jsx'
import { useTeleprompter } from './useTeleprompter.js'
import { useVoiceFollow } from './useVoiceFollow.js'
import { createTrackableBlocks } from './voiceFollowMatcher.js'

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
  const viewportRef = useRef(null)
  const segmentRefs = useRef([])
  const voiceScrollTimerRef = useRef(null)
  const isVoiceScrollingRef = useRef(false)

  const centerVoiceMatch = useCallback((match) => {
    const viewport = viewportRef.current
    const segment = segmentRefs.current[match.block.segmentIndex]
    if (!viewport || !segment) return

    isVoiceScrollingRef.current = true
    window.clearTimeout(voiceScrollTimerRef.current)
    viewport.scrollTo({
      behavior: 'smooth',
      top:
        segment.offsetTop -
        viewport.clientHeight / 2 +
        segment.offsetHeight / 2,
    })
    voiceScrollTimerRef.current = window.setTimeout(() => {
      isVoiceScrollingRef.current = false
    }, 700)
  }, [])

  const voiceFollow = useVoiceFollow({
    blocks: trackableBlocks,
    onPositionChange: centerVoiceMatch,
  })
  const { controls, countdownValue, isPlaying } = useTeleprompter({
    countdownEnabled: settings.countdown,
    onAutoScrollStart: voiceFollow.disable,
    speed: settings.speed,
    viewportRef,
  })
  const activeSegmentIndex =
    trackableBlocks[voiceFollow.currentBlockIndex]?.segmentIndex ?? 0
  const setCurrentVoiceBlock = voiceFollow.setCurrentBlockIndex

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
            isPlaying={isPlaying}
            voiceFollow={{
              isEnabled: voiceFollow.isEnabled,
              isSupported: voiceFollow.isSupported,
              onToggle: () => {
                if (!voiceFollow.isEnabled) controls.pause()
                voiceFollow.toggle()
              },
              status: voiceFollow.status,
            }}
          />
        </div>
      </header>

      {voiceFollow.message ? (
        <div className="voice-follow-message" role="status">
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
              const isActive =
                isDialogue && segmentIndex === activeSegmentIndex

              return (
                <article
                  className={`prompt-segment prompt-segment--${blockType} ${
                    isActive ? 'prompt-segment--active' : ''
                  }`}
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
                  <p>{segment.text}</p>
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
        isPlaying={isPlaying}
        onSpeedChange={(speed) => setSettings({ ...settings, speed })}
        onToggle={controls.toggle}
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
