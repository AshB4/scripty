export const DEFAULT_SETTINGS = {
  countdown: true,
  focusMode: false,
  fontFamily: 'Courier Prime',
  fontSize: 54,
  lineHeight: 1.45,
  mirror: false,
  speed: 70,
}

export const READING_FONTS = [
  {
    label: 'Courier Prime',
    value: 'Courier Prime',
    stack: "'Courier Prime', 'Courier New', monospace",
  },
  {
    label: 'IBM Plex Mono',
    value: 'IBM Plex Mono',
    stack: "'IBM Plex Mono', monospace",
  },
  {
    label: 'Cutive Mono',
    value: 'Cutive Mono',
    stack: "'Cutive Mono', monospace",
  },
]

export function resolveSettings(settings = {}) {
  return { ...DEFAULT_SETTINGS, ...settings }
}

export function getFontStack(fontFamily) {
  return (
    READING_FONTS.find((font) => font.value === fontFamily)?.stack ??
    READING_FONTS[0].stack
  )
}
