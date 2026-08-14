import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
import scriptyIcon from '../assets/scripty-icon-128.png'

export default function AppHeader({ children, className }) {
  return (
    <header className={clsx('app-header', className)}>
      <Link className="brand-link" to="/">
        <img
          alt=""
          aria-hidden="true"
          className="brand-mark brand-mark--image"
          height="32"
          src={scriptyIcon}
          width="32"
        />
        <span>Scripty</span>
      </Link>
      {children ? <div className="app-header__actions">{children}</div> : null}
    </header>
  )
}
