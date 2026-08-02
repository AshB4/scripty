export default function Slider({
  label,
  max,
  min,
  onChange,
  step = 1,
  suffix = '',
  value,
}) {
  return (
    <label className="slider">
      <span className="slider__label">
        <span>{label}</span>
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}
