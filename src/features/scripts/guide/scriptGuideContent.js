export function getScriptGuideReturnPath(search) {
  return new URLSearchParams(search).get('from') === 'review'
    ? '/scripts/review'
    : '/scripts'
}

export function getScriptGuideReturnLabel(search) {
  return new URLSearchParams(search).get('from') === 'review'
    ? 'Back to Review Preparation'
    : 'Back to Prepare'
}

export const SCRIPT_GUIDE_TERMS = Object.freeze([
  {
    type: 'SPOKEN',
    label: 'Spoken',
    description: 'Dialogue, narration, or anything intended to be spoken aloud.',
  },
  {
    type: 'PRODUCTION_CUE',
    label: 'Production Cue',
    description: 'An instruction for what should happen during recording or editing.',
  },
  {
    type: 'B_ROLL',
    label: 'B-Roll',
    description: 'Supporting footage shown over or alongside the main recording.',
  },
  {
    type: 'IMAGE_GRAPHIC',
    label: 'Image / Graphic',
    description: 'Screenshots, photos, charts, graphics, or overlays.',
  },
  {
    type: 'SCREEN_RECORDING',
    label: 'Screen Recording',
    description: 'Footage captured from a computer or device screen.',
  },
  {
    type: 'AI_VIDEO',
    label: 'AI Video',
    description: 'Footage the creator intends to generate with an AI video tool.',
  },
  {
    type: 'CAMERA_CUT',
    label: 'Camera Cut',
    description: 'Switching camera, angle, speaker, or shot.',
  },
  {
    type: 'PROP',
    label: 'Prop',
    description: 'A physical item needed during the recording.',
  },
  {
    type: 'CREATOR_REMINDER',
    label: 'Creator Reminder',
    description: 'A note to yourself that is not intended to be spoken.',
  },
])

export const SCRIPT_GUIDE_STATUSES = Object.freeze([
  {
    label: 'Confirmed',
    description:
      'Scripty understands the item and you definitely want it.',
  },
  {
    label: 'Tentative',
    description:
      'Scripty understands what the item is, but you may or may not want it.',
  },
  {
    label: 'Needs clarification',
    description:
      'Scripty could not confidently determine what the item means. Needs clarification items must be resolved or ignored before you can finalize preparation.',
  },
])

export const SCRIPT_GUIDE_WORKFLOW = Object.freeze([
  {
    label: 'Script Workspace',
    shortLabel: 'Script',
    description:
      'Import or paste the script you want to record, then choose its reading settings.',
  },
  {
    label: 'Prepare for Recording',
    shortLabel: 'Prepare',
    description:
      'Scripty reads your existing script and identifies spoken lines, production needs, reminders, and anything unclear. It does not rewrite your original script.',
  },
  {
    label: 'Review Preparation',
    shortLabel: 'Review',
    description:
      'Correct classifications, change Confirmed or Tentative status, resolve unclear items, ignore items, and finalize your preparation.',
  },
  {
    label: 'Teleprompter',
    shortLabel: 'Teleprompter',
    description:
      "Perform your script with Scripty's timed scrolling, manual controls, or Voice Follow.",
  },
  {
    label: 'Recording Progress',
    shortLabel: 'Track',
    description:
      'Track Not Recorded, Redo, and Good sections, manage takes, add optional notes, and resume at the next unfinished section.',
  },
])

export const SCRIPT_GUIDE_REMINDER_EXAMPLES = Object.freeze([
  'get coffee mug before this part',
  'check lighting before take',
  'remember to mention sponsor',
])

export const SCRIPT_GUIDE_INLINE_CUES = Object.freeze([
  'B-Roll',
  'Image / Graphic',
  'Screen Recording',
  'AI Video',
  'Camera Cut',
  'Production Cue',
  'Prop',
])

export const SCRIPT_GUIDE_RECORDING_EXAMPLE = `ASH: Look at what happened after we changed the setting.

[IMAGE / GRAPHIC]
show screenshot of the dashboard here

[B-ROLL]
typing on laptop

ASH: The results changed immediately.`

export const SCRIPT_GUIDE_EXAMPLE = `ASH: Okay, this is where things get weird.

[cut to robot]

ROBOT: You say that every episode.

show screenshot of the dashboard here

maybe zoom in on the numbers???

[B ROLL - typing on laptop]

ASH: But look at what happened after we changed the setting.`
