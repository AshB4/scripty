import Slider from '../../components/Slider.jsx'
import { READING_FONTS } from './scriptSettings.js'

export default function SpeakerSettings({
  onChange,
  onSpeakerColorChange,
  settings,
  speakerColors = {},
  speakers = [],
}) {
  const update = (key, value) => onChange({ ...settings, [key]: value })
  const updateSpeakerColor = (speaker, color) => {
    onSpeakerColorChange?.(speaker, color)
  }

  return (
    <section className="settings-panel" aria-label="Teleprompter settings">
      <label className="select-control">
        <span>Reading font</span>
        <select
          onChange={(event) => update('fontFamily', event.target.value)}
          value={settings.fontFamily}
        >
          {READING_FONTS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <Slider
        label="Scroll speed"
        max={140}
        min={20}
        onChange={(value) => update('speed', value)}
        suffix="%"
        value={settings.speed}
      />
      <Slider
        label="Text size"
        max={84}
        min={32}
        onChange={(value) => update('fontSize', value)}
        suffix="px"
        value={settings.fontSize}
      />
      <Slider
        label="Line height"
        max={1.8}
        min={1.1}
        onChange={(value) => update('lineHeight', value)}
        step={0.05}
        value={settings.lineHeight}
      />

      <div className="toggle-list">
        <label className="toggle-control">
          <span>
            <strong>3-second countdown</strong>
            <small>Prepare before scrolling starts.</small>
          </span>
          <input
            checked={settings.countdown}
            onChange={(event) => update('countdown', event.target.checked)}
            type="checkbox"
          />
        </label>
        <label className="toggle-control">
          <span>
            <strong>Mirror mode</strong>
            <small>Flip text for a beam-splitter rig.</small>
          </span>
          <input
            checked={settings.mirror}
            onChange={(event) => update('mirror', event.target.checked)}
            type="checkbox"
          />
        </label>
      </div>

      {speakers.length ? (
        <div className="speaker-colors">
          <div className="section-label">
            <strong>Cast</strong>
            <span>Names and markers only</span>
          </div>
          {speakers.map((speaker) => (
            <label className="speaker-color" key={speaker.id}>
              <span
                aria-hidden="true"
                className="speaker-color__swatch"
                style={{
                  backgroundColor: speakerColors[speaker.id] ?? speaker.color,
                }}
              />
              <span>{speaker.label}</span>
              <input
                aria-label={`${speaker.label} color`}
                onChange={(event) =>
                  updateSpeakerColor(speaker.id, event.target.value)
                }
                onInput={(event) =>
                  updateSpeakerColor(speaker.id, event.target.value)
                }
                type="color"
                value={speakerColors[speaker.id] ?? speaker.color}
              />
            </label>
          ))}
        </div>
      ) : null}
    </section>
  )
}
