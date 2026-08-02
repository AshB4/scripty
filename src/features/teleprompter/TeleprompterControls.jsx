import {
  ChevronsLeft,
  ChevronsRight,
  Home,
  Mic2,
  Pause,
  Play,
} from 'lucide-react'
import IconButton from '../../components/IconButton.jsx'

export default function TeleprompterControls({
  controls,
  isPlaying,
  voiceFollow,
}) {
  const statusClass = voiceFollow.status.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="teleprompter-controls" aria-label="Teleprompter controls">
      <label
        className={`voice-follow-toggle voice-follow-toggle--${statusClass}`}
      >
        <input
          aria-label="Voice Follow Beta"
          checked={voiceFollow.isEnabled}
          disabled={!voiceFollow.isSupported}
          onChange={voiceFollow.onToggle}
          type="checkbox"
        />
        <Mic2 aria-hidden="true" size={17} />
        <span className="voice-follow-toggle__name">Voice Follow</span>
        <span className="voice-follow-toggle__beta">Beta</span>
        <output aria-live="polite">{voiceFollow.status}</output>
      </label>
      <IconButton icon={Home} label="Jump to start" onClick={controls.jumpToStart} />
      <IconButton icon={ChevronsLeft} label="Rewind" onClick={controls.rewind} />
      <IconButton
        icon={isPlaying ? Pause : Play}
        label={isPlaying ? 'Pause' : 'Play'}
        onClick={controls.toggle}
      />
      <IconButton icon={ChevronsRight} label="Forward" onClick={controls.forward} />
    </div>
  )
}
