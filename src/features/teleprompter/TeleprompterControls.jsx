import { ChevronsLeft, ChevronsRight, Home, Pause, Play } from 'lucide-react'
import IconButton from '../../components/IconButton.jsx'

export default function TeleprompterControls({ controls, isPlaying }) {
  return (
    <div className="teleprompter-controls" aria-label="Teleprompter controls">
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
