import assert from 'node:assert/strict'
import test from 'node:test'
import { countWords, getSpeakers, parseScript } from './scriptParser.js'

test('parses uppercase names followed by dialogue', () => {
  const segments = parseScript(`HOST\nWelcome to the show.\n\nGUEST\nThanks for having me.`)

  assert.deepEqual(
    segments.map(({ speaker, text }) => ({ speaker, text })),
    [
      { speaker: 'HOST', text: 'Welcome to the show.' },
      { speaker: 'GUEST', text: 'Thanks for having me.' },
    ],
  )
})

test('parses colon speakers with same-line or following dialogue', () => {
  const segments = parseScript(`HOST: Welcome back.\n\nGUEST:\nGood to be here.`)

  assert.equal(segments[0].speaker, 'HOST')
  assert.equal(segments[0].text, 'Welcome back.')
  assert.equal(segments[1].speaker, 'GUEST')
  assert.equal(segments[1].text, 'Good to be here.')
})

test('assigns speakers stable defaults and counts dialogue words', () => {
  const segments = parseScript('HOST: One two.\nGUEST: Three four five.')
  const speakers = getSpeakers(segments)

  assert.equal(countWords(segments), 5)
  assert.equal(speakers.length, 2)
  assert.match(speakers[0].color, /^#[0-9A-F]{6}$/)
  assert.notEqual(speakers[0].color, speakers[1].color)
})
