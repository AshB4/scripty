import PromptSegment from './PromptSegment.jsx'

export default function TeleprompterScript({
  segments,
  voiceBlockIndexes,
  structuralPromptSegments,
  activeSegmentIndex,
  voiceFollow,
  setSegmentElement,
  normalizedSpeakerColors,
}) {
  return (
    <>
      {segments.length ? (
            segments.map((segment, segmentIndex) => {
              const voiceBlockIndex = voiceBlockIndexes.get(segmentIndex)
              const isDialogue = (segment.type ?? 'dialogue') === 'dialogue'
              let voiceState

              if (!isDialogue) return structuralPromptSegments[segmentIndex]

              if (segmentIndex === activeSegmentIndex) {
                voiceState = 'current'
              } else if (voiceBlockIndex < voiceFollow.currentBlockIndex) {
                voiceState = 'spoken'
              } else if (voiceBlockIndex > voiceFollow.currentBlockIndex) {
                voiceState = 'upcoming'
              }

              return (
                <PromptSegment
                  key={segment.id}
                  matchedWordCount={
                    voiceState === 'current' && voiceFollow.isEnabled
                      ? voiceFollow.matchedWordCount
                      : null
                  }
                  segment={segment}
                  segmentIndex={segmentIndex}
                  setSegmentElement={setSegmentElement}
                  speakerColor={normalizedSpeakerColors[segment.speakerId]}
                  totalWordCount={
                    voiceState === 'current' ? voiceFollow.totalWordCount : 0
                  }
                  voiceState={voiceState}
                />
              )
            })
          ) : (
            <article className="prompt-segment">
              <span>Scripty</span>
              <p>Add a script in the workspace before starting the read.</p>
            </article>
          )}
    </>
  )
}
