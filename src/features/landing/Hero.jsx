import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import logo from '../../assets/scripty-logo.png'

export default function Hero() {
  return (
    <section className="hero-section">
      <nav className="hero-nav shell" aria-label="Primary navigation">
        <Link className="brand-link" to="/">
          <img alt="Scripty logo" src={logo} />
          <span>Scripty</span>
        </Link>
        <div className="hero-nav__links">
          <a className="nav-link" href="#features">Features</a>
          <a className="nav-link" href="#voice-follow">Voice Follow AI</a>
          <Link className="nav-link" to="/scripts">Workspace</Link>
        </div>
      </nav>

      <div className="hero-section__inner shell">
        <div className="hero-copy">
          <img className="hero-copy__logo" alt="Scripty logo" src={logo} />
          <h1>Scripty</h1>
          <p className="hero-copy__tagline">The Teleprompter That Keeps Up.</p>
          <p className="hero-copy__lede">
            A modern browser-based teleprompter built for creators.
          </p>
          <Link className="button button--primary" to="/scripts">
            <span>Launch Scripty</span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>

        <div className="hero-device" aria-hidden="true">
          <div className="hero-device__topbar">
            <span />
            <span />
            <span />
          </div>
          <div className="hero-device__screen">
            <p>CREATOR</p>
            <strong>The words move at your pace, right inside your browser.</strong>
            <div className="read-line" />
          </div>
        </div>
      </div>
    </section>
  )
}
