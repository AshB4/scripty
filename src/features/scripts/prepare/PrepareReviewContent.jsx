import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import Button from '../../../components/Button.jsx'
import PrepareItemEditor from './PrepareItemEditor.jsx'
import { PREPARE_TYPE_LABELS } from './prepareLabels.js'
import {
  getPrepareClarifications,
  getPrepareSummary,
} from './preparePresentation.js'

function itemText(item) {
  return item.originalText ?? item.description ?? item.sourceText
}

function EditableItem({ editKey, editingKey, isBlocking, item, kind, onEdit, onSave }) {
  const isEditing = editingKey === editKey
  const isTentative = item.status === 'tentative' && !item.ignored
  return (
    <article
      className={`prepare-card__item ${item.ignored ? 'prepare-card__item--ignored' : ''} ${isTentative ? 'prepare-card__item--tentative' : ''} ${isBlocking ? 'prepare-card__item--blocking' : ''}`}
      data-blocks-finalize={isBlocking ? 'true' : undefined}
    >
      <div className="prepare-card__item-header">
        <div className="prepare-card__badges">
          <span className="prepare-card__type">
            {PREPARE_TYPE_LABELS[item.type] ?? 'Needs input'}
          </span>
          {item.status ? (
            <span
              className={`prepare-card__status prepare-card__status--${item.status}`}
            >
              {item.status === 'tentative' ? 'Tentative' : 'Confirmed'}
            </span>
          ) : null}
          {item.ignored ? (
            <span className="prepare-card__status prepare-card__status--ignored">
              ignored
            </span>
          ) : null}
          {isBlocking && item.type ? (
            <span className="prepare-card__status prepare-card__status--needs-input">
              Needs input
            </span>
          ) : null}
        </div>
        <div className="prepare-card__item-actions">
          {isTentative ? (
            <Button
              className="prepare-card__item-confirm"
              icon={Check}
              onClick={() => onSave({
                ignored: false,
                status: 'confirmed',
                type: item.type,
              })}
              variant="secondary"
            >
              Confirm
            </Button>
          ) : null}
          <button
            aria-expanded={isEditing}
            className="prepare-card__edit"
            onClick={() => onEdit(isEditing ? null : editKey)}
            type="button"
          >
            <Pencil aria-hidden="true" size={14} />
            <span>Change type</span>
          </button>
        </div>
      </div>
      <p>{itemText(item)}</p>
      {item.reason ? <small>{item.reason}</small> : null}
      {isEditing ? (
        <PrepareItemEditor
          item={item}
          kind={kind}
          onCancel={() => onEdit(null)}
          onSave={(correction) => {
            onSave(correction)
            onEdit(null)
          }}
        />
      ) : null}
    </article>
  )
}

function ResultList({ blockingIds, editingKey, items, kind, label, onEdit, onSave }) {
  if (!items.length) return null
  return (
    <section
      className={`prepare-review__group prepare-review__group--${kind}`}
      aria-labelledby={`prepare-review-${kind}`}
    >
      <h2 id={`prepare-review-${kind}`}>{label}</h2>
      <div className="prepare-card__list">
        {items.map((item) => {
          const editKey = `${kind}:${item.id}`
          return (
            <EditableItem
              editKey={editKey}
              editingKey={editingKey}
              isBlocking={kind === 'clarification' || blockingIds.has(item.id)}
              item={item}
              key={editKey}
              kind={kind}
              onEdit={onEdit}
              onSave={(correction) => onSave(item.id, correction)}
            />
          )
        })}
      </div>
    </section>
  )
}

export default function PrepareReviewContent({ onFinalize, prepare }) {
  const [editingKey, setEditingKey] = useState(null)
  const { canFinalize, isFinalized, result, unresolvedCount } = prepare
  const summary = getPrepareSummary(result)
  const clarifications = getPrepareClarifications(result)
  const blockingSegmentIds = new Set(
    result.segments
      .filter((segment) => segment.type === 'UNKNOWN' && !segment.ignored)
      .map((segment) => segment.id),
  )

  if (!result) return null

  return (
    <div className="prepare-review__body">
      <section className="prepare-review__summary" aria-label="Preparation summary">
        <span><strong>{summary.spoken}</strong> spoken</span>
        <span><strong>{summary.requirements}</strong> requirements</span>
        <span><strong>{summary.needsInput}</strong> need input</span>
      </section>
      <ResultList
        blockingIds={blockingSegmentIds}
        editingKey={editingKey}
        items={result.segments}
        kind="segment"
        label="Interpretation"
        onEdit={setEditingKey}
        onSave={prepare.updateSegment}
      />
      <ResultList
        blockingIds={new Set()}
        editingKey={editingKey}
        items={result.requirements}
        kind="requirement"
        label="Requirements"
        onEdit={setEditingKey}
        onSave={prepare.updateRequirement}
      />
      <ResultList
        blockingIds={new Set()}
        editingKey={editingKey}
        items={clarifications}
        kind="clarification"
        label="Needs clarification"
        onEdit={setEditingKey}
        onSave={prepare.resolveClarification}
      />
      <section className="prepare-review__finalize">
        <div>
          <h2>Ready to record?</h2>
          {unresolvedCount ? (
            <p role="status">
              {unresolvedCount} {unresolvedCount === 1 ? 'item needs' : 'items need'} your input before finalizing.
            </p>
          ) : (
            <p>
              Finalizing saves your corrections for the recording session. Your
              original script is never rewritten.
            </p>
          )}
        </div>
        <Button disabled={!canFinalize} onClick={onFinalize}>
          {isFinalized ? 'Start Recording' : 'Finalize & Start Recording'}
        </Button>
      </section>
    </div>
  )
}
