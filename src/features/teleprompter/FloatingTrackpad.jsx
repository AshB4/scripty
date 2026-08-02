import { ChevronsUpDown, Pause, Play } from 'lucide-react'
import { useRef, useState } from 'react'

const clampSpeed = (speed) => Math.min(140, Math.max(20, Math.round(speed)))

export default function FloatingTrackpad({
  isPlaying,
  onSpeedChange,
  onToggle,
  speed,
}) {
  const dragRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startSpeed: speed, startY: event.clientY }
    setIsDragging(false)
  }

  const handlePointerMove = (event) => {
    if (!dragRef.current) return

    const distance = dragRef.current.startY - event.clientY
    if (Math.abs(distance) > 5) setIsDragging(true)
    onSpeedChange(clampSpeed(dragRef.current.startSpeed + distance * 0.45))
  }

  const handlePointerUp = () => {
    if (!isDragging) onToggle()
    dragRef.current = null
    setIsDragging(false)
  }

  return (
    <div
      aria-label={`${isPlaying ? 'Pause' : 'Play'} teleprompter. Drag vertically to change speed.`}
      className={`floating-trackpad ${isDragging ? 'floating-trackpad--dragging' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="button"
      tabIndex="0"
    >
      <ChevronsUpDown aria-hidden="true" size={18} />
      <span>
        <strong>{speed}</strong>
        <small>px/s</small>
      </span>
      {isPlaying ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />}
    </div>
  )
}
