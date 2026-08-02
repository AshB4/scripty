import assert from 'node:assert/strict'
import test from 'node:test'
import { infernalCourtSample } from './fixtures/infernalCourtSample.js'
import {
  analyzeScript,
  countWords,
  getSpeakers,
  normalizeSpeaker,
  normalizeSpeakerColors,
  parseScript,
} from './scriptParser.js'

function blocksOfType(blocks, type) {
  return blocks.filter((block) => block.type === type)
}

test('normalizes equivalent speaker labels into one cast identity', () => {
  const blocks = parseScript(`Narrator:
First line.

NARRATOR:
Second line.

Narrator
Third line.`)
  const speakers = getSpeakers(blocks)

  assert.deepEqual(speakers.map(({ id, label }) => ({ id, label })), [
    { id: 'NARRATOR', label: 'Narrator' },
  ])
  assert.ok(
    blocksOfType(blocks, 'dialogue').every(
      (block) => block.speakerId === 'NARRATOR',
    ),
  )
  assert.deepEqual(normalizeSpeaker('  Narrator:  '), {
    id: 'NARRATOR',
    label: 'Narrator',
  })
})

test('merges saved color aliases and prefers a selected canonical color', () => {
  const speakers = getSpeakers(parseScript('NARRATOR: A spoken line.'))
  const colors = normalizeSpeakerColors(
    {
      Narrator: speakers[0].color,
      'NARRATOR:': '#22c55e',
    },
    speakers,
  )

  assert.deepEqual(colors, { NARRATOR: '#22c55e' })
  assert.deepEqual(
    normalizeSpeakerColors(
      {
        Narrator: '#f97316',
        NARRATOR: speakers[0].color,
      },
      speakers,
    ),
    { NARRATOR: '#f97316' },
  )
})

test('prevents title, section, and metadata lines from becoming speakers', () => {
  const blocks = parseScript(`THE INFERNAL COURT
EPISODE ONE: THEY DESERVED IT
FIELD EDITION
FILE: IC-CAPS-FR-8841-SML

BEST PRACTICE
NEVER WASTE A TRAGEDY

POST-ACTION REVIEW

NARRATOR:
The spoken record begins here.`)
  const speakerIds = getSpeakers(blocks).map((speaker) => speaker.id)

  assert.deepEqual(speakerIds, ['NARRATOR'])
  assert.equal(blocks.some((block) => block.type === 'metadata'), true)
  assert.equal(blocks.some((block) => block.type === 'section'), true)
  assert.equal(blocks.some((block) => block.type === 'display'), true)
})

test('parses explicit content notices separately from dialogue', () => {
  const blocks = parseScript(`Content Warning: Flashing images are discussed.

NARRATOR: This sentence is spoken.`)
  const notice = blocks.find((block) => block.type === 'notice')
  const dialogue = blocks.find((block) => block.type === 'dialogue')

  assert.equal(notice.text, 'Content Warning: Flashing images are discussed.')
  assert.equal(dialogue.text, 'This sentence is spoken.')
  assert.equal(dialogue.text.includes('Flashing images'), false)
})

test('keeps bracketed cues separate and assigns useful cue types', () => {
  const blocks = parseScript(`NARRATOR:
Before the cue.
[BLACK SCREEN]
After the visual.
[Pause.]
After the pause.
[ON SCREEN: CASE FILE RECOVERED]`)

  assert.deepEqual(
    blocks.map(({ subtype, text, type }) => ({ subtype, text, type })),
    [
      { subtype: undefined, text: 'Before the cue.', type: 'dialogue' },
      { subtype: 'visual', text: '[BLACK SCREEN]', type: 'direction' },
      { subtype: undefined, text: 'After the visual.', type: 'dialogue' },
      { subtype: 'pause', text: '[Pause.]', type: 'pause' },
      { subtype: undefined, text: 'After the pause.', type: 'dialogue' },
      {
        subtype: 'display-cue',
        text: '[ON SCREEN: CASE FILE RECOVERED]',
        type: 'display',
      },
    ],
  )
})

