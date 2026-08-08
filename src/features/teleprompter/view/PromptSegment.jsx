import { memo } from 'react'
import { splitDialogueProgress } from './progressiveText.js'

const promptBlockLabels = {
  direction: 'Direction',
  display: 'Display',
  metadata: 'File metadata',
  notice: 'Notice',
  pause: 'Pause',
  scene: 'Scene heading',
  section: 'Section',
  transition: 'Transition',
}

function getPromptBlockLabel(block) {
  if (block.type === 'direction' && block.subtype === 'audio') return 'Audio cue'
  if (block.type === 'direction' && block.subtype === 'visual') return 'Visual cue'
  if (block.type === 'direction' && block.subtype === 'display-cue') {
    return 'Display cue'
  }
  if (block.type === 'direction' && block.subtype === 'action') {
    return 'Action / stage direction'
  }
  return promptBlockLabels[block.type] ?? 'Direction'
}

function PromptSegment({
  matchedWordCount,
  segment,
  segmentIndex,
  setSegmentElement,
  speakerColor,
  totalWordCount,
  voiceState,
}) {
  const blockType = segment.type ?? 'dialogue'
  const isDialogue = blockType === 'dialogue'
  const isActive = voiceState === 'current'
  const progress =
    isActive && matchedWordCount !== null
      ? splitDialogueProgress(segment.text, matchedWordCount)
      : null

  return (
    <article
      aria-current={isActive ? 'true' : undefined}
      className={`prompt-segment prompt-segment--${blockType} ${
        isActive ? 'prompt-segment--active' : ''
      } ${voiceState === 'spoken' ? 'prompt-segment--spoken' : ''} ${
        voiceState === 'upcoming' ? 'prompt-segment--upcoming' : ''
      }`}
      data-segment-index={segmentIndex}
      data-voice-state={voiceState}
      data-word-progress={
        progress ? `${matchedWordCount}/${totalWordCount}` : undefined
      }
      ref={(element) => setSegmentElement(segmentIndex, element)}
      style={
        isDialogue ? { '--speaker-color': speakerColor ?? segment.color } : undefined
      }
    >
      <span>
        {isDialogue ? segment.speakerLabel : getPromptBlockLabel(segment)}
      </span>
      <p>
        {progress ? (
          <>
            {progress.spoken ? (
              <span className="prompt-word prompt-word--spoken">
                {progress.spoken}
              </span>
            ) : null}
            {progress.remaining ? (
              <span className="prompt-word prompt-word--remaining">
                {progress.remaining}
              </span>
            ) : null}
          </>
        ) : (
          segment.text
        )}
      </p>
    </article>
  )
}

export default memo(PromptSegment)
