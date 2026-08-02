export const LOST_RESULT_LIMIT = 4
export const MOVEMENT_COOLDOWN_MS = 800

export function resolveVoiceMatchState({
  currentIndex,
  lastMovement = null,
  lowConfidenceCount = 0,
  match,
  now = Date.now(),
  pendingMatch = { count: 0, index: null },
}) {
  const distance = match ? match.index - currentIndex : 0
  const isOutsideMovementWindow = distance < -1 || distance > 5

  if (!match?.isConfident || isOutsideMovementWindow) {
    const nextLowConfidenceCount = lowConfidenceCount + 1
    return {
      confirmationCount: 0,
      isCooldownBlocked: false,
      lowConfidenceCount: nextLowConfidenceCount,
      nextIndex: currentIndex,
      pendingMatch: { count: 0, index: null },
      shouldMove: false,
      status:
        nextLowConfidenceCount >= LOST_RESULT_LIMIT ? 'Lost' : 'Listening',
    }
  }

  if (match.index === currentIndex) {
    return {
      confirmationCount: 0,
      isCooldownBlocked: false,
      lowConfidenceCount: 0,
      nextIndex: currentIndex,
      pendingMatch: { count: 0, index: null },
      shouldMove: false,
      status: 'Following',
    }
  }

  const isCooldownBounce =
    lastMovement &&
    match.index === lastMovement.fromIndex &&
    now - lastMovement.at < MOVEMENT_COOLDOWN_MS

  if (isCooldownBounce) {
    return {
      confirmationCount: 0,
      isCooldownBlocked: true,
      lowConfidenceCount: 0,
      nextIndex: currentIndex,
      pendingMatch: { count: 0, index: null },
      shouldMove: false,
      status: 'Following',
    }
  }

  const confirmationCount =
    pendingMatch.index === match.index ? pendingMatch.count + 1 : 1
  const canMoveImmediately =
    distance < 0
      ? match.isExceptionalBackwardMatch
      : match.isImmediateMove || match.isVeryHighConfidence
  const isConfirmed = canMoveImmediately || confirmationCount >= 2

  if (!isConfirmed) {
    return {
      confirmationCount,
      isCooldownBlocked: false,
      lowConfidenceCount: 0,
      nextIndex: currentIndex,
      pendingMatch: { count: confirmationCount, index: match.index },
      shouldMove: false,
      status: 'Listening',
    }
  }

  return {
    confirmationCount,
    isCooldownBlocked: false,
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
