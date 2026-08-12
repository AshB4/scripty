import assert from 'node:assert/strict'
import test from 'node:test'

import { isEditableShortcutTarget } from './useKeyboardControls.js'

test('keyboard shortcuts ignore standard editable text-entry controls', () => {
  const editableTargets = [
    { matches: (selector) => selector.includes('input') },
    { matches: (selector) => selector.includes('textarea') },
    { matches: (selector) => selector.includes('select') },
    { closest: (selector) => selector.includes('contenteditable') },
    { isContentEditable: true },
    { contentEditable: 'plaintext-only' },
  ]

  editableTargets.forEach((target) => {
    assert.equal(isEditableShortcutTarget(target), true)
  })
})

test('keyboard shortcuts still apply to non-editable controls', () => {
  const target = {
    closest: () => null,
    matches: () => false,
    isContentEditable: false,
    contentEditable: 'inherit',
  }

  assert.equal(isEditableShortcutTarget(target), false)
})
