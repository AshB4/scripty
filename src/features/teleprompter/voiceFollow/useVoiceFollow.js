/** @format */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	findVoiceMatch,
	getOrderedPrefixProgress,
	ROLLING_TRANSCRIPT_WORDS,
} from "../voiceFollow/voiceFollowMatcher.js";
import {
	canScheduleRecognitionRestart,
	getRecognitionErrorState,
	resolveVoiceMatchState,
} from "./voiceFollowState.js";
import {
	createCleanBlockTrackingState,
	EMPTY_PENDING_MATCH,
	isBlockProgressComplete,
	resolveIdenticalBlockOccurrence,
} from "./voiceFollowTracking.js";
import {
	getDiagnosticTime,
	logVoiceFollowDiagnostic,
	voiceFollowDiagnosticsEnabled,
} from "./voiceFollowDiagnostics.js";
import {
	createVoiceFollowMetrics,
	recordLongTask,
	recordRecognitionEventMetric,
	recordRecognitionLifecycle,
	snapshotVoiceFollowMetrics,
} from "./voiceFollowMetrics.js";
import {
	clearRecognitionTranscript,
	createRecognitionSessionState,
	processRecognitionEvent,
} from "./voiceRecognitionResults.js";

const WAITING_DELAY = 1500;
const RESTART_DELAY = 250;
const UNSUPPORTED_MESSAGE =
	"Voice Follow is unavailable in this browser. Use current Chrome for the best experience.";

