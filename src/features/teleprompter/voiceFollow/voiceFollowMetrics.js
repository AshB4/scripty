export function createVoiceFollowMetrics() {
  return {
    activeBlockChanges: 0,
    activeRecognitionInstances: 0,
    duplicateRevisionCount: 0,
    eventTimes: [],
    finalEventCount: 0,
    interimEventCount: 0,
    longestEventProcessingMs: 0,
    longestLongTaskMs: 0,
    longestMatcherMs: 0,
    maxActiveRecognitionInstances: 0,
    maxTranscriptCharacters: 0,
    recognitionEndCount: 0,
    recognitionEventCount: 0,
    recognitionRestartCount: 0,
    recognitionStartCount: 0,
    scrollRequestCount: 0,
    stateUpdateCount: 0,
  }
}

export function recordRecognitionEventMetric(
  metrics,
  {
    eventProcessingMs = 0,
    isDuplicateRevision = false,
    matcherMs = 0,
    resultKind = '',
    transcriptCharacterCount = 0,
  },
  now = performance.now(),
) {
  metrics.recognitionEventCount += 1
  if (resultKind.includes('interim')) metrics.interimEventCount += 1
  if (resultKind.includes('final')) metrics.finalEventCount += 1
  if (isDuplicateRevision) metrics.duplicateRevisionCount += 1
  metrics.maxTranscriptCharacters = Math.max(
    metrics.maxTranscriptCharacters,
    transcriptCharacterCount,
  )
  metrics.longestEventProcessingMs = Math.max(
    metrics.longestEventProcessingMs,
    eventProcessingMs,
  )
  metrics.longestMatcherMs = Math.max(metrics.longestMatcherMs, matcherMs)
  metrics.eventTimes.push(now)

  const cutoff = now - 1000
  while (metrics.eventTimes[0] < cutoff) metrics.eventTimes.shift()
}

export function recordRecognitionLifecycle(metrics, event) {
  if (event === 'start') {
    metrics.recognitionStartCount += 1
    metrics.activeRecognitionInstances += 1
    metrics.maxActiveRecognitionInstances = Math.max(
      metrics.maxActiveRecognitionInstances,
      metrics.activeRecognitionInstances,
    )
  } else if (event === 'end') {
    metrics.recognitionEndCount += 1
    metrics.activeRecognitionInstances = Math.max(
      0,
      metrics.activeRecognitionInstances - 1,
    )
  } else if (event === 'restart') {
    metrics.recognitionRestartCount += 1
  }
}

export function recordLongTask(metrics, duration) {
  metrics.longestLongTaskMs = Math.max(metrics.longestLongTaskMs, duration)
}

export function snapshotVoiceFollowMetrics(metrics) {
  return {
    activeBlockChanges: metrics.activeBlockChanges,
    activeRecognitionInstances: metrics.activeRecognitionInstances,
    duplicateRevisionCount: metrics.duplicateRevisionCount,
    eventRate: metrics.eventTimes.length,
    finalEventCount: metrics.finalEventCount,
    interimEventCount: metrics.interimEventCount,
    longestEventProcessingMs: Number(
      metrics.longestEventProcessingMs.toFixed(2),
    ),
    longestLongTaskMs: Number(metrics.longestLongTaskMs.toFixed(2)),
    longestMatcherMs: Number(metrics.longestMatcherMs.toFixed(2)),
    maxActiveRecognitionInstances: metrics.maxActiveRecognitionInstances,
    maxTranscriptCharacters: metrics.maxTranscriptCharacters,
    recognitionEndCount: metrics.recognitionEndCount,
    recognitionEventCount: metrics.recognitionEventCount,
    recognitionRestartCount: metrics.recognitionRestartCount,
    recognitionStartCount: metrics.recognitionStartCount,
    scrollRequestCount: metrics.scrollRequestCount,
    stateUpdateCount: metrics.stateUpdateCount,
  }
}
