const COUNTDOWN_RING_RADIUS = 42
const COUNTDOWN_RING_CIRCUMFERENCE = 2 * Math.PI * COUNTDOWN_RING_RADIUS

export default function CountdownOverlay({ countdownValue, takeNumber }) {
  if (countdownValue == null) return null

  return (
    <div
      aria-atomic="true"
      aria-live="assertive"
      aria-label={`Countdown ${countdownValue}`}
      className="countdown-overlay"
      role="status"
    >
      <div className="countdown-overlay__panel">
        {takeNumber ? (
          <p className="countdown-overlay__take">Take {takeNumber}</p>
        ) : null}
        <div
          className="countdown-overlay__stage"
          key={countdownValue}
        >
          <svg
            aria-hidden="true"
            className="countdown-overlay__ring"
            fill="none"
            viewBox="0 0 120 120"
          >
            <circle
              className="countdown-overlay__ring-track"
              cx="60"
              cy="60"
              r={COUNTDOWN_RING_RADIUS}
            />
            <circle
              className="countdown-overlay__ring-progress"
              cx="60"
              cy="60"
              r={COUNTDOWN_RING_RADIUS}
              style={{
                '--countdown-ring-circumference':
                  COUNTDOWN_RING_CIRCUMFERENCE,
                strokeDasharray: COUNTDOWN_RING_CIRCUMFERENCE,
              }}
            />
          </svg>
          <span className="countdown-overlay__number">
            {countdownValue}
          </span>
        </div>
      </div>
    </div>
  )
}
