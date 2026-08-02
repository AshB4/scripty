export default function ScriptInput({ onChange, value }) {
  return (
    <label className="script-input">
      <span>Script</span>
      <textarea
        aria-label="Script text"
        onChange={(event) => onChange(event.target.value)}
        placeholder="HOST: Welcome back. Today we're recording the clean take..."
        spellCheck="true"
        value={value}
      />
    </label>
  )
}
