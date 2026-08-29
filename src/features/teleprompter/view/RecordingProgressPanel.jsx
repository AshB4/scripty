import { memo } from 'react'
import { Check, Circle, RotateCcw } from 'lucide-react'
import Button from '../../../components/Button.jsx'

const statusLabels = {
  'good': 'Good',
  'not-recorded': 'Not Recorded',
  'redo': 'Redo',
}

const statusActions = [
  { Icon: Circle, label: 'Not Recorded', status: 'not-recorded' },
  { Icon: RotateCcw, label: 'Redo', status: 'redo' },
  { Icon: Check, label: 'Good', status: 'good' },
]

const RecordingProgressSectionList = memo(function RecordingProgressSectionList({
  onSelectSection,
  onSetStatus,
  sections,
  selectedSectionId,
}) {
  return (
    <div className="recording-progress__sections" role="list">
      {sections.map((section) => {
        const isSelected = selectedSectionId === section.id
        return (
          <article
            className={`recording-progress__section ${
              isSelected ? 'recording-progress__section--selected' : ''
            } recording-progress__section--${section.status}`}
            key={section.id}
            role="listitem"
          >
            <button
              aria-pressed={isSelected}
              className="recording-progress__section-main"
              onClick={() => onSelectSection(section.id)}
              type="button"
            >
              <span className="recording-progress__section-status">
                {section.symbol}
                <strong>{statusLabels[section.status]}</strong>
              </span>
              <span className="recording-progress__section-text">
                <strong>{section.speakerLabel}</strong>
                <small>{section.text}</small>
              </span>
              <span className="recording-progress__section-take">
                Take {section.takeCount}
              </span>
            </button>
            <div
              aria-label={`Set recording status for ${section.text}`}
              className="recording-progress__section-status-actions"
              role="group"
            >
              {statusActions.map(({ Icon, label, status }) => (
                <button
                  aria-label={`Set ${section.text} to ${label}`}
                  aria-pressed={section.status === status}
                  className={`recording-progress__status-pill recording-progress__status-pill--${status} ${
                    section.status === status
                      ? 'recording-progress__status-pill--active'
                      : ''
                  }`}
                  key={status}
                  onClick={() => onSetStatus(section.id, status)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={12} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
})

export default function RecordingProgressPanel({
  activeTake,
  goodCount,
  isComplete,
  isCountdownActive,
  isPickupMode,
  notRecordedCount,
  onResumeRecording,
  onSelectSection,
  onSetNote,
  onSetStatus,
  onStartPickups,
  onStartTake,
  pickupCount,
  pickupTarget,
  redoCount,
  progressPercent,
  resumeTarget,
  sections,
  selectedSection,
  selectedSectionId,
}) {
  return (
    <section className="recording-progress" aria-label="Recording progress">
      <header className="recording-progress__header">
        <div>
          <strong>Recording Progress</strong>
          <span>Recording Progress: {progressPercent}%</span>
        </div>
        <div className="recording-progress__header-actions">
          <span className="recording-progress__status">
            {isComplete ? 'Recording complete' : 'Active takes tracked here'}
          </span>
          <Button
            disabled={!resumeTarget || isCountdownActive}
            onClick={onResumeRecording}
            variant="secondary"
          >
            Resume Recording
          </Button>
        </div>
      </header>
      <div className="recording-progress__summary">
        <span>
          <Circle aria-hidden="true" size={12} />
          <strong>{notRecordedCount}</strong>
          Not Recorded
        </span>
        <span>
          <RotateCcw aria-hidden="true" size={12} />
          <strong>{redoCount}</strong>
          Redo
        </span>
        <span>
          <Check aria-hidden="true" size={12} />
          <strong>{goodCount}</strong>
          Good
        </span>
      </div>
      <section
        aria-label="Pickup mode"
        className={`recording-progress__pickups ${
          isPickupMode ? 'recording-progress__pickups--active' : ''
        }`}
      >
        {isPickupMode && pickupCount === 0 ? (
          <div>
            <strong>All Pickups Complete</strong>
            <span>No Redo sections remain. Not Recorded sections are unchanged.</span>
          </div>
        ) : pickupCount > 0 ? (
          <>
            <div>
              <strong>
                {pickupCount} {pickupCount === 1 ? 'pickup' : 'pickups'} remaining
              </strong>
              {isPickupMode && pickupTarget ? (
                <span>
                  Current pickup: {pickupTarget.text} · Take{' '}
                  {activeTake?.sectionId === pickupTarget.id
                    ? activeTake.takeNumber
                    : pickupTarget.takeCount}
                </span>
              ) : (
                <span>Pickup Mode records only sections marked Redo.</span>
              )}
            </div>
            <Button
              disabled={isCountdownActive}
              onClick={onStartPickups}
              variant="primary"
            >
              {isPickupMode ? 'Start Pickup' : 'Start Pickups'}
            </Button>
          </>
        ) : (
          <div>
            <strong>No outstanding pickups</strong>
            <span>Mark a section Redo when it needs another take.</span>
          </div>
        )}
      </section>
      <RecordingProgressSectionList
        onSelectSection={onSelectSection}
        onSetStatus={onSetStatus}
        sections={sections}
        selectedSectionId={selectedSectionId}
      />
      {selectedSectionId ? (
        <div className="recording-progress__detail">
          {activeTake?.sectionId === selectedSectionId ? (
            <div className="recording-progress__take-banner">
              <strong>Take {activeTake.takeNumber}</strong>
            </div>
          ) : null}
          {selectedSection ? (
            <>
              <div className="recording-progress__detail-actions">
                <Button
                  disabled={isCountdownActive}
                  onClick={() => onStartTake(selectedSectionId)}
                  variant="primary"
                >
                  {selectedSection.status === 'redo'
                    ? 'Start This Pickup'
                    : 'Start Take'}
                </Button>
                <Button
                  onClick={() => onSetStatus(selectedSectionId, 'good')}
                  variant="ghost"
                >
                  Good Take
                </Button>
                <Button
                  onClick={() => onSetStatus(selectedSectionId, 'redo')}
                  variant="ghost"
                >
                  Redo
                </Button>
              </div>
              <label className="recording-progress__note">
                <span>Optional note</span>
                <textarea
                  onChange={(event) =>
                    onSetNote(selectedSectionId, event.target.value)
                  }
                  placeholder="Stumbled near ending"
                  value={selectedSection.note ?? ''}
                />
              </label>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
