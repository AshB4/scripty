import {
  DEFAULT_SPEAKER_COLORS,
  normalizeSpeaker,
} from '../scripts/scriptParser.js'
import { validateFinalizedPrepareResult } from '../scripts/prepare/prepareContract.js'
import { loadFinalizedPrepareResult } from '../scripts/prepare/prepareStorage.js'

const productionSegmentPresentation = Object.freeze({
  AI_VIDEO: { subtype: 'ai-video', type: 'direction' },
  B_ROLL: { subtype: 'b-roll', type: 'direction' },
  CAMERA_CUT: { subtype: 'camera-cut', type: 'direction' },
  IMAGE_GRAPHIC: { subtype: 'image-graphic', type: 'direction' },
  PRODUCTION_CUE: { subtype: 'production-cue', type: 'direction' },
  PROP: { subtype: 'prop', type: 'direction' },
  SCREEN_RECORDING: { subtype: 'screen-recording', type: 'direction' },
})

function getSpokenText(originalText, speaker) {
  if (!speaker) return originalText.trim()

  const lines = originalText.split(/\r?\n/)
  const cue = `${speaker}:`
  const firstLine = lines[0].trim()

  if (firstLine === cue) return lines.slice(1).join('\n').trim()
  if (firstLine.startsWith(cue)) {
    return [firstLine.slice(cue.length).trimStart(), ...lines.slice(1)]
      .join('\n')
      .trim()
  }

  return originalText.trim()
}

export function createFinalizedTeleprompterModel(value) {
  const finalized = validateFinalizedPrepareResult(value)
  const speakerOrder = new Map()
  const reminders = finalized.segments
    .filter(
      (segment) => segment.type === 'CREATOR_REMINDER' && !segment.ignored,
    )
    .map((segment) => ({
      id: segment.id,
      text: segment.originalText,
    }))

  const segments = finalized.segments.flatMap((segment) => {
    if (segment.ignored || segment.type === 'CREATOR_REMINDER') return []

    if (segment.type === 'SPOKEN') {
      const speaker = segment.speaker ? normalizeSpeaker(segment.speaker) : null
      if (speaker && !speakerOrder.has(speaker.id)) {
        speakerOrder.set(speaker.id, speakerOrder.size)
      }

      return [{
        color: speaker
          ? DEFAULT_SPEAKER_COLORS[
              speakerOrder.get(speaker.id) % DEFAULT_SPEAKER_COLORS.length
            ]
          : undefined,
        id: segment.id,
        prepareType: segment.type,
        speaker: segment.speaker,
        speakerId: speaker?.id,
        speakerLabel: segment.speaker ?? 'Spoken',
        text: getSpokenText(segment.originalText, segment.speaker),
        type: 'dialogue',
      }]
    }

    const presentation = productionSegmentPresentation[segment.type]
    if (!presentation) return []

    return [{
      id: segment.id,
      prepareType: segment.type,
      status: segment.status,
      text: segment.originalText,
      ...presentation,
    }]
  })

  return { reminders, segments }
}

export function createFinalizedTeleprompterSegments(value) {
  return createFinalizedTeleprompterModel(value).segments
}

export function resolveTeleprompterSegmentModel({
  loadFinalized = loadFinalizedPrepareResult,
  parserMode,
  parserSegments,
  script,
}) {
  try {
    const finalizedPrepareResult = loadFinalized(script, parserMode)
    if (!finalizedPrepareResult) {
      return {
        finalizedPrepareResult: null,
        reminders: [],
        segments: parserSegments,
      }
    }

    return {
      finalizedPrepareResult,
      ...createFinalizedTeleprompterModel(finalizedPrepareResult),
    }
  } catch {
    return {
      finalizedPrepareResult: null,
      reminders: [],
      segments: parserSegments,
    }
  }
}
