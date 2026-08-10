import {
  ROLLING_TRANSCRIPT_WORDS,
  toVoiceWords,
} from './voiceFollowMatcher.js'

export function createRecognitionSessionState() {
  return {
    finalWords: [],
    highestProcessedFinalResultIndex: -1,
    lastInterimSignature: '',
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
  let highestProcessedFinalResultIndex =
    sessionState.highestProcessedFinalResultIndex ?? -1
  const changedWords = []
  const eventFinalWords = []
  const interimWords = []
  const interimSignatures = []
  const evidenceCandidates = []
  const previousInterimSignatures = new Set(
    sessionState.lastInterimSignature
      ? sessionState.lastInterimSignature.split('|')
      : [],
  )
  const resultKinds = new Set()
  const firstChangedResult = Math.max(0, event.resultIndex ?? 0)
  let transcriptCharacterCount = 0

  for (
    let index = firstChangedResult;
    index < event.results.length;
    index += 1
  ) {
    const result = event.results[index]
    const transcript = result[0]?.transcript ?? ''
    const words = toVoiceWords(transcript)
    transcriptCharacterCount += transcript.length
    if (!words.length) continue

    if (result.isFinal) {
      resultKinds.add('final')
      if (index > highestProcessedFinalResultIndex) {
        highestProcessedFinalResultIndex = index
        finalWords.push(...words)
        eventFinalWords.push(...words)
        evidenceCandidates.push({
          isFinal: true,
          resultIndex: index,
          words: words.slice(-ROLLING_TRANSCRIPT_WORDS),
        })
      }
    } else {
      resultKinds.add('interim')
      interimWords.push(...words)
      interimSignatures.push(`${index}:${words.join(' ')}`)
      const signature = `${index}:${words.join(' ')}`
      evidenceCandidates.push({
        isFinal: false,
        resultIndex: index,
        signature,
        words: words.slice(-ROLLING_TRANSCRIPT_WORDS),
      })
    }
  }

  const interimSignature = interimSignatures.join('|')
  const orderedEvidence = evidenceCandidates.filter(
    (evidence) =>
      evidence.isFinal || !previousInterimSignatures.has(evidence.signature),
  ).map((evidence) => ({
    isFinal: evidence.isFinal,
    resultIndex: evidence.resultIndex,
    words: evidence.words,
  }))
  orderedEvidence.forEach((evidence) => changedWords.push(...evidence.words))
  const isDuplicateRevision = orderedEvidence.length === 0

  return {
    changedWords: changedWords.slice(-ROLLING_TRANSCRIPT_WORDS),
    eventFinalWords: eventFinalWords.slice(-ROLLING_TRANSCRIPT_WORDS),
    finalWordCount: Math.min(finalWords.length, ROLLING_TRANSCRIPT_WORDS),
    interimWords: interimWords.slice(-ROLLING_TRANSCRIPT_WORDS),
    isDuplicateRevision,
    orderedEvidence,
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
      highestProcessedFinalResultIndex,
      lastInterimSignature: interimSignature,
    },
    transcriptCharacterCount,
  }
}
