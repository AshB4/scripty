import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createVoiceFollowMetrics,
  recordRecognitionEventMetric,
  recordRecognitionLifecycle,
  snapshotVoiceFollowMetrics,
} from '../voiceFollow/voiceFollowMetrics.js'

test('diagnostic event rate remains a bounded one-second window', () => {
  const metrics = createVoiceFollowMetrics()

  for (let index = 0; index < 200; index += 1) {
    recordRecognitionEventMetric(
      metrics,
      { resultKind: index % 2 ? 'interim' : 'final' },
      index * 20,
    )
  }

  const snapshot = snapshotVoiceFollowMetrics(metrics)
  assert.equal(snapshot.recognitionEventCount, 200)
  assert.ok(snapshot.eventRate <= 51)
  assert.equal(metrics.eventTimes.length, snapshot.eventRate)
})

test('recognition lifecycle reports one active instance and restarts', () => {
  const metrics = createVoiceFollowMetrics()

  recordRecognitionLifecycle(metrics, 'start')
  recordRecognitionLifecycle(metrics, 'end')
  recordRecognitionLifecycle(metrics, 'restart')
  recordRecognitionLifecycle(metrics, 'start')

  const snapshot = snapshotVoiceFollowMetrics(metrics)
  assert.equal(snapshot.activeRecognitionInstances, 1)
  assert.equal(snapshot.maxActiveRecognitionInstances, 1)
  assert.equal(snapshot.recognitionStartCount, 2)
  assert.equal(snapshot.recognitionEndCount, 1)
  assert.equal(snapshot.recognitionRestartCount, 1)
})
