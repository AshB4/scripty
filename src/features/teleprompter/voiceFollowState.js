export const LOST_RESULT_LIMIT = 4

export function resolveVoiceMatchState({
  currentIndex,
  lowConfidenceCount = 0,
  match,
  pendingMatch = { count: 0, index: null },
}) {
  if (!match?.isConfident) {
    const nextLowConfidenceCount = lowConfidenceCount + 1
    return {
      lowConfidenceCount: nextLowConfidenceCount,
      nextIndex: currentIndex,
      pendingMatch: { count: 0, index: null },
      shouldMove: false,
      status:
        nextLowConfidenceCount >= LOST_RESULT_LIMIT ? 'Lost' : 'Listening',
    }
  }

  const confirmationCount =
    pendingMatch.index === match.index ? pendingMatch.count + 1 : 1
  const isConfirmed = match.isVeryHighConfidence || confirmationCount >= 2

  if (!isConfirmed) {
    return {
      lowConfidenceCount: 0,
      nextIndex: currentIndex,
      pendingMatch: { count: confirmationCount, index: match.index },
      shouldMove: false,
      status: 'Listening',
    }
  }

  return {
    lowConfidenceCount: 0,
    nextIndex: match.index,
    pendingMatch: { count: 0, index: null },
    shouldMove: match.index !== currentIndex,
    status: 'Following',
  }
}

export function getRecognitionErrorState(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return {
      disable: true,
      message:
        'Microphone permission was denied. Manual teleprompter controls are still available.',
      retry: false,
      status: 'Permission denied',
    }
  }

  if (error === 'audio-capture') {
    return {
      disable: true,
      message:
        'No microphone is available. Manual teleprompter controls are still available.',
      retry: false,
      status: 'Lost',
    }
  }

  if (error === 'no-speech' || error === 'aborted') {
    return {
      disable: false,
      message: '',
      retry: false,
      status: 'Waiting',
    }
  }

  return {
    disable: false,
    message:
      'Speech recognition was interrupted. Voice Follow will retry automatically.',
    retry: true,
    status: 'Lost',
  }
}

export function canScheduleRecognitionRestart({
  hasRecognition,
  isEnabled,
  isRestartScheduled,
}) {
  return isEnabled && !hasRecognition && !isRestartScheduled
}
