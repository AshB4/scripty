import { X } from 'lucide-react'
import IconButton from './IconButton.jsx'

export default function Modal({ children, isOpen, onClose, title }) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2>{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  )
}