test('creates dialogue boundaries for cues and speaker changes', () => {
  const blocks = parseScript(`NARRATOR: Opening narration.
[Low music begins.]
Narration resumes.
EDITOR: A separate response.`)
  const dialogue = blocksOfType(blocks, 'dialogue')

  assert.deepEqual(
    dialogue.map(({ speakerId, text }) => ({ speakerId, text })),
    [
      { speakerId: 'NARRATOR', text: 'Opening narration.' },
      { speakerId: 'NARRATOR', text: 'Narration resumes.' },
      { speakerId: 'EDITOR', text: 'A separate response.' },
    ],
  )
  assert.equal(blocks[1].subtype, 'audio')
})

test('parses the Infernal Court regression fixture consistently', () => {
  const blocks = parseScript(infernalCourtSample)
  const speakers = getSpeakers(blocks)
  const analysis = analyzeScript(blocks)

  assert.deepEqual(speakers.map((speaker) => speaker.label), [
    'Narrator',
    'Editor',
  ])
  assert.equal(blocks[0].type, 'direction')
  assert.equal(blocks.some((block) => block.type === 'notice'), true)
  assert.equal(blocks.some((block) => block.type === 'pause'), true)
  assert.equal(blocks.some((block) => block.type === 'metadata'), true)
  assert.equal(
    blocks
      .filter((block) => block.type !== 'dialogue')
      .some((block) => block.speakerId),
    false,
  )
  assert.equal(analysis.scriptType, 'Documentary')
  assert.equal(analysis.confidence, 'High')
  assert.equal(analysis.speakerCount, speakers.length)
  assert.equal(analysis.dialogue, blocksOfType(blocks, 'dialogue').length)
  assert.equal(analysis.notice, blocksOfType(blocks, 'notice').length)
  assert.equal(analysis.wordCount, countWords(blocks))
})

test('recognizes a traditional screenplay sample', () => {
  const blocks = parseScript(`INT. CONTROL ROOM - NIGHT

ALICE
(whispering)
We should leave before dawn.

CUT TO:

EXT. COURTYARD - NIGHT

BOB: I agree.`)
  const analysis = analyzeScript(blocks)

  assert.equal(analysis.scriptType, 'Screenplay')
  assert.equal(analysis.confidence, 'High')
  assert.equal(analysis.scene, 2)
  assert.equal(analysis.transition, 1)
  assert.deepEqual(getSpeakers(blocks).map((speaker) => speaker.id), [
    'ALICE',
    'BOB',
  ])
})

test('recognizes podcast, stage play, and generic teleprompter samples', () => {
  const podcast = analyzeScript(
    parseScript('HOST: Welcome back.\n\nGUEST: Glad to be here.'),
  )
  const stagePlay = analyzeScript(
    parseScript(`MARA
We cannot stay.
[She crosses the room.]
JON
Then we leave together.`),
  )
  const genericBlocks = parseScript(
    'This is a direct-to-camera announcement for the audience.',
  )
  const generic = analyzeScript(genericBlocks)

  assert.equal(podcast.scriptType, 'Podcast')
  assert.equal(podcast.confidence, 'High')
  assert.equal(stagePlay.scriptType, 'Stage play')
  assert.equal(stagePlay.confidence, 'High')
  assert.equal(generic.scriptType, 'Generic Teleprompter')
  assert.equal(generic.confidence, 'Low')
  assert.deepEqual(getSpeakers(genericBlocks).map((speaker) => speaker.id), [
    'NARRATOR',
  ])
})

test('recognizes a structured presentation with high confidence', () => {
  const analysis = analyzeScript(
    parseScript(`[ON SCREEN: QUARTERLY UPDATE]
Welcome to the quarterly review.

[ON SCREEN: CUSTOMER GROWTH]
We will start with customer growth and retention.`),
  )

  assert.equal(analysis.scriptType, 'Presentation')
  assert.equal(analysis.confidence, 'High')
  assert.equal(analysis.documentType, null)
})

