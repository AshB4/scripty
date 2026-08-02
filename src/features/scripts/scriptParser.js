export const DEFAULT_SPEAKER_COLORS = [
  '#38BDF8',
  '#A78BFA',
  '#34D399',
  '#F59E0B',
  '#F472B6',
  '#FB7185',
  '#22D3EE',
]

const colonSpeakerPattern = /^([A-Z][A-Z0-9 ._'&-]{0,31}):\s*(.*)$/
const standaloneSpeakerPattern = /^[A-Z][A-Z0-9 ._'&-]{0,31}$/

function normalizeSpeaker(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function isStandaloneSpeaker(line, nextLine) {
  if (!nextLine || line.length > 32 || !standaloneSpeakerPattern.test(line)) {
    return false
  }

  return /[A-Z]/.test(line) && !colonSpeakerPattern.test(nextLine)
}

export function parseScript(rawScript) {
  const lines = String(rawScript ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const segments = []
  let currentSpeaker = 'Narrator'
  let currentText = []
  const speakerOrder = new Map()

  const colorFor = (speaker) => {
    if (!speakerOrder.has(speaker)) {
      speakerOrder.set(speaker, speakerOrder.size)
    }

    return DEFAULT_SPEAKER_COLORS[
      speakerOrder.get(speaker) % DEFAULT_SPEAKER_COLORS.length
    ]
  }

  const flush = () => {
    if (!currentText.length) {
      return
    }

    segments.push({
      id: `${segments.length + 1}-${currentSpeaker.toLowerCase()}`,
      speaker: currentSpeaker,
      text: currentText.join(' '),
      color: colorFor(currentSpeaker),
    })
    currentText = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const speakerMatch = line.match(colonSpeakerPattern)

    if (speakerMatch) {
      flush()
      currentSpeaker = normalizeSpeaker(speakerMatch[1])
      if (speakerMatch[2]) {
        currentText.push(speakerMatch[2].trim())
      }
      continue
    }

    if (isStandaloneSpeaker(line, lines[index + 1])) {
      flush()
      currentSpeaker = normalizeSpeaker(line)
      continue
    }

    currentText.push(line)
  }

  flush()

  return segments
}

export function getSpeakers(segments) {
  const speakers = new Map()

  segments.forEach(({ color, speaker }) => {
    if (!speakers.has(speaker)) {
      speakers.set(speaker, { color, name: speaker })
    }
  })

  return Array.from(speakers.values())
}

export function countWords(segments) {
  return segments.reduce((total, segment) => {
    return total + segment.text.split(/\s+/).filter(Boolean).length
  }, 0)
}
