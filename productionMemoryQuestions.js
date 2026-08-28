export const PRODUCTION_MEMORY_QUESTIONS = Object.freeze([
  Object.freeze({
    id: 'whats-left',
    label: 'What do I still need to finish?',
  }),
  Object.freeze({
    id: 'another-take',
    label: 'What needs another take?',
  }),
  Object.freeze({
    id: 'missing-assets',
    label: 'Which production assets are still missing?',
  }),
  Object.freeze({
    id: 'resume',
    label: 'Where should I resume?',
  }),
])

export const WHATS_LEFT_QUESTION = PRODUCTION_MEMORY_QUESTIONS[0].label

export function isProductionMemoryQuestion(question) {
  return PRODUCTION_MEMORY_QUESTIONS.some((item) => item.label === question)
}
