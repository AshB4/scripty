import { Check, Circle, RotateCcw } from 'lucide-react'
import Button from '../../../components/Button.jsx'

const statusLabels = {
  'good': 'Good',
  'not-recorded': 'Not Recorded',
  'redo': 'Redo',
}

export default function RecordingProgressPanel({
  activeTake,
  goodCount,
  isComplete,
  isCountdownActive,
  notRecordedCount,
  onResumeRecording,
  onSelectSection,
  onSetNote,
  onSetStatus,
  onStartTake,
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
      <div className="recording-progress__sections" role="list">
        {sections.map((section) => {
          const isSelected = selectedSectionId === section.id
          return (
            <button
              aria-pressed={isSelected}
              className={`recording-progress__section ${
                isSelected ? 'recording-progress__section--selected' : ''
              } recording-progress__section--${section.status}`}
              key={section.id}
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
          )
        })}
      </div>
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
                  Start Take
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
