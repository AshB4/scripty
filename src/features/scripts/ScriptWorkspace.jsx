import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Maximize2, Play, Trash2, WandSparkles } from 'lucide-react'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import { useLocalStorage } from '../../hooks/useLocalStorage.js'
import ScriptDropzone from './ScriptDropzone.jsx'
import ScriptInput from './ScriptInput.jsx'
import SpeakerSettings from './SpeakerSettings.jsx'
import { countWords, getSpeakers, parseScript } from './scriptParser.js'
import { DEFAULT_SETTINGS, resolveSettings } from './scriptSettings.js'

const sampleScript = `HOST: Open with the main promise and look into the lens.

GUEST: Keep the answer short, then pause for the lower third.

HOST: Close with the call to action and leave room for the music sting.`

export default function ScriptWorkspace() {
  const [script, setScript] = useLocalStorage('scripty.script', sampleScript)
  const [storedSettings, setSettings] = useLocalStorage(
    'scripty.settings',
    DEFAULT_SETTINGS,
  )
  const [speakerColors, setSpeakerColors] = useLocalStorage(
    'scripty.speakerColors',
    {},
  )
  const [isClearOpen, setIsClearOpen] = useState(false)
  const settings = resolveSettings(storedSettings)
  const segments = parseScript(script)
  const speakers = getSpeakers(segments)
  const wordCount = countWords(segments)
  const minutes = wordCount ? Math.max(1, Math.round(wordCount / 140)) : 0

  const changeSpeakerColor = (speaker, color) => {
    setSpeakerColors((current) => ({ ...current, [speaker]: color }))
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen()
    } catch {
      // Fullscreen can be blocked by browser or embedding permissions.
    }
  }

  const clearScript = () => {
    setScript('')
    setSpeakerColors({})
    setIsClearOpen(false)
  }

  return (
    <main className="workspace shell">
      <header className="workspace__header">
        <Link className="brand-link" to="/">
          <span className="brand-mark">S</span>
          <span>Scripty</span>
        </Link>
        <div className="workspace__header-actions">
          <Button
            aria-label="Toggle fullscreen"
            icon={Maximize2}
            onClick={toggleFullscreen}
            variant="ghost"
          >
            Fullscreen
          </Button>
          <Link
            aria-disabled={!script.trim()}
            className="button button--primary"
            onClick={(event) => {
              if (!script.trim()) event.preventDefault()
            }}
            to="/teleprompter"
          >
            <Play aria-hidden="true" size={18} />
            <span>Start teleprompter</span>
          </Link>
        </div>
      </header>

      <section className="workspace__grid">
        <div className="workspace__main">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Script workspace</p>
              <h1>Prepare your script</h1>
            </div>
            <div className="script-actions">
              <ScriptDropzone onTextLoaded={setScript} />
              <Button
                icon={Trash2}
                onClick={() => setIsClearOpen(true)}
                variant="ghost"
              >
                Clear
              </Button>
            </div>
          </div>
          <ScriptInput onChange={setScript} value={script} />
        </div>

        <aside className="workspace__aside">
          <section className="summary-panel">
            <WandSparkles aria-hidden="true" size={21} />
            <div>
              <strong>{segments.length} segments</strong>
              <span>
                {wordCount} words · about {minutes} min
              </span>
            </div>
          </section>
          <SpeakerSettings
            onChange={setSettings}
            onSpeakerColorChange={changeSpeakerColor}
            settings={settings}
            speakerColors={speakerColors}
            speakers={speakers}
          />
          <section className="segment-list" aria-label="Parsed script">
            {segments.map((segment) => (
              <article
                key={segment.id}
                style={{
                  '--speaker-color':
                    speakerColors[segment.speaker] ?? segment.color,
                }}
              >
                <span>{segment.speaker}</span>
                <p>{segment.text}</p>
              </article>
            ))}
          </section>
        </aside>
      </section>

      <Modal
        isOpen={isClearOpen}
        onClose={() => setIsClearOpen(false)}
        title="Clear this script?"
      >
        <p className="modal-copy">
          This removes the saved script and its speaker colors from this browser.
        </p>
        <div className="modal-actions">
          <Button onClick={() => setIsClearOpen(false)} variant="secondary">
            Keep script
          </Button>
          <Button icon={Trash2} onClick={clearScript} variant="danger">
            Clear script
          </Button>
        </div>
      </Modal>
    </main>
  )
}
