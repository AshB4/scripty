export const SCROLL_MODES = {
  TIMED: 'timed',
  VOICE: 'voice',
}

export function canStartTimedScroll(mode, isVoiceEnabled) {
  return mode === SCROLL_MODES.TIMED && !isVoiceEnabled
}

export function getModeSwitchEffects(nextMode) {
  return {
    nextMode,
    startVoice: nextMode === SCROLL_MODES.VOICE,
    stopTimed: true,
    stopVoice: nextMode === SCROLL_MODES.TIMED,
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
