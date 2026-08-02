import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

export default function ScriptInput({ onChange, onFileSelected, value }) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      const [file] = acceptedFiles
      if (!file) {
        return
      }

      onFileSelected?.(file)
    },
    [onFileSelected],
  )

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop,
  })
  const isEmpty = !value.trim()

  return (
    <label
      {...getRootProps({
        className: `script-input ${isDragActive ? 'script-input--active' : ''}`,
      })}
    >
      <span>Script</span>
      <span className="script-input__frame">
        {isEmpty ? (
          <span aria-hidden="true" className="script-empty-state">
            <strong>Drop a script here</strong>
            <span>Paste your script</span>
            <span>Import a DOCX or TXT file</span>
          </span>
        ) : null}
        <textarea
          aria-label="Script text"
          onChange={(event) => onChange(event.target.value)}
          placeholder="HOST: Welcome back. Today we're recording the clean take..."
          spellCheck="true"
          value={value}
        />
      </span>
    </label>
  )
}
