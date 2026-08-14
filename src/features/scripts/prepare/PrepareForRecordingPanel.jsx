import { useState } from 'react'
import { AlertTriangle, Check, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../../../components/Button.jsx'
import { getPrepareSummary } from './preparePresentation.js'

export default function PrepareForRecordingPanel({ prepare }) {
  const [isReprepareConfirming, setIsReprepareConfirming] = useState(false)
  const { button, error, isFinalized, result, status } = prepare
  const summary = getPrepareSummary(result)

  const runPrepare = () => {
    setIsReprepareConfirming(false)
    void prepare.prepare().catch(() => {})
  }

  const handlePrepare = () => {
    if (result) {
      setIsReprepareConfirming(true)
      return
    }
    runPrepare()
  }

  return (
    <section className="prepare-card" aria-label="Prepare for Recording">
      <div className="prepare-card__header">
        <span className="prepare-card__icon">
          <Sparkles aria-hidden="true" size={18} />
        </span>
        {result ? (
          <span className="prepare-card__ready">
            <Check aria-hidden="true" size={14} />
            {isFinalized ? 'Finalized' : 'Prepared'}
          </span>
        ) : null}
      </div>
      <div className="prepare-card__intro">
        <div className="prepare-card__title-row">
          <h2>Prepare for Recording</h2>
          <Link className="prepare-card__guide-link" to="/scripts/guide">
            Script Guide
          </Link>
        </div>
        <p>
          Classify spoken lines, production needs, and questions without changing
          your script.
        </p>
      </div>
      {result ? (
        <div className="prepare-card__compact-result">
          <div className="prepare-card__summary">
            <span><strong>{summary.spoken}</strong> spoken</span>
            <span><strong>{summary.requirements}</strong> requirements</span>
            <span><strong>{summary.needsInput}</strong> need input</span>
          </div>
          <Link className="button button--primary" to="/scripts/review">
            <span>Review Preparation</span>
          </Link>
        </div>
      ) : null}
      <Button
        disabled={button.disabled}
        onClick={handlePrepare}
        variant={result ? 'ghost' : 'primary'}
      >
        {button.label}
      </Button>
      {isReprepareConfirming ? (
        <div className="prepare-card__confirm" role="alert">
          <p>
            Preparing again replaces this review draft. Your last finalized
            preparation remains saved until you finalize the new review.
          </p>
          <div>
            <Button
              onClick={() => setIsReprepareConfirming(false)}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button onClick={runPrepare} variant="secondary">
              Replace review draft
            </Button>
          </div>
        </div>
      ) : null}
      {status === 'loading' ? (
        <p aria-live="polite" className="prepare-card__feedback" role="status">
          Interpreting this script locally...
        </p>
      ) : null}
      {error ? (
        <p className="prepare-card__error" role="alert">
          <AlertTriangle aria-hidden="true" size={15} />
          <span>{error}</span>
        </p>
      ) : null}
    </section>
  )
}
