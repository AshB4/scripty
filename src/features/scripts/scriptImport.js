const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const GENERIC_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
])
const DOCX_ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
])

// Script documents should remain comfortably within browser memory limits.
export const MAX_SCRIPT_FILE_SIZE = 10 * 1024 * 1024

export const IMPORT_ERRORS = {
  empty: 'This file contains no readable text.',
  oversized: 'This file is too large to import.',
  unreadableDocx: 'This DOCX file could not be read.',
  unreadableTxt: 'This TXT file could not be read.',
  unsupported: 'Unsupported file type. Import a DOCX or TXT script.',
}

function getExtension(fileName = '') {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/)
  return match?.[1] ?? ''
}

function hasCompatibleMimeType(extension, mimeType = '') {
  const normalizedMime = mimeType.toLowerCase().trim()

  if (GENERIC_MIME_TYPES.has(normalizedMime)) {
    return true
  }

  if (extension === 'txt') {
    return normalizedMime.startsWith('text/')
  }

  return (
    normalizedMime === DOCX_MIME_TYPE ||
    DOCX_ZIP_MIME_TYPES.has(normalizedMime)
  )
}

export function getScriptFileType(file) {
  const extension = getExtension(file?.name)

  if (!['docx', 'txt'].includes(extension)) {
    throw new Error(IMPORT_ERRORS.unsupported)
  }

  if (!hasCompatibleMimeType(extension, file?.type)) {
    throw new Error(IMPORT_ERRORS.unsupported)
  }

  return extension
}

function cleanExtractedText(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

async function extractTxt(file) {
  try {
    return cleanExtractedText(await file.text())
  } catch {
    throw new Error(IMPORT_ERRORS.unreadableTxt)
  }
}

async function extractDocx(file) {
  try {
    const [{ extractRawText }, arrayBuffer] = await Promise.all([
      import('mammoth/mammoth.browser.js'),
      file.arrayBuffer(),
    ])
    const { value } = await extractRawText({ arrayBuffer })
    return cleanExtractedText(value)
  } catch {
    throw new Error(IMPORT_ERRORS.unreadableDocx)
  }
}

export async function importScriptFile(file) {
  const fileType = getScriptFileType(file)

  if (file.size > MAX_SCRIPT_FILE_SIZE) {
    throw new Error(IMPORT_ERRORS.oversized)
  }

  const text =
    fileType === 'docx' ? await extractDocx(file) : await extractTxt(file)

  if (!text.trim()) {
    throw new Error(IMPORT_ERRORS.empty)
  }

  return text
}
