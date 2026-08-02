import {
  ROLLING_TRANSCRIPT_WORDS,
  toVoiceWords,
} from './voiceFollowMatcher.js'

export function createRecognitionSessionState() {
  return {
    finalWords: [],
    processedFinalResultIndexes: new Set(),
  }
}

export function clearRecognitionTranscript(sessionState) {
  return {
    ...sessionState,
    finalWords: [],
  }
}

export function processRecognitionEvent({ event, sessionState }) {
  const finalWords = [...sessionState.finalWords]
  const processedFinalResultIndexes = new Set(
    sessionState.processedFinalResultIndexes,
  )
  const changedWords = []
  const eventFinalWords = []
  const interimWords = []
  const resultKinds = new Set()
  const firstChangedResult = Math.max(0, event.resultIndex ?? 0)

  for (
    let index = firstChangedResult;
    index < event.results.length;
    index += 1
  ) {
    const result = event.results[index]
    const words = toVoiceWords(result[0]?.transcript)
    if (!words.length) continue

    if (result.isFinal) {
      resultKinds.add('final')
      if (!processedFinalResultIndexes.has(index)) {
        processedFinalResultIndexes.add(index)
        finalWords.push(...words)
        changedWords.push(...words)
        eventFinalWords.push(...words)
      }
    } else {
      resultKinds.add('interim')
      interimWords.push(...words)
      changedWords.push(...words)
    }
  }

  return {
    changedWords: changedWords.slice(-ROLLING_TRANSCRIPT_WORDS),
    eventFinalWords: eventFinalWords.slice(-ROLLING_TRANSCRIPT_WORDS),
    finalWordCount: Math.min(finalWords.length, ROLLING_TRANSCRIPT_WORDS),
    interimWords: interimWords.slice(-ROLLING_TRANSCRIPT_WORDS),
    receivedSpeech: changedWords.length > 0,
    resultKind: [...resultKinds].join('+'),
    rollingWords: [...finalWords, ...interimWords].slice(
      -ROLLING_TRANSCRIPT_WORDS,
    ),
    rollingWordCount: Math.min(
      finalWords.length + interimWords.length,
      ROLLING_TRANSCRIPT_WORDS,
    ),
    sessionState: {
      finalWords: finalWords.slice(-ROLLING_TRANSCRIPT_WORDS),
      processedFinalResultIndexes,
    },
  }
}
