import { Activity, Mic2 } from 'lucide-react'

export default function VoiceFollowPreview() {
  return (
    <section className="preview-band" id="voice-follow">
      <div className="voice-preview shell">
        <div>
          <p className="eyebrow">
            <Mic2 aria-hidden="true" size={16} />
            Flagship feature
          </p>
          <h2>Voice Follow AI</h2>
          <p className="voice-preview__copy">
            A future listening mode designed to move the script as you speak,
            pause when you pause, and keep your delivery natural.
          </p>
        </div>
        <div className="voice-preview__panel">
          <span className="coming-soon">Coming Soon</span>
          <Activity aria-hidden="true" size={34} />
          <strong>Voice-aware pacing</strong>
          <p>Placeholder interface only. No microphone or AI is active.</p>
          <button className="button button--secondary" disabled type="button">
            Join the future release
          </button>
        </div>
      </div>
    </section>
  )
}
