import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  SCRIPT_GUIDE_STATUSES,
  SCRIPT_GUIDE_TERMS,
  SCRIPT_GUIDE_INLINE_CUES,
  SCRIPT_GUIDE_PARAGRAPH_BLOCK_EXAMPLES,
  SCRIPT_GUIDE_RECORDING_EXAMPLE,
  SCRIPT_GUIDE_REMINDER_EXAMPLES,
  SCRIPT_GUIDE_WORKFLOW,
  getScriptGuideReturnLabel,
  getScriptGuideReturnPath,
} from './scriptGuideContent.js'

const publicTypes = [
  'SPOKEN',
  'PRODUCTION_CUE',
  'B_ROLL',
  'IMAGE_GRAPHIC',
  'SCREEN_RECORDING',
  'AI_VIDEO',
  'CAMERA_CUT',
  'PROP',
  'CREATOR_REMINDER',
]

test('Script Guide exposes every public Prepare classification but not UNKNOWN', () => {
  assert.deepEqual(
    SCRIPT_GUIDE_TERMS.map((term) => term.type),
    publicTypes,
  )
  assert.equal(SCRIPT_GUIDE_TERMS.some((term) => term.type === 'UNKNOWN'), false)
})

test('Script Guide explains all creator-facing Prepare statuses', () => {
  assert.deepEqual(
    SCRIPT_GUIDE_STATUSES.map((status) => status.label),
    ['Confirmed', 'Tentative', 'Needs clarification'],
  )
  assert.ok(SCRIPT_GUIDE_STATUSES.every((status) => status.description.length > 0))
})

test('Script Guide documents only currently implemented workflow sections', () => {
  assert.deepEqual(
    SCRIPT_GUIDE_WORKFLOW.map((step) => step.label),
    [
      'Script Workspace',
      'Prepare for Recording',
      'Review Preparation',
      'Teleprompter',
      'Recording Progress',
    ],
  )
  const labels = SCRIPT_GUIDE_WORKFLOW.map((step) => step.label).join(' ')
  assert.doesNotMatch(labels, /Pickups|What's Left/)
})

test('Script Guide explains reminder placement and inline production cues', async () => {
  const page = await readFile(
    new URL('./ScriptGuidePage.jsx', import.meta.url),
    'utf8',
  )

  assert.deepEqual(SCRIPT_GUIDE_REMINDER_EXAMPLES, [
    'get coffee mug before this part',
    'check lighting before take',
    'remember to mention sponsor',
  ])
  assert.deepEqual(SCRIPT_GUIDE_INLINE_CUES, [
    'B-Roll',
    'Image / Graphic',
    'Screen Recording',
    'AI Video',
    'Camera Cut',
    'Production Cue',
    'Prop',
  ])
  assert.match(page, /How production notes appear while recording/)
  assert.match(page, /not treated as spoken takes/)
  assert.match(page, /Production cues stay where they belong/)
  assert.match(SCRIPT_GUIDE_RECORDING_EXAMPLE, /\[IMAGE \/ GRAPHIC\]/)
  assert.match(SCRIPT_GUIDE_RECORDING_EXAMPLE, /\[B-ROLL\]/)
  assert.doesNotMatch(page, /finalized metadata|segment filtering|localStorage/)
})

test('Script Guide reassures creators about supported script styles', async () => {
  const page = await readFile(
    new URL('./ScriptGuidePage.jsx', import.meta.url),
    'utf8',
  )

  assert.match(page, /Works with different script styles/)
  assert.match(page, /screenplays/)
  assert.match(page, /stage plays/)
  assert.match(page, /podcasts/)
  assert.match(page, /training scripts/)
  assert.match(page, /presentations/)
  assert.match(page, /special Scripty format/)
})

test('Script Guide documents paragraph and blank-line text block behavior', async () => {
  const page = await readFile(
    new URL('./ScriptGuidePage.jsx', import.meta.url),
    'utf8',
  )

  assert.match(page, /Paragraphs and text blocks/)
  assert.match(page, /each paragraph as a separate spoken text block/)
  assert.match(page, /blank line starts a new block/)
  assert.match(page, /same paragraph/)
  assert.match(page, /Punctuation does not create separate blocks/)
  assert.match(page, /Periods can separate\s+sentences/)
  assert.match(SCRIPT_GUIDE_PARAGRAPH_BLOCK_EXAMPLES.oneBlock, /without a paragraph break/)
  assert.match(SCRIPT_GUIDE_PARAGRAPH_BLOCK_EXAMPLES.twoBlocks, /\n\nThis paragraph begins/)
})

test('Script Guide explains current Recording Progress take controls', async () => {
  const page = await readFile(
    new URL('./ScriptGuidePage.jsx', import.meta.url),
    'utf8',
  )

  assert.match(page, /Recording takes/)
  assert.match(page, /Select the section you want to record/)
  assert.match(page, /Start Take/)
  assert.match(page, /highlighted card in Recording Progress/)
  assert.match(page, /Good Take/)
  assert.match(page, /Redo/)
  assert.match(page, /pickups/)
  assert.match(page, /Resume Recording starts at the next unfinished section/)
  assert.match(page, /Redo sections before Not Recorded sections/)
  assert.doesNotMatch(page, /Good Take applies to the completed sections/)
  assert.doesNotMatch(page, /tracks the sections you complete/)
})

test('Script Guide makes finalize and source-integrity copy explicit', async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL('./ScriptGuidePage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../styles/index.css', import.meta.url), 'utf8'),
  ])
  const clarification = SCRIPT_GUIDE_STATUSES.find(
    (status) => status.label === 'Needs clarification',
  )

  assert.match(
    clarification.description,
    /must be resolved or ignored before you can finalize preparation/,
  )
  assert.match(
    page,
    /<strong>Your script text is never changed\.<\/strong>[\s\S]*?<p>[\s\S]*?Scripty creates separate production metadata/,
  )
  assert.match(styles, /\.script-guide__source-note \{[\s\S]*?gap: 10px;/)
})

