import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Focus, FlipHorizontal2, Maximize2, Settings } from 'lucide-react'
import Modal from '../../components/Modal.jsx'
import IconButton from '../../components/IconButton.jsx'
import { useLocalStorage } from '../../hooks/useLocalStorage.js'
import SpeakerSettings from '../scripts/SpeakerSettings.jsx'
import { getSpeakers, parseScript } from '../scripts/scriptParser.js'
import {
  DEFAULT_SETTINGS,
  getFontStack,
  resolveSettings,
} from '../scripts/scriptSettings.js'
import FloatingTrackpad from './FloatingTrackpad.jsx'
import TeleprompterControls from './TeleprompterControls.jsx'
import { useTeleprompter } from './useTeleprompter.js'

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
  const { controls, countdownValue, isPlaying, viewportRef } = useTeleprompter({
    countdownEnabled: settings.countdown,
    speed: settings.speed,
  })
  const segments = useMemo(() => parseScript(script), [script])
  const speakers = useMemo(() => getSpeakers(segments), [segments])

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
          <TeleprompterControls controls={controls} isPlaying={isPlaying} />
        </div>
      </header>

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
            segments.map((segment) => (
              <article
                className="prompt-segment"
                key={segment.id}
                style={{
                  '--speaker-color':
                    speakerColors[segment.speaker] ?? segment.color,
                }}
              >
                <span>{segment.speaker}</span>
                <p>{segment.text}</p>
              </article>
            ))
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
          speakerColors={speakerColors}
          speakers={speakers}
        />
      </Modal>
    </main>
  )
}
