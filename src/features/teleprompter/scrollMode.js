export const SCROLL_MODES = {
  TIMED: 'timed',
  VOICE: 'voice',
}

export function canStartTimedScroll(mode, isVoiceEnabled) {
  return mode === SCROLL_MODES.TIMED && !isVoiceEnabled
}

export function getModeControlEffects({
  currentMode,
  isVoiceEnabled,
  nextMode,
}) {
  if (nextMode === SCROLL_MODES.VOICE) {
    const isActiveVoiceControl = currentMode === SCROLL_MODES.VOICE

    return {
      nextMode,
      startVoice: !isActiveVoiceControl || !isVoiceEnabled,
      stopTimed: !isActiveVoiceControl,
      stopVoice: isActiveVoiceControl && isVoiceEnabled,
    }
  }

  return {
    nextMode,
    startVoice: false,
    stopTimed: currentMode !== SCROLL_MODES.TIMED,
    stopVoice: currentMode === SCROLL_MODES.VOICE && isVoiceEnabled,
  }
}

export function getPrimaryControlState({
  isTimedPlaying,
  isVoiceEnabled,
  mode,
}) {
  if (mode === SCROLL_MODES.VOICE) {
    return {
      action: 'voice',
      isActive: isVoiceEnabled,
      label: isVoiceEnabled ? 'Stop Listening' : 'Start Listening',
    }
  }

  return {
    action: 'timed',
    isActive: isTimedPlaying,
    label: isTimedPlaying ? 'Pause Timed Scroll' : 'Start Timed Scroll',
  }
}
