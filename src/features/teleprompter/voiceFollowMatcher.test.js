import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createTrackableBlocks,
  findVoiceMatch,
  normalizeVoiceText,
} from './voiceFollowMatcher.js'

const blocks = createTrackableBlocks([
  { id: '1-host', speaker: 'HOST', text: 'Welcome to the Scripty studio.' },
  { id: '2-guest', speaker: 'GUEST', text: 'Thanks for having me here today.' },
  { id: '3-host', speaker: 'HOST', text: 'Let us skip ahead by one line.' },
  { id: '4-guest', speaker: 'GUEST', text: 'This is the fourth spoken block.' },
  { id: '5-host', speaker: 'HOST', text: 'The fifth block is still nearby.' },
  { id: '6-guest', speaker: 'GUEST', text: 'The sixth block is the farthest allowed.' },
  { id: '7-host', speaker: 'HOST', text: 'This block is too far away.' },
])

test('normalizes case, punctuation, apostrophes, and whitespace', () => {
  assert.equal(
    normalizeVoiceText("  We're LIVE -- right now!  "),
    'were live right now',
  )
})

test('matches dialogue without using speaker names', () => {
  assert.equal(blocks[0].words.includes('host'), false)

  const match = findVoiceMatch({
    blocks,
    currentIndex: 0,
    transcript: 'welcome to the scripty studio',
  })

  assert.equal(match.index, 0)
  assert.equal(match.isVeryHighConfidence, true)
})

test('excludes non-spoken parser blocks from Voice Follow tracking', () => {
  const trackable = createTrackableBlocks([
    { id: 'display', text: 'THE TITLE', type: 'display' },
    {
      id: 'dialogue',
      speaker: 'Narrator',
      text: 'This line is spoken.',
      type: 'dialogue',
    },
    { id: 'notice', text: 'Content notice: Example.', type: 'notice' },
    { id: 'cue', text: '[Pause.]', type: 'pause' },
  ])

  assert.deepEqual(trackable.map((block) => block.id), ['dialogue'])
})

test('allows one block backward for repeated dialogue', () => {
  const match = findVoiceMatch({
    blocks,
    currentIndex: 1,
    transcript: 'welcome to the scripty studio',
  })

  assert.equal(match.index, 0)
  assert.equal(match.isConfident, true)
})

test('matches skipped lines up to five blocks forward', () => {
  const match = findVoiceMatch({
    blocks,
    currentIndex: 0,
    transcript: 'sixth block is the farthest allowed',
  })

  assert.equal(match.index, 5)
  assert.equal(match.isConfident, true)
})

test('never searches farther than five blocks forward', () => {
  const match = findVoiceMatch({
    blocks,
    currentIndex: 0,
    transcript: 'this block is too far away',
  })

  assert.notEqual(match.index, 6)
  assert.equal(match.isConfident, false)
})

test('tolerates a small paraphrase without guessing on unrelated speech', () => {
  const paraphrase = findVoiceMatch({
    blocks,
    currentIndex: 1,
    transcript: 'let us jump ahead by one line',
  })
  const unrelated = findVoiceMatch({
    blocks,
    currentIndex: 1,
    transcript: 'weather forecast changes tomorrow morning',
  })

  assert.equal(paraphrase.index, 2)
  assert.equal(paraphrase.isConfident, true)
  assert.equal(unrelated.isConfident, false)
})
