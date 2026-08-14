import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import AppHeader from '../../../components/AppHeader.jsx'
import {
  SCRIPT_GUIDE_EXAMPLE,
  SCRIPT_GUIDE_INLINE_CUES,
  SCRIPT_GUIDE_RECORDING_EXAMPLE,
  SCRIPT_GUIDE_REMINDER_EXAMPLES,
  SCRIPT_GUIDE_STATUSES,
  SCRIPT_GUIDE_TERMS,
  SCRIPT_GUIDE_WORKFLOW,
  getScriptGuideReturnLabel,
  getScriptGuideReturnPath,
} from './scriptGuideContent.js'

export default function ScriptGuidePage() {
  const location = useLocation()
  const returnLabel = getScriptGuideReturnLabel(location.search)
  const returnPath = getScriptGuideReturnPath(location.search)

  return (
    <main className="script-guide">
      <AppHeader className="shell">
        <Link className="button button--secondary" to={returnPath}>
          <ArrowLeft aria-hidden="true" size={18} />
          <span>{returnLabel}</span>
        </Link>
      </AppHeader>

      <div className="script-guide__content shell">
        <section className="script-guide__intro" aria-labelledby="script-guide-title">
          <p className="eyebrow">Prepare for Recording</p>
          <h1 id="script-guide-title">Script Guide</h1>
          <p>
            Understand how Scripty reads your script and the production terms it
            uses.
          </p>
        </section>

        <section className="script-guide__section" aria-labelledby="writing-title">
          <div className="script-guide__section-copy">
            <h2 id="writing-title">Writing a script for Scripty</h2>
            <p>
              Write naturally. Scripty understands both what you plan to say and
              what needs to happen during recording or editing. You do not need
              to learn a special format.
            </p>
          </div>
          <pre className="script-guide__example"><code>{SCRIPT_GUIDE_EXAMPLE}</code></pre>
          <div className="script-guide__format-note">
            <h3>Works with different script styles</h3>
            <p>
              Scripty can work with creator scripts, screenplays, stage plays,
              podcasts, training scripts, presentations, and other
              production-oriented formats. You do not need to rewrite your
              script into a special Scripty format.
            </p>
          </div>
          <aside className="script-guide__source-note">
            <strong>Your script text is never changed.</strong>
            <p>
              Scripty creates separate production metadata based on your script.
            </p>
          </aside>
        </section>

        <section className="script-guide__section" aria-labelledby="workflow-title">
          <div className="script-guide__section-copy">
            <h2 id="workflow-title">Your Scripty workflow</h2>
            <p>
              You do not need to use every part of Scripty at once. Start with
              your script and move through the workflow as you prepare, record,
              and finish your production.
            </p>
          </div>
          <ol className="script-guide__workflow" aria-label="Scripty workflow">
            {SCRIPT_GUIDE_WORKFLOW.map((step) => (
              <li key={step.label}>{step.shortLabel}</li>
            ))}
          </ol>
          <div className="script-guide__workflow-details">
            {SCRIPT_GUIDE_WORKFLOW.map((step) => (
              <article key={step.label}>
                <h3>{step.label}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="script-guide__section" aria-labelledby="terms-title">
          <div className="script-guide__section-copy">
            <h2 id="terms-title">What these terms mean</h2>
            <p>
              Scripty keeps spoken content and production instructions distinct
              while preserving your original wording.
            </p>
          </div>
          <div className="script-guide__term-grid">
            {SCRIPT_GUIDE_TERMS.map((term) => (
              <article className="script-guide__term" key={term.type}>
                <span>{term.label}</span>
                <p>{term.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="script-guide__section"
          aria-labelledby="recording-notes-title"
        >
          <div className="script-guide__section-copy">
            <h2 id="recording-notes-title">
              How production notes appear while recording
            </h2>
          </div>
          <div className="script-guide__recording-notes">
            <article>
              <h3>Creator Reminders</h3>
              <p>
                Creator Reminders are moved to the top of the teleprompter so
                you can review them before recording.
              </p>
              <ul>
                {SCRIPT_GUIDE_REMINDER_EXAMPLES.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
              <p>
                They do not appear in the middle of the spoken script and are
                not treated as spoken takes.
              </p>
            </article>
            <article>
              <h3>Production cues stay where they belong</h3>
              <p>
                Timing-sensitive production instructions remain inline at the
                point where they happen in the script.
              </p>
              <ul className="script-guide__cue-list">
                {SCRIPT_GUIDE_INLINE_CUES.map((cue) => (
                  <li key={cue}>{cue}</li>
                ))}
              </ul>
              <p>
                These cues stay inline because their position tells you when
                they are needed during recording or editing.
              </p>
            </article>
          </div>
          <pre className="script-guide__example script-guide__recording-example">
            <code>{SCRIPT_GUIDE_RECORDING_EXAMPLE}</code>
          </pre>
        </section>

        <section className="script-guide__section" aria-labelledby="statuses-title">
          <div className="script-guide__section-copy">
            <h2 id="statuses-title">Review statuses</h2>
            <p>These labels explain what needs your decision before recording.</p>
          </div>
          <div className="script-guide__status-list">
            {SCRIPT_GUIDE_STATUSES.map((status) => (
              <article className="script-guide__status" key={status.label}>
                <strong>{status.label}</strong>
                <p>{status.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="script-guide__footer">
          <Link className="button button--secondary" to={returnPath}>
            <ArrowLeft aria-hidden="true" size={18} />
            <span>{returnLabel}</span>
          </Link>
        </footer>
      </div>
    </main>
  )
}
