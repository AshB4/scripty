import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp, Maximize2, Mic2, Play, Trash2 } from 'lucide-react'
import Button from '../../components/Button.jsx'
import AppHeader from '../../components/AppHeader.jsx'
import Modal from '../../components/Modal.jsx'
import { useLocalStorage } from '../../hooks/useLocalStorage.js'
import ScriptDropzone from './ScriptDropzone.jsx'
import ParsedScriptPreview from './ParsedScriptPreview.jsx'
import PrepareForRecordingPanel from './prepare/PrepareForRecordingPanel.jsx'
import { usePrepareForRecording } from './prepare/usePrepareForRecording.js'
import ScriptAnalysis from './ScriptAnalysis.jsx'
import ScriptInput from './ScriptInput.jsx'
import { importScriptFile } from './scriptImport.js'
import SpeakerSettings from './SpeakerSettings.jsx'
import {
  analyzeScript,
  getSpeakers,
  normalizeSpeakerColors,
  parseScript,
  resolveParserMode,
  speakerColorsAreEqual,
} from './scriptParser.js'
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
  const [scriptTypeOverride, setScriptTypeOverride] = useLocalStorage(
    'scripty.scriptTypeOverride',
    'Auto',
  )
  const [isClearOpen, setIsClearOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [importFeedback, setImportFeedback] = useState({
    message: '',
    status: 'idle',
  })
  const importRequestId = useRef(0)
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
  const analysis = useMemo(
    () => analyzeScript(segments, script, { parserMode }),
    [parserMode, script, segments],
  )
  const prepare = usePrepareForRecording({ parserMode, script })
  const normalizedSpeakerColors = useMemo(
    () => normalizeSpeakerColors(speakerColors, speakers),
    [speakerColors, speakers],
  )

  useEffect(() => {
    if (!speakerColorsAreEqual(speakerColors, normalizedSpeakerColors)) {
      setSpeakerColors(normalizedSpeakerColors)
    }
  }, [normalizedSpeakerColors, setSpeakerColors, speakerColors])

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
    setScriptTypeOverride('Auto')
    setIsClearOpen(false)
  }

  const finishImport = (text, fileName) => {
    setScript(text)
    setScriptTypeOverride('Auto')
    setPendingImport(null)
    setImportFeedback({
      message: `${fileName} imported successfully.`,
      status: 'success',
    })
  }

  const handleFileSelected = async (file) => {
    const requestId = importRequestId.current + 1
    importRequestId.current = requestId
    setImportFeedback({ message: 'Importing script...', status: 'importing' })

    try {
      const text = await importScriptFile(file)
      if (requestId !== importRequestId.current) {
        return
      }

      if (script.trim()) {
        setPendingImport({ fileName: file.name, text })
        setImportFeedback({ message: '', status: 'idle' })
        return
      }

      finishImport(text, file.name)
    } catch (error) {
      if (requestId !== importRequestId.current) {
        return
      }

      setImportFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'This file could not be imported.',
        status: 'error',
      })
    }
  }

  return (
    <main className="workspace shell">
      <AppHeader>
        <Link className="button button--ghost" to="/scripts/guide">
          Script Guide
        </Link>
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
      </AppHeader>

      <section className="workspace__grid">
        <div className="workspace__main">
          <div className="panel-heading">
            <div>
              <h1>Script Workspace</h1>
              <p className="panel-subtitle">Prepare your script</p>
            </div>
            <div className="script-actions">
              <ScriptDropzone
                disabled={importFeedback.status === 'importing'}
                onFileSelected={handleFileSelected}
              />
              <Button
                className="script-action-button"
                icon={Trash2}
                onClick={() => setIsClearOpen(true)}
                variant="ghost"
              >
                Clear
              </Button>
            </div>
          </div>
          {importFeedback.message ? (
            <p
              aria-live="polite"
              className={`script-import-feedback script-import-feedback--${importFeedback.status}`}
              role={importFeedback.status === 'error' ? 'alert' : 'status'}
            >
              {importFeedback.message}
            </p>
          ) : null}
          <ScriptInput
            onChange={setScript}
            onFileSelected={handleFileSelected}
            value={script}
          />
        </div>

        <aside className="workspace__aside">
          <ScriptAnalysis
            analysis={analysis}
            onTypeOverrideChange={setScriptTypeOverride}
            typeOverride={scriptTypeOverride}
          />
          <PrepareForRecordingPanel prepare={prepare} />
          <section
            aria-label="Voice Follow browser beta"
            className="voice-follow-card"
          >
            <div className="voice-follow-card__header">
              <span className="voice-follow-card__icon">
                <Mic2 aria-hidden="true" size={18} />
              </span>
              <span className="coming-soon voice-follow-card__badge">
                Beta
              </span>
            </div>
            <h2>Voice Follow</h2>
            <p>
              Your teleprompter follows your voice instead of forcing you to
              follow it.
            </p>
            <span className="voice-follow-card__status">
              Available in Chrome
            </span>
          </section>
          <SpeakerSettings
            onChange={setSettings}
            onSpeakerColorChange={changeSpeakerColor}
            settings={settings}
            speakerColors={normalizedSpeakerColors}
            speakers={speakers}
          />
          <ParsedScriptPreview
            blocks={segments}
            speakerColors={normalizedSpeakerColors}
          />
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

      <Modal
        isOpen={Boolean(pendingImport)}
        onClose={() => setPendingImport(null)}
        title="Replace current script?"
      >
        <p className="modal-copy">
          Importing {pendingImport?.fileName} will replace the script currently
          saved in this browser.
        </p>
        <div className="modal-actions">
          <Button onClick={() => setPendingImport(null)} variant="secondary">
            Keep script
          </Button>
          <Button
            icon={FileUp}
            onClick={() => {
              if (pendingImport) {
                finishImport(pendingImport.text, pendingImport.fileName)
              }
            }}
          >
            Replace script
          </Button>
        </div>
      </Modal>
    </main>
  )
}