test('uses medium confidence for one partial production format match', () => {
  const analysis = analyzeScript(
    parseScript(`INT. STUDIO - DAY

The presenter introduces the topic.`),
  )

  assert.equal(analysis.scriptType, 'Screenplay')
  assert.equal(analysis.confidence, 'Medium')
})

test('uses the generic fallback when production signals are ambiguous', () => {
  const analysis = analyzeScript(
    parseScript(`[ON SCREEN: TOPIC]
HOST: Welcome to the discussion.
[Music begins.]
GUEST: Thank you for inviting me.`),
  )

  assert.equal(analysis.scriptType, 'Generic Teleprompter')
  assert.equal(analysis.confidence, 'Low')
})

test('uses Generic Teleprompter for an obvious resume', () => {
  const script = `Jordan Lee
jordan@example.com

PROFESSIONAL SUMMARY
Product designer with experience building accessible software.

WORK EXPERIENCE
Senior Product Designer at Northwind, 2021 to present.

EDUCATION
Bachelor of Design, State University.

SKILLS
Research, prototyping, and design systems.`
  const analysis = analyzeScript(parseScript(script), script)

  assert.equal(analysis.scriptType, 'Generic Teleprompter')
  assert.equal(analysis.confidence, 'Low')
  assert.equal(analysis.documentType, 'Resume')
  assert.equal(analysis.speakerCount, 1)
  assert.notEqual(analysis.scriptType, 'Podcast')
})

test('uses Generic Teleprompter for an obvious article', () => {
  const script = `How Cities Are Rethinking Public Space
By Morgan Lee
Published: July 18, 2026

Public spaces shape how residents move, meet, and participate in civic life.

The latest projects prioritize shade, accessibility, and flexible use.`
  const analysis = analyzeScript(parseScript(script), script)

  assert.equal(analysis.scriptType, 'Generic Teleprompter')
  assert.equal(analysis.confidence, 'Low')
  assert.equal(analysis.documentType, 'Article')
  assert.equal(analysis.speakerCount, 1)
})

test('uses Generic Teleprompter for an obvious book excerpt', () => {
  const script = `THE LONG ROAD HOME
Copyright 2026 Morgan Lee

CHAPTER ONE
The station was empty when the last train arrived.

EPILOGUE
Years later, the platform still appeared in her dreams.`
  const analysis = analyzeScript(parseScript(script), script)

  assert.equal(analysis.scriptType, 'Generic Teleprompter')
  assert.equal(analysis.confidence, 'Low')
  assert.equal(analysis.documentType, 'Book')
  assert.equal(analysis.speakerCount, 1)
  assert.notEqual(analysis.scriptType, 'Documentary')
})

test('uses Generic Teleprompter for an obvious research paper', () => {
  const script = `ABSTRACT
This study examines reading behavior across display sizes.

METHODS
Participants completed controlled reading tasks.

RESULTS
Larger line spacing improved completion time.

REFERENCES
Lee, M. 2025. Display Reading Patterns.`
  const analysis = analyzeScript(parseScript(script), script)

  assert.equal(analysis.scriptType, 'Generic Teleprompter')
  assert.equal(analysis.confidence, 'Low')
  assert.equal(analysis.documentType, 'Research paper')
  assert.equal(analysis.speakerCount, 1)
})

test('uses Generic Teleprompter for obvious meeting notes', () => {
  const script = `Weekly Planning Meeting Notes
Attendees: Jordan, Morgan, and Casey
Agenda: Review the launch schedule
Decisions: Move the rehearsal to Thursday
Action Items: Morgan will update the production checklist`
  const analysis = analyzeScript(parseScript(script), script)

  assert.equal(analysis.scriptType, 'Generic Teleprompter')
  assert.equal(analysis.confidence, 'Low')
  assert.equal(analysis.documentType, 'Meeting notes')
  assert.equal(analysis.speakerCount, 1)
  assert.notEqual(analysis.scriptType, 'Stage play')
})
