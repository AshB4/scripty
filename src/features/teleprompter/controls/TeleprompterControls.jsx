import {
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  Mic2,
  MicOff,
  Pause,
  Play,
} from 'lucide-react'
import IconButton from '../../../components/IconButton.jsx'
import {
  getPrimaryControlState,
  SCROLL_MODES,
} from '../scrollMode.js'

export default function TeleprompterControls({
  controls,
  isPlaying,
  onModeChange,
  onPrimaryAction,
  scrollMode,
  voiceFollow,
}) {
  const statusClass = voiceFollow.status.toLowerCase().replace(/\s+/g, '-')
  const primaryControl = getPrimaryControlState({
    isTimedPlaying: isPlaying,
    isVoiceEnabled: voiceFollow.isEnabled,
    mode: scrollMode,
  })
  const isVoiceMode = scrollMode === SCROLL_MODES.VOICE
  const voiceControlLabel =
    isVoiceMode && voiceFollow.isEnabled
      ? 'Stop Voice Follow listening'
      : 'Start Voice Follow Beta listening'

  return (
    <div className="teleprompter-controls" aria-label="Teleprompter controls">
      <div
        aria-label="Scroll mode"
        className="scroll-mode-selector"
        role="group"
      >
        <button
          aria-label="Timed Scroll"
          aria-pressed={scrollMode === SCROLL_MODES.TIMED}
          className={`scroll-mode-button ${scrollMode === SCROLL_MODES.TIMED ? 'scroll-mode-button--active' : ''}`}
          onClick={() => onModeChange(SCROLL_MODES.TIMED)}
          type="button"
        >
          <span className="scroll-mode-button__full-label">Timed Scroll</span>
          <span className="scroll-mode-button__compact-label">Timed</span>
        </button>
        <button
          aria-label={voiceControlLabel}
          aria-pressed={isVoiceMode}
          className={`scroll-mode-button scroll-mode-button--voice scroll-mode-button--${statusClass} ${isVoiceMode ? 'scroll-mode-button--active' : ''}`}
          disabled={!voiceFollow.isSupported}
          onClick={() => onModeChange(SCROLL_MODES.VOICE)}
          title={voiceControlLabel}
          type="button"
        >
          <span className="scroll-mode-button__full-label">Voice Follow</span>
          <span className="scroll-mode-button__compact-label">Voice</span>
          <span className="scroll-mode-button__beta">Beta</span>
          {isVoiceMode ? (
            <output aria-live="polite">{voiceFollow.status}</output>
          ) : null}
        </button>
      </div>
      <IconButton
        icon={ChevronsUp}
        label="Top"
        onClick={controls.jumpToStart}
        title="Scroll to top"
      />
      <IconButton icon={ChevronsLeft} label="Rewind" onClick={controls.rewind} />
      <IconButton
        icon={
          isVoiceMode
            ? primaryControl.isActive
              ? MicOff
              : Mic2
            : primaryControl.isActive
              ? Pause
              : Play
        }
        label={primaryControl.label}
        onClick={onPrimaryAction}
      />
      <IconButton icon={ChevronsRight} label="Forward" onClick={controls.forward} />
    </div>
  )
}
