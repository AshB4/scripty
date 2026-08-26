import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../../../components/AppHeader.jsx'
import { useLocalStorage } from '../../../hooks/useLocalStorage.js'
import { parseScript, resolveParserMode } from '../scriptParser.js'
import PrepareReviewContent from './PrepareReviewContent.jsx'
import { finalizePrepareAndNavigate } from './prepareWorkflow.js'
import { usePrepareForRecording } from './usePrepareForRecording.js'

export default function PrepareReviewPage() {
  const navigate = useNavigate()
  const [script] = useLocalStorage('scripty.script', '')
  const [scriptTypeOverride] = useLocalStorage(
    'scripty.scriptTypeOverride',
    'Auto',
  )
  const parserMode = useMemo(
    () => resolveParserMode(script, scriptTypeOverride),
    [script, scriptTypeOverride],
  )
  const parserSegments = useMemo(
    () => parseScript(script, { scriptType: parserMode }),
    [parserMode, script],
  )
  const prepare = usePrepareForRecording({ parserMode, parserSegments, script })

  return (
    <main className="prepare-review">
      <AppHeader className="shell">
        <Link className="button button--secondary" to="/scripts">
          <ArrowLeft aria-hidden="true" size={18} />
          <span>Back to Script</span>
        </Link>
      </AppHeader>
      <div className="prepare-review__content shell">
        <header className="prepare-review__intro">
          <p className="eyebrow">Prepare for Recording</p>
          <div className="prepare-review__heading-row">
            <h1>Review Preparation</h1>
            <Link
              className="button button--secondary"
              to="/scripts/guide?from=review"
            >
              Script Guide
            </Link>
          </div>
          <p>Review Scripty's interpretation before recording.</p>
        </header>
        {prepare.result ? (
          <PrepareReviewContent
            onFinalize={() =>
              finalizePrepareAndNavigate({
                finalize: prepare.finalize,
                navigate,
              })
            }
            prepare={prepare}
          />
        ) : (
          <section className="prepare-review__empty">
            <h2>No preparation to review</h2>
            <p>Prepare your script first, then return here to review it.</p>
            <Link className="button button--primary" to="/scripts">
              Back to Script
            </Link>
          </section>
        )}
      </div>
    </main>
  )
}
