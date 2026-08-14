import { useState } from 'react'
import { Check, EyeOff, RotateCcw } from 'lucide-react'
import Button from '../../../components/Button.jsx'
import {
  PREPARE_REQUIREMENT_STATUSES,
  PREPARE_SEGMENT_TYPES,
  isPrepareRequirementType,
} from './prepareContract.js'
import { PREPARE_TYPE_LABELS } from './prepareLabels.js'

export default function PrepareItemEditor({
  item,
  kind,
  onCancel,
  onSave,
}) {
  const allowedTypes =
    kind === 'requirement'
      ? PREPARE_SEGMENT_TYPES.filter(isPrepareRequirementType)
      : PREPARE_SEGMENT_TYPES
  const [type, setType] = useState(item.type ?? 'UNKNOWN')
  const [status, setStatus] = useState(item.status ?? 'confirmed')
  const showStatus = isPrepareRequirementType(type)
  const isUnresolvedClarification = kind === 'clarification' && type === 'UNKNOWN'

  const save = () => {
    onSave({ ignored: false, status: showStatus ? status : null, type })
  }

  return (
    <div className="prepare-editor" role="group" aria-label="Edit prepared item">
      <div className="prepare-editor__section">
        <span>Classification</span>
        <div className="prepare-editor__chips">
          {allowedTypes.map((option) => (
            <button
              aria-pressed={type === option}
              className={`prepare-chip ${type === option ? 'prepare-chip--selected' : ''}`}
              key={option}
              onClick={() => setType(option)}
              type="button"
            >
              {PREPARE_TYPE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      {showStatus ? (
        <div className="prepare-editor__section">
          <span>Status</span>
          <div className="prepare-editor__chips">
            {PREPARE_REQUIREMENT_STATUSES.map((option) => (
              <button
                aria-pressed={status === option}
                className={`prepare-chip ${status === option ? 'prepare-chip--selected' : ''}`}
                key={option}
                onClick={() => setStatus(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {isUnresolvedClarification ? (
        <p className="prepare-editor__hint">
          Choose a known classification or ignore this item to resolve it.
        </p>
      ) : null}
      <div className="prepare-editor__actions">
        <Button onClick={onCancel} variant="ghost">Cancel</Button>
        <Button
          icon={item.ignored ? RotateCcw : EyeOff}
          onClick={() =>
            onSave({
              ignored: !item.ignored,
              status: showStatus ? status : null,
              type,
            })
          }
          variant="secondary"
        >
          {item.ignored ? 'Restore item' : 'Ignore item'}
        </Button>
        <Button disabled={isUnresolvedClarification} icon={Check} onClick={save}>
          Save correction
        </Button>
      </div>
    </div>
  )
}
