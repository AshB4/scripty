import { Clipboard, Check } from 'lucide-react'
import { useMemo, useState } from 'react'

function formatWords(words) {
  return words.length ? words.join(' ') : 'none'
}

export default function VoiceFollowDiagnosticsPanel({ diagnostics }) {
  const [copied, setCopied] = useState(false)
  const events = diagnostics.events
  const summary = useMemo(
    () => ({
      maxFinalWords: Math.max(0, ...events.map((event) => event.finalWordCount)),
      maxRollingWords: Math.max(
        0,
        ...events.map((event) => event.rollingWordCount),
      ),
    }),
    [events],
  )

  if (!diagnostics.enabled) return null

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(events, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <aside
      aria-label="Voice Follow development diagnostics"
      className="voice-diagnostics"
    >
      <header>
        <div>
          <strong>Voice Follow diagnostics</strong>
          <span>
            Max rolling {summary.maxRollingWords} · final {summary.maxFinalWords}
          </span>
        </div>
        <button onClick={copyDiagnostics} type="button">
          {copied ? (
            <Check aria-hidden="true" size={14} />
          ) : (
            <Clipboard aria-hidden="true" size={14} />
          )}
          {copied ? 'Copied' : 'Copy Diagnostics'}
        </button>
      </header>
      <div className="voice-diagnostics__events" role="log">
        {events.length ? (
          events.map((event) => (
            <article key={`${event.sessionId}-${event.eventNumber}`}>
              <strong>
                #{event.eventNumber} · line {event.currentLine} → candidate{' '}
                {event.candidateLine ?? 'none'}
              </strong>
              <span>
                {event.resultKind || 'unknown'} · score {event.score ?? 'n/a'} /
                {' '}threshold {event.threshold ?? 'n/a'} · confirmation{' '}
                {event.confirmationCount}
              </span>
              <span>
                Interim: {formatWords(event.interimWords)} · Final:{' '}
                {formatWords(event.finalWords)}
              </span>
              <span>
                Rolling ({event.rollingWordCount}):{' '}
                {formatWords(event.rollingWords)}
              </span>
              <span>
                Event to movement:{' '}
                {event.movementLatencyMs === null
                  ? 'no movement'
                  : `${event.movementLatencyMs} ms`}
              </span>
            </article>
          ))
        ) : (
          <p>Start Voice Follow to capture recognition events.</p>
        )}
      </div>
    </aside>
  )
}