test('Prepare renders a secondary Script Guide route without invoking its workflow', async () => {
  const panel = await readFile(
    new URL('../prepare/PrepareForRecordingPanel.jsx', import.meta.url),
    'utf8',
  )

  assert.match(panel, /className="prepare-card__guide-link"/)
  assert.match(panel, /to="\/scripts\/guide"/)
  assert.doesNotMatch(panel, /Script Guide[\s\S]{0,80}onClick=/)
})

test('router and guide provide navigation in both directions', async () => {
  const [router, page] = await Promise.all([
    readFile(new URL('../../../app/router.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./ScriptGuidePage.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(router, /path: '\/scripts\/guide'/)
  assert.match(page, /getScriptGuideReturnLabel/)
  assert.match(page, /getScriptGuideReturnPath/)
})

test('guide returns to the route it was opened from', () => {
  assert.equal(getScriptGuideReturnPath('?from=home'), '/')
  assert.equal(getScriptGuideReturnLabel('?from=home'), 'Back to Home')
  assert.equal(getScriptGuideReturnPath('?from=review'), '/scripts/review')
  assert.equal(
    getScriptGuideReturnLabel('?from=review'),
    'Back to Review Preparation',
  )
  assert.equal(getScriptGuideReturnPath('?from=teleprompter'), '/teleprompter')
  assert.equal(
    getScriptGuideReturnLabel('?from=teleprompter'),
    'Back to Teleprompter',
  )
  assert.equal(getScriptGuideReturnPath(''), '/scripts')
  assert.equal(getScriptGuideReturnLabel(''), 'Back to Prepare')
  assert.equal(getScriptGuideReturnPath('?from=anything-else'), '/scripts')
})

test('homepage exposes Script Guide without replacing the primary launch action', async () => {
  const hero = await readFile(
    new URL('../../landing/Hero.jsx', import.meta.url),
    'utf8',
  )

  assert.match(hero, /to="\/scripts"/)
  assert.match(hero, /Launch Scripty/)
  assert.match(hero, /to="\/scripts\/guide\?from=home"/)
  assert.match(hero, />\s*Script Guide\s*<\/Link>/)
})

test('Script Workspace exposes the existing Script Guide route', async () => {
  const workspace = await readFile(
    new URL('../ScriptWorkspace.jsx', import.meta.url),
    'utf8',
  )

  assert.match(workspace, /to="\/scripts\/guide"/)
  assert.match(workspace, />\s*Script Guide\s*<\/Link>/)
})

test('Teleprompter exposes Script Guide without using a recording action', async () => {
  const teleprompter = await readFile(
    new URL('../../teleprompter/view/TeleprompterView.jsx', import.meta.url),
    'utf8',
  )

  assert.match(teleprompter, /to="\/scripts\/guide\?from=teleprompter"/)
  assert.match(teleprompter, /target="_blank"/)
  assert.match(teleprompter, /rel="noreferrer"/)
  assert.match(teleprompter, /teleprompter__guide-link/)
  assert.doesNotMatch(teleprompter, /Script Guide[\s\S]{0,100}onClick=/)
})
