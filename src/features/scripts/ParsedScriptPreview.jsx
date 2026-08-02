const blockLabels = {
  dialogue: 'Dialogue',
  direction: 'Direction',
  display: 'Display',
  metadata: 'File metadata',
  notice: 'Notice',
  pause: 'Pause',
  scene: 'Scene heading',
  section: 'Section',
  transition: 'Transition',
}

function labelFor(block) {
  if (block.type === 'direction' && block.subtype === 'audio') {
    return 'Audio cue'
  }

  if (block.type === 'direction' && block.subtype === 'visual') {
    return 'Visual cue'
  }

  if (block.type === 'direction' && block.subtype === 'parenthetical') {
    return 'Parenthetical'
  }

  if (block.type === 'direction' && block.subtype === 'display-cue') {
    return 'Display cue'
  }

  return blockLabels[block.type] ?? 'Block'
}

export default function ParsedScriptPreview({ blocks, speakerColors }) {
  if (!blocks.length) return null

  return (
    <section className="parsed-preview" aria-label="Parsed script preview">
      <div className="section-label parsed-preview__heading">
        <strong>Parsed preview</strong>
        <span>Detected structure</span>
      </div>
      <div className="segment-list">
        {blocks.map((block) => {
          const isDialogue = !block.type || block.type === 'dialogue'
          return (
            <article
              className={`parsed-block parsed-block--${block.type ?? 'dialogue'}`}
              data-block-type={block.type ?? 'dialogue'}
              key={block.id}
              style={
                isDialogue
                  ? {
                      '--speaker-color':
                        speakerColors[block.speakerId] ?? block.color,
                    }
                  : undefined
              }
            >
              <header>
                <span>{isDialogue ? block.speakerLabel : labelFor(block)}</span>
                {isDialogue ? <small>Dialogue</small> : null}
              </header>
              <p>{block.text}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
