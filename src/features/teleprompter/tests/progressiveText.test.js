import assert from 'node:assert/strict'
import test from 'node:test'
import { splitDialogueProgress } from '../view/progressiveText.js'

test('splits progressive dialogue after the matched ordered prefix', () => {
  assert.deepEqual(splitDialogueProgress('Welcome to Scripty.', 1), {
    spoken: 'Welcome',
    remaining: ' to Scripty.',
  })
})

test('preserves punctuation and repeated word positions', () => {
  assert.deepEqual(splitDialogueProgress('Go, go when ready.', 2), {
    spoken: 'Go, go',
    remaining: ' when ready.',
  })
})

test('returns unchanged text when no words have matched', () => {
  assert.deepEqual(splitDialogueProgress('Wait for it.', 0), {
    spoken: '',
    remaining: 'Wait for it.',
  })
})

test('marks the full text when progress reaches the end', () => {
  assert.deepEqual(splitDialogueProgress('Ready - set - go!', 3), {
    spoken: 'Ready - set - go!',
    remaining: '',
  })
})

test('keeps long narration in two bounded text ranges', () => {
  const words = Array.from({ length: 600 }, (_, index) => `word${index + 1}`)
  const progress = splitDialogueProgress(words.join(' '), 300)

  assert.equal(progress.spoken.split(' ').length, 300)
  assert.equal(progress.remaining.trimStart().split(' ').length, 300)
  assert.equal(`${progress.spoken}${progress.remaining}`, words.join(' '))
})