function getRecognitionConstructor() {
	if (typeof window === "undefined") return null;
	return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useVoiceFollow({ blocks, onPositionChange }) {
	const isSupported = Boolean(getRecognitionConstructor());
	const initialStatus = isSupported ? "Off" : "Unsupported";
	const [isEnabled, setIsEnabled] = useState(false);
	const [status, setStatus] = useState(initialStatus);
	const [message, setMessage] = useState(
		isSupported ? "" : UNSUPPORTED_MESSAGE,
	);
	const [currentBlockIndex, setCurrentBlockIndexState] = useState(0);
	const [matchedWordCount, setMatchedWordCount] = useState(0);
	const [wordProgressTiming, setWordProgressTiming] = useState(null);
	const diagnosticsEnabled = voiceFollowDiagnosticsEnabled();
	const metricsRef = useRef(createVoiceFollowMetrics());
	const [diagnosticsSnapshot, setDiagnosticsSnapshot] = useState(() => ({
		events: [],
		summary: snapshotVoiceFollowMetrics(createVoiceFollowMetrics()),
	}));
	const blocksRef = useRef(blocks);
	const currentBlockIndexRef = useRef(0);
	const completedOccurrenceRef = useRef(null);
	const enabledRef = useRef(false);
	const diagnosticEventsRef = useRef([]);
	const diagnosticRefreshTimerRef = useRef(null);
	const eventNumberRef = useRef(0);
	const recognitionRef = useRef(null);
	const recognitionSessionRef = useRef(createRecognitionSessionState());
	const restartTimerRef = useRef(null);
	const recognitionSessionIdRef = useRef(0);
	const waitingTimerRef = useRef(null);
	const pendingMatchRef = useRef({ ...EMPTY_PENDING_MATCH });
	const lowConfidenceCountRef = useRef(0);
	const lastSpeechAtRef = useRef(null);
	const lastMovementRef = useRef(null);
	const matchedWordCountRef = useRef(0);
	const onPositionChangeRef = useRef(onPositionChange);
	const progressBlockIndexRef = useRef(0);
	const startRecognitionRef = useRef(null);
	const statusRef = useRef(initialStatus);
	const wordProgressTimingRef = useRef(null);

	const scheduleDiagnosticRefresh = useCallback(() => {
		if (!diagnosticsEnabled || diagnosticRefreshTimerRef.current) return;

		diagnosticRefreshTimerRef.current = window.setTimeout(() => {
			diagnosticRefreshTimerRef.current = null;
			setDiagnosticsSnapshot({
				events: [...diagnosticEventsRef.current],
				summary: snapshotVoiceFollowMetrics(metricsRef.current),
			});
		}, 250);
	}, [diagnosticsEnabled]);

	const updateStatus = useCallback(
		(nextStatus, context = {}) => {
			if (statusRef.current === nextStatus) return false;

			logVoiceFollowDiagnostic("status-change", {
				from: statusRef.current,
				time: Number(getDiagnosticTime().toFixed(2)),
				to: nextStatus,
				...context,
			});
			statusRef.current = nextStatus;
			metricsRef.current.stateUpdateCount += 1;
			setStatus(nextStatus);
			scheduleDiagnosticRefresh();
			return true;
		},
		[scheduleDiagnosticRefresh],
	);

	const recordDiagnosticEvent = useCallback(
		(event) => {
			if (!diagnosticsEnabled) return;
			diagnosticEventsRef.current = [
				...diagnosticEventsRef.current.slice(-19),
				event,
			];
			scheduleDiagnosticRefresh();
		},
		[diagnosticsEnabled, scheduleDiagnosticRefresh],
	);

	const resetWordProgress = useCallback(
		(
			blockIndex = currentBlockIndexRef.current,
			{ clearRecognitionBuffer = true } = {},
		) => {
			progressBlockIndexRef.current = blockIndex;
			if (matchedWordCountRef.current !== 0) {
				matchedWordCountRef.current = 0;
				metricsRef.current.stateUpdateCount += 1;
				setMatchedWordCount(0);
			}
			if (wordProgressTimingRef.current !== null) {
				wordProgressTimingRef.current = null;
				setWordProgressTiming(null);
			}
			if (clearRecognitionBuffer) {
				recognitionSessionRef.current = clearRecognitionTranscript(
					recognitionSessionRef.current,
				);
			}
		},
		[],
	);

	const resetBlockTracking = useCallback(
		(
			blockIndex = currentBlockIndexRef.current,
			{ eventWords = [], nextBlockWords = [] } = {},
		) => {
			const cleanState = createCleanBlockTrackingState({
				eventWords,
				nextBlockWords,
			});
			pendingMatchRef.current = cleanState.pendingMatch;
			lowConfidenceCountRef.current = cleanState.lowConfidenceCount;
			completedOccurrenceRef.current = null;
			resetWordProgress(blockIndex);
			return cleanState;
		},
		[resetWordProgress],
	);

	useEffect(() => {
		blocksRef.current = blocks;
		const safeIndex = Math.min(
			Math.max(0, blocks.length - 1),
			currentBlockIndexRef.current,
		);
		currentBlockIndexRef.current = safeIndex;
		lastMovementRef.current = null;
		setCurrentBlockIndexState(safeIndex);
		resetBlockTracking(safeIndex);
	}, [blocks, resetBlockTracking]);

	useEffect(() => {
		onPositionChangeRef.current = onPositionChange;
	}, [onPositionChange]);

	const setCurrentBlockIndex = useCallback(
		(nextIndex) => {
			const lastIndex = Math.max(0, blocksRef.current.length - 1);
			const safeIndex = Math.min(lastIndex, Math.max(0, nextIndex));
			if (safeIndex === currentBlockIndexRef.current) return;

			const previousIndex = currentBlockIndexRef.current;
			currentBlockIndexRef.current = safeIndex;
			lastMovementRef.current = {
				at: Date.now(),
				fromIndex: previousIndex,
				source: "manual",
				toIndex: safeIndex,
			};
			resetBlockTracking(safeIndex);
			setCurrentBlockIndexState(safeIndex);
		},
		[resetBlockTracking],
	);

	const scheduleWaitingStatus = useCallback(() => {
		window.clearTimeout(waitingTimerRef.current);
		const elapsed = Date.now() - (lastSpeechAtRef.current ?? Date.now());
		waitingTimerRef.current = window.setTimeout(
			() => {
				if (enabledRef.current) updateStatus("Waiting", { reason: "silence" });
			},
			Math.max(0, WAITING_DELAY - elapsed),
		);
	}, [updateStatus]);

	const handleTranscript = useCallback(
		(transcriptWords, diagnosticContext = {}) => {
			lastSpeechAtRef.current = Date.now();
			scheduleWaitingStatus();

			const matchStartedAt = getDiagnosticTime();
			const currentIndex = currentBlockIndexRef.current;
			let match = findVoiceMatch({
				blocks: blocksRef.current,
				currentIndex,
				transcript: transcriptWords,
			});
			match = resolveIdenticalBlockOccurrence({
				blocks: blocksRef.current,
				completedOccurrence: completedOccurrenceRef.current,
				currentIndex,
				evidence: diagnosticContext.evidence,
				match,
				matchedWordCount:
					progressBlockIndexRef.current === currentIndex
						? matchedWordCountRef.current
						: 0,
			});
			const matchLatencyMs = getDiagnosticTime() - matchStartedAt;
			const decisionAt = Date.now();
			const nextState = resolveVoiceMatchState({
				currentIndex,
				lastMovement: lastMovementRef.current,
				lowConfidenceCount: lowConfidenceCountRef.current,
				match,
				now: decisionAt,
				pendingMatch: pendingMatchRef.current,
			});

			lowConfidenceCountRef.current = nextState.lowConfidenceCount;
			pendingMatchRef.current = nextState.pendingMatch;
			updateStatus(nextState.status, { reason: "match" });

			let transitionCarryoverWords = null;
			let movementLatencyMs = null;
			if (nextState.shouldMove) {
				const positionChangedAt = getDiagnosticTime();
				const nextBlockWords =
					blocksRef.current[nextState.nextIndex]?.words ?? [];
				const cleanState = resetBlockTracking(nextState.nextIndex, {
					eventWords: diagnosticContext.progressWords ?? [],
					nextBlockWords,
				});
				transitionCarryoverWords = cleanState.carryoverWords;
				lastMovementRef.current = {
					at: decisionAt,
					fromIndex: currentIndex,
					source: "voice",
					toIndex: nextState.nextIndex,
				};
				currentBlockIndexRef.current = nextState.nextIndex;
				metricsRef.current.activeBlockChanges += 1;
				metricsRef.current.stateUpdateCount += 1;
				setCurrentBlockIndexState(nextState.nextIndex);
				movementLatencyMs = diagnosticContext.receivedAt
					? Number(
							(positionChangedAt - diagnosticContext.receivedAt).toFixed(2),
						)
					: null;
				logVoiceFollowDiagnostic("position-change", {
					currentBlock: currentIndex,
					recognitionToPositionMs: diagnosticContext.receivedAt
						? Number(
								(positionChangedAt - diagnosticContext.receivedAt).toFixed(2),
							)
						: null,
					selectedBlock: nextState.nextIndex,
					time: Number(positionChangedAt.toFixed(2)),
				});
				const didRequestScroll = onPositionChangeRef.current?.(match, {
					positionChangedAt,
					recognitionReceivedAt: diagnosticContext.receivedAt,
				});
				if (didRequestScroll !== false) {
					metricsRef.current.scrollRequestCount += 1;
				}
			}

			const activeIndex = currentBlockIndexRef.current;
			const previousMatchedCount =
				progressBlockIndexRef.current === activeIndex
					? matchedWordCountRef.current
					: 0;
			const progressWords = diagnosticContext.progressWords?.length
				? (transitionCarryoverWords ?? diagnosticContext.progressWords)
				: transcriptWords;
			const activeBlockWords = blocksRef.current[activeIndex]?.words ?? [];
			const nextMatchedCount = getOrderedPrefixProgress({
				blockWords: activeBlockWords,
				previousMatchedCount,
				transcriptWords: progressWords,
			});

			if (nextMatchedCount !== previousMatchedCount) {
				const progressCalculatedAt = getDiagnosticTime();
				progressBlockIndexRef.current = activeIndex;
				matchedWordCountRef.current = nextMatchedCount;
				metricsRef.current.stateUpdateCount += 1;
				setMatchedWordCount(nextMatchedCount);
				const nextWordProgressTiming = {
					matchedWordCount: nextMatchedCount,
					progressCalculatedAt,
					recognitionReceivedAt: diagnosticContext.receivedAt,
				};
				wordProgressTimingRef.current = nextWordProgressTiming;
				setWordProgressTiming(nextWordProgressTiming);
			}

			const completedBlock = isBlockProgressComplete(
				nextMatchedCount,
				activeBlockWords.length,
			);
			const justCompletedBlock =
				completedBlock && previousMatchedCount < activeBlockWords.length;

			if (completedBlock) {
				recognitionSessionRef.current = clearRecognitionTranscript(
					recognitionSessionRef.current,
				);
			}
			if (justCompletedBlock) {
				pendingMatchRef.current = { ...EMPTY_PENDING_MATCH };
				lowConfidenceCountRef.current = 0;
				if (diagnosticContext.evidence) {
					completedOccurrenceRef.current = {
						blockIndex: activeIndex,
						...diagnosticContext.evidence,
					};
				}
			}

			recordDiagnosticEvent({
				candidateLine: match ? match.index + 1 : null,
				confirmationCount: nextState.confirmationCount,
				currentLine: currentIndex + 1,
				eventNumber: diagnosticContext.eventNumber,
				finalWordCount: diagnosticContext.finalWordCount ?? 0,
				finalWords: diagnosticContext.finalWords ?? [],
				interimWords: diagnosticContext.interimWords ?? [],
				movementLatencyMs,
				resultKind: diagnosticContext.resultKind,
				rollingWordCount: diagnosticContext.rollingWordCount ?? 0,
				rollingWords: transcriptWords,
				score: match ? Number(match.score.toFixed(3)) : null,
				sessionId: diagnosticContext.sessionId,
				threshold: match ? Number(match.threshold.toFixed(3)) : null,
				totalProcessingMs: diagnosticContext.receivedAt
					? Number(
							(getDiagnosticTime() - diagnosticContext.receivedAt).toFixed(2),
						)
					: null,
				transcriptCharacterCount:
					diagnosticContext.transcriptCharacterCount ?? 0,
			});

			return {
				completedBlock,
				didMove: nextState.shouldMove,
				matchLatencyMs: Number(matchLatencyMs.toFixed(2)),
			};
		},
		[
			recordDiagnosticEvent,
			resetBlockTracking,
			scheduleWaitingStatus,
			updateStatus,
		],
	);

	const processRecognitionResult = useCallback(
		(event) => {
			const receivedAt = getDiagnosticTime();
			const previousFinalWords = [
				...recognitionSessionRef.current.finalWords,
			];
			const processedResult = processRecognitionEvent({
				event,
				sessionState: recognitionSessionRef.current,
			});
			recognitionSessionRef.current = processedResult.sessionState;
			eventNumberRef.current += 1;

			let transcriptOutcomes = [];
			if (processedResult.receivedSpeech) {
				const evidence = processedResult.orderedEvidence;

				if (evidence.length <= 1) {
					const item = evidence[0];
					transcriptOutcomes = [
						handleTranscript(processedResult.rollingWords, {
							evidence: item
								? {
										resultIndex: item.resultIndex,
										sessionId: recognitionSessionIdRef.current,
									}
								: null,
							eventNumber: eventNumberRef.current,
							finalWordCount: processedResult.finalWordCount,
							finalWords: processedResult.eventFinalWords,
							interimWords: processedResult.interimWords,
							progressWords: processedResult.changedWords,
							receivedAt,
							resultKind: processedResult.resultKind,
							rollingWordCount: processedResult.rollingWordCount,
							sessionId: recognitionSessionIdRef.current,
							transcriptCharacterCount:
								processedResult.transcriptCharacterCount,
						}),
					];
				} else {
					let sequentialWords = previousFinalWords;

					transcriptOutcomes = evidence.map((item) => {
						sequentialWords = [...sequentialWords, ...item.words].slice(
							-ROLLING_TRANSCRIPT_WORDS,
						);
						const outcome = handleTranscript(sequentialWords, {
							evidence: {
								resultIndex: item.resultIndex,
								sessionId: recognitionSessionIdRef.current,
							},
							eventNumber: eventNumberRef.current,
							finalWordCount: item.isFinal ? item.words.length : 0,
							finalWords: item.isFinal ? item.words : [],
							interimWords: item.isFinal ? [] : item.words,
							progressWords: item.words,
							receivedAt,
							resultKind: item.isFinal ? "final" : "interim",
							rollingWordCount: sequentialWords.length,
							sessionId: recognitionSessionIdRef.current,
							transcriptCharacterCount: item.words.join(" ").length,
						});

						if (outcome.completedBlock || outcome.didMove) {
							sequentialWords = [];
						}

						return outcome;
					});
				}
			}
			const eventProcessingMs = getDiagnosticTime() - receivedAt;
			recordRecognitionEventMetric(metricsRef.current, {
				eventProcessingMs,
				isDuplicateRevision: processedResult.isDuplicateRevision,
				matcherMs: transcriptOutcomes.reduce(
					(total, outcome) => total + outcome.matchLatencyMs,
					0,
				),
				resultKind: processedResult.resultKind,
				transcriptCharacterCount: processedResult.transcriptCharacterCount,
			});
			scheduleDiagnosticRefresh();
		},
		[handleTranscript, scheduleDiagnosticRefresh],
	);

	const stopRecognition = useCallback(() => {
		window.clearTimeout(restartTimerRef.current);
		restartTimerRef.current = null;

		const recognition = recognitionRef.current;
		recognitionRef.current = null;
		if (!recognition) return;

		recognition.onend = null;
		recordRecognitionLifecycle(metricsRef.current, "end");
		scheduleDiagnosticRefresh();
		try {
			recognition.stop();
		} catch {
			// The browser may already have ended this recognition session.
		}
	}, [scheduleDiagnosticRefresh]);

	const disable = useCallback(() => {
		enabledRef.current = false;
		setIsEnabled(false);
		updateStatus(isSupported ? "Off" : "Unsupported", {
			reason: "disabled",
		});
		setMessage(isSupported ? "" : UNSUPPORTED_MESSAGE);
		window.clearTimeout(waitingTimerRef.current);
		resetBlockTracking();
		stopRecognition();
	}, [isSupported, resetBlockTracking, stopRecognition, updateStatus]);

	const scheduleRestart = useCallback(() => {
		if (
			!canScheduleRecognitionRestart({
				hasRecognition: Boolean(recognitionRef.current),
				isEnabled: enabledRef.current,
				isRestartScheduled: Boolean(restartTimerRef.current),
			})
		) {
			return;
		}

		restartTimerRef.current = window.setTimeout(() => {
			restartTimerRef.current = null;
			recordRecognitionLifecycle(metricsRef.current, "restart");
			scheduleDiagnosticRefresh();
			startRecognitionRef.current?.();
		}, RESTART_DELAY);
	}, [scheduleDiagnosticRefresh]);

	const startRecognition = useCallback(() => {
		if (!enabledRef.current || recognitionRef.current) return;

		const Recognition = getRecognitionConstructor();
		if (!Recognition) {
			enabledRef.current = false;
			setIsEnabled(false);
			updateStatus("Unsupported", { reason: "browser-support" });
			setMessage(UNSUPPORTED_MESSAGE);
			resetBlockTracking();
			return;
		}

		const recognition = new Recognition();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = "en-US";
		recognitionSessionIdRef.current += 1;
		recognitionSessionRef.current = createRecognitionSessionState();
		pendingMatchRef.current = { ...EMPTY_PENDING_MATCH };
		lowConfidenceCountRef.current = 0;

		recognition.onstart = () => {
			recordRecognitionLifecycle(metricsRef.current, "start");
			scheduleDiagnosticRefresh();
			lastSpeechAtRef.current = Date.now();
			setMessage("");
			updateStatus("Listening", { reason: "recognition-started" });
			scheduleWaitingStatus();
		};
		recognition.onresult = processRecognitionResult;
		recognition.onerror = (event) => {
			if (!enabledRef.current && event.error === "aborted") return;

			const errorState = getRecognitionErrorState(event.error);
			updateStatus(errorState.status, { reason: `error:${event.error}` });
			setMessage(errorState.message);

			if (errorState.disable) {
				enabledRef.current = false;
				setIsEnabled(false);
				resetBlockTracking();
				stopRecognition();
				return;
			}

			if (errorState.retry) {
				try {
					recognition.stop();
				} catch {
					// The end handler will restart if this session already stopped.
				}
			}
		};
		recognition.onend = () => {
			if (recognitionRef.current !== recognition) return;

			recognitionRef.current = null;
			recordRecognitionLifecycle(metricsRef.current, "end");
			scheduleDiagnosticRefresh();
			scheduleRestart();
		};

		recognitionRef.current = recognition;
		try {
			recognition.start();
		} catch {
			recognitionRef.current = null;
			enabledRef.current = false;
			setIsEnabled(false);
			updateStatus("Lost", { reason: "recognition-start-failed" });
			resetBlockTracking();
			setMessage(
				"Speech recognition could not start. Manual teleprompter controls are still available.",
			);
		}
	}, [
		processRecognitionResult,
		resetBlockTracking,
		scheduleDiagnosticRefresh,
		scheduleRestart,
		scheduleWaitingStatus,
		stopRecognition,
		updateStatus,
	]);

	useEffect(() => {
		startRecognitionRef.current = startRecognition;
	}, [startRecognition]);

	useEffect(() => {
		if (
			!diagnosticsEnabled ||
			typeof PerformanceObserver === "undefined" ||
			!PerformanceObserver.supportedEntryTypes?.includes("longtask")
		) {
			return undefined;
		}

		const observer = new PerformanceObserver((list) => {
			list.getEntries().forEach((entry) => {
				recordLongTask(metricsRef.current, entry.duration);
			});
			scheduleDiagnosticRefresh();
		});
		observer.observe({ entryTypes: ["longtask"] });
		return () => observer.disconnect();
	}, [diagnosticsEnabled, scheduleDiagnosticRefresh]);

	const enable = useCallback(() => {
		if (!isSupported || enabledRef.current) return;

		enabledRef.current = true;
		setIsEnabled(true);
		setMessage("");
		updateStatus("Listening", { reason: "enabled" });
		resetBlockTracking();
		startRecognitionRef.current?.();
	}, [isSupported, resetBlockTracking, updateStatus]);

	const toggle = useCallback(() => {
		if (enabledRef.current) disable();
		else enable();
	}, [disable, enable]);

	useEffect(
		() => () => {
			enabledRef.current = false;
			window.clearTimeout(waitingTimerRef.current);
			window.clearTimeout(restartTimerRef.current);
			window.clearTimeout(diagnosticRefreshTimerRef.current);
			const recognition = recognitionRef.current;
			recognitionRef.current = null;
			if (recognition) {
				recognition.onend = null;
				try {
					recognition.stop();
				} catch {
					// The browser may already have ended this recognition session.
				}
			}
		},
		[],
	);

	return {
		currentBlockIndex,
		diagnostics: {
			enabled: diagnosticsEnabled,
			events: diagnosticsSnapshot.events,
			summary: diagnosticsSnapshot.summary,
		},
		disable,
		enable,
		isEnabled,
		isSupported,
		message,
		matchedWordCount,
		setCurrentBlockIndex,
		status,
		totalWordCount: blocks[currentBlockIndex]?.words.length ?? 0,
		toggle,
		wordProgressTiming,
	};
}
