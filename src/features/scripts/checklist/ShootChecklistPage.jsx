import { useMemo, useState } from 'react'
import { ArrowLeft, Check, ClipboardCheck, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import AppHeader from '../../../components/AppHeader.jsx'
import Button from '../../../components/Button.jsx'
import IconButton from '../../../components/IconButton.jsx'
import { useLocalStorage } from '../../../hooks/useLocalStorage.js'
import { buildProductionMemorySnapshot } from '../../productionMemory/productionMemorySnapshot.js'
import ProductionAssistant from '../../productionMemory/ProductionAssistant.jsx'
import { useProductionMemorySync } from '../../productionMemory/useProductionMemorySync.js'
import { createTrackableBlocks } from '../../teleprompter/voiceFollow/voiceFollowMatcher.js'
import { resolveTeleprompterSegmentModel } from '../../teleprompter/preparedSegments.js'
import {
  buildRecordingProgressSections,
} from '../../teleprompter/recordingProgress/useRecordingProgress.js'
import { loadRecordingProgress } from '../../teleprompter/recordingProgress/recordingProgressStorage.js'
import { parseScript, resolveParserMode } from '../scriptParser.js'
import { PREPARE_TYPE_LABELS } from '../prepare/prepareLabels.js'
import { usePrepareForRecording } from '../prepare/usePrepareForRecording.js'
import { useShootChecklist } from './useShootChecklist.js'

export default function ShootChecklistPage() {
  const [script] = useLocalStorage('scripty.script', '')
  const [scriptTypeOverride] = useLocalStorage(
    'scripty.scriptTypeOverride',
    'Auto',
  )
  const [manualText, setManualText] = useState('')
  const parserMode = useMemo(
    () => resolveParserMode(script, scriptTypeOverride),
    [script, scriptTypeOverride],
  )
  const parserSegments = useMemo(
    () => parseScript(script, { scriptType: parserMode }),
    [parserMode, script],
  )
  const prepare = usePrepareForRecording({ parserMode, parserSegments, script })
  const finalizedPrepareResult = prepare.finalizedResult
  const teleprompterSegmentModel = useMemo(
    () =>
      resolveTeleprompterSegmentModel({
        parserMode,
        parserSegments,
        script,
      }),
    [parserMode, parserSegments, script],
  )
  const productionMemoryRecordingSections = useMemo(
    () =>
      buildRecordingProgressSections(
        createTrackableBlocks(teleprompterSegmentModel.segments),
        loadRecordingProgress(script, parserMode).sections,
      ),
    [parserMode, script, teleprompterSegmentModel.segments],
  )
  const checklist = useShootChecklist({
    parserMode,
    requirements: finalizedPrepareResult?.requirements ?? [],
    script,
  })
  const productionMemorySnapshot = useMemo(
    () =>
      buildProductionMemorySnapshot({
        checklistItems: checklist.items,
        parserMode,
        recordingSections: productionMemoryRecordingSections,
        script,
      }),
    [
      checklist.items,
      parserMode,
      productionMemoryRecordingSections,
      script,
    ],
  )
  useProductionMemorySync(productionMemorySnapshot)

  const addManualItem = (event) => {
    event.preventDefault()
    if (!manualText.trim()) return
    checklist.addManualItem(manualText)
    setManualText('')
  }

  return (
    <main className="shoot-checklist">
      <AppHeader>
        <Link className="button button--ghost" to="/scripts">
          <ArrowLeft aria-hidden="true" size={18} />
          <span>Back to Script</span>
        </Link>
      </AppHeader>
      <div className="shoot-checklist__content shell">
        <header className="shoot-checklist__intro">
          <p className="eyebrow">Prepare for Recording</p>
          <div className="shoot-checklist__heading-row">
            <div>
              <h1>Shoot Checklist</h1>
              <p>
                Track the production requirements from your finalized preparation.
              </p>
            </div>
            {finalizedPrepareResult ? (
              <Link className="button button--primary" to="/teleprompter">
                <span>Start Recording</span>
              </Link>
            ) : null}
          </div>
        </header>

        {!finalizedPrepareResult ? (
          <section className="shoot-checklist__empty">
            <ClipboardCheck aria-hidden="true" size={28} />
            <div>
              <h2>Finalize your preparation first</h2>
              <p>
                Shoot Checklist uses the production requirements you already
                reviewed in Prepare for Recording.
              </p>
            </div>
            <Link className="button button--primary" to="/scripts/review">
              <span>Review Preparation</span>
            </Link>
          </section>
        ) : (
          <div className="shoot-checklist__body">
            <section
              aria-label="Checklist progress"
              className="shoot-checklist__progress"
            >
              <div>
                <strong>
                  {checklist.progress.completed} of {checklist.progress.total}
                </strong>
                <span>
                  {checklist.progress.isComplete
                    ? 'Ready to shoot'
                    : 'requirements ready'}
                </span>
              </div>
              <div
                aria-label={`${checklist.progress.percent}% complete`}
                aria-valuemax="100"
                aria-valuemin="0"
                aria-valuenow={checklist.progress.percent}
                className="shoot-checklist__progress-track"
                role="progressbar"
              >
                <span style={{ width: `${checklist.progress.percent}%` }} />
              </div>
              <strong>{checklist.progress.percent}%</strong>
            </section>

            <ProductionAssistant productionId={productionMemorySnapshot.productionId} />

            <section aria-labelledby="shoot-checklist-items" className="shoot-checklist__items">
              <div className="shoot-checklist__section-heading">
                <div>
                  <h2 id="shoot-checklist-items">Production requirements</h2>
                  <p>Generated from Prepare, plus anything you add for this shoot.</p>
                </div>
              </div>

              {checklist.items.length ? (
                <ul className="shoot-checklist__list">
                  {checklist.items.map((item) => (
                    <li
                      className={`shoot-checklist__item ${
                        item.completed ? 'shoot-checklist__item--complete' : ''
                      } ${
                        item.status === 'tentative'
                          ? 'shoot-checklist__item--tentative'
                          : ''
                      }`}
                      key={item.id}
                    >
                      <button
                        aria-label={`${item.completed ? 'Mark incomplete' : 'Mark complete'}: ${item.text}`}
                        aria-pressed={item.completed}
                        className="shoot-checklist__toggle"
                        onClick={() => checklist.toggleItem(item.id)}
                        type="button"
                      >
                        {item.completed ? <Check aria-hidden="true" size={16} /> : null}
                      </button>
                      <div className="shoot-checklist__item-copy">
                        <div className="shoot-checklist__item-meta">
                          <span>{item.kind === 'manual' ? 'Manual' : PREPARE_TYPE_LABELS[item.type]}</span>
                          {item.status === 'tentative' ? (
                            <small>Tentative</small>
                          ) : null}
                        </div>
                        <p>{item.text}</p>
                      </div>
                      <IconButton
                        icon={Trash2}
                        label={`Remove checklist item: ${item.text}`}
                        onClick={() => checklist.removeItem(item)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="shoot-checklist__no-items">
                  No active production requirements. Add anything else you need below.
                </p>
              )}

              <form className="shoot-checklist__add" onSubmit={addManualItem}>
                <label htmlFor="manual-checklist-item">Add an item</label>
                <div>
                  <input
                    id="manual-checklist-item"
                    onChange={(event) => setManualText(event.target.value)}
                    placeholder="Charge camera batteries"
                    type="text"
                    value={manualText}
                  />
                  <Button disabled={!manualText.trim()} icon={Plus} type="submit">
                    Add
                  </Button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
