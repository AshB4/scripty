import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileUp } from 'lucide-react'

export default function ScriptDropzone({ onTextLoaded }) {
  const onDrop = useCallback(
    async (acceptedFiles) => {
      const [file] = acceptedFiles
      if (!file) {
        return
      }

      onTextLoaded(await file.text())
    },
    [onTextLoaded],
  )

  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept: {
      'text/plain': ['.txt'],
    },
    multiple: false,
    onDrop,
  })

  return (
    <div
      {...getRootProps({
        className: `dropzone ${isDragActive ? 'dropzone--active' : ''}`,
      })}
    >
      <input {...getInputProps()} />
      <FileUp aria-hidden="true" size={22} />
      <span>{isDragActive ? 'Drop your script' : 'Import .txt'}</span>
    </div>
  )
}
