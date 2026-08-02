import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileUp } from 'lucide-react'

const acceptedFiles = {
  'application/octet-stream': ['.docx', '.txt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
  'text/plain': ['.txt'],
}

export default function ScriptDropzone({ disabled = false, onFileSelected }) {
  const onDrop = useCallback(
    (files, rejections) => {
      const file = files[0] ?? rejections[0]?.file
      if (!file) {
        return
      }

      onFileSelected(file)
    },
    [onFileSelected],
  )

  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept: acceptedFiles,
    disabled,
    multiple: false,
    onDrop,
  })

  return (
    <div className="script-import">
      <div
        {...getRootProps({
          'aria-disabled': disabled,
          className: `dropzone ${isDragActive ? 'dropzone--active' : ''}`,
        })}
      >
        <input
          {...getInputProps({
            accept: '.docx,.txt',
            onClick: (event) => {
              event.currentTarget.value = ''
            },
          })}
        />
        <FileUp aria-hidden="true" size={22} />
        <span>{isDragActive ? 'Drop your script' : 'Import Script'}</span>
      </div>
      <p className="script-import__support">
        <strong>Supports DOCX and TXT</strong>
        <span>Files are processed locally in your browser.</span>
      </p>
    </div>
  )
}
