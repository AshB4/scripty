import { useState } from 'react'
import { SlidersHorizontal, WandSparkles } from 'lucide-react'

const SCRIPT_TYPES = [
  'Generic Teleprompter',
  'Screenplay',
  'Documentary',
  'Podcast',
  'Stage play',
  'Presentation',
]

const metric = (count, singular, plural = `${singular}s`) => ({
  count,
  label: count === 1 ? singular : plural,
})

export default function ScriptAnalysis({
  analysis,
  onTypeOverrideChange,
  typeOverride = 'Auto',
}) {
  const [isOverrideOpen, setIsOverrideOpen] = useState(false)
  const effectiveType =
    typeOverride === 'Auto' ? analysis.scriptType : typeOverride
  const isLowConfidence = analysis.confidence === 'Low'
  const isManualOverride = typeOverride !== 'Auto'
  const blockTypeSummary = Object.entries(analysis.blockTypes)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ')
  const metrics = [
    metric(analysis.speakerCount, 'speaker'),
    metric(analysis.parsedBlockCount, 'parsed block'),
    metric(analysis.speakableBlockCount, 'speakable block'),
    analysis.direction ? metric(analysis.direction, 'direction') : null,
    analysis.displayAndSection
      ? metric(analysis.displayAndSection, 'display / section block')
      : null,
    analysis.notice ? metric(analysis.notice, 'notice') : null,
    analysis.scene ? metric(analysis.scene, 'scene') : null,
    analysis.transition ? metric(analysis.transition, 'transition') : null,
  ].filter(Boolean)

  return (
    <section className="script-analysis" aria-label="Script analysis">
      <header className="script-analysis__header">
        <WandSparkles aria-hidden="true" size={19} />
        <div>
          <span>Script Analysis</span>
          <strong>{effectiveType}</strong>
        </div>
      </header>
      <div className="script-analysis__detection">
        <span>
          Detected: <strong>{analysis.scriptType}</strong>
        </span>
        {analysis.documentType ? (
          <span>
            Looks like: <strong>{analysis.documentType}</strong>
          </span>
        ) : null}
        <span>
          Confidence: <strong>{analysis.confidence}</strong>
        </span>
        <span>
          Parser: <strong>{analysis.parserMode}</strong>
          {isManualOverride ? ' (manual)' : ''}
        </span>
        <p>{analysis.detectionReason}</p>
        <p>Block types: {blockTypeSummary || 'None'}</p>
        {isLowConfidence && typeOverride === 'Auto' ? (
          <p>
            This document doesn't strongly match a supported production script.
            We'll treat it as normal teleprompter text.
          </p>
        ) : null}
      </div>
      <div className="script-analysis__metrics">
        {metrics.map(({ count, label }) => (
          <span key={label}>
            <strong>{count}</strong> {label}
          </span>
        ))}
      </div>
      <footer>
        <span>{analysis.wordCount} spoken words</span>
        <span>About {analysis.estimatedMinutes} min</span>
      </footer>
      <button
        className={`script-analysis__override-button ${
          isLowConfidence ? 'script-analysis__override-button--visible' : ''
        }`}
        onClick={() => setIsOverrideOpen((current) => !current)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={14} />
        <span>Switch Script Type</span>
      </button>
      {isOverrideOpen ? (
        <label className="script-analysis__override">
          <span>Script type</span>
          <select
            onChange={(event) => onTypeOverrideChange?.(event.target.value)}
            value={typeOverride}
          >
            <option value="Auto">Automatic detection</option>
            {SCRIPT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  )
}
