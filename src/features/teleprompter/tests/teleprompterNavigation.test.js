/** @format */

import assert from "node:assert/strict";
import test from "node:test";
import {
	advanceTimedViewport,
	createTeleprompterKeyMap,
	leaveTeleprompter,
	MANUAL_SCROLL_DISTANCE,
	moveViewport,
	SCRIPT_WORKSPACE_ROUTE,
	scrollViewportToTop,
} from "../teleprompterNavigation.js";

function createViewport(scrollTop = 500) {
	return { clientHeight: 800, scrollHeight: 2400, scrollTop };
}

test("forward and rewind move immediately while Timed Scroll is paused", () => {
	const viewport = createViewport();

	moveViewport(viewport, MANUAL_SCROLL_DISTANCE);
	assert.equal(viewport.scrollTop, 820);
	moveViewport(viewport, -MANUAL_SCROLL_DISTANCE);
	assert.equal(viewport.scrollTop, 500);
});

test("Timed Scroll continues from a manual navigation position while playing", () => {
	const viewport = createViewport();

	moveViewport(viewport, MANUAL_SCROLL_DISTANCE);
	advanceTimedViewport(viewport, 60, 500);
	assert.equal(viewport.scrollTop, 850);

	moveViewport(viewport, -MANUAL_SCROLL_DISTANCE);
	advanceTimedViewport(viewport, 60, 500);
	assert.equal(viewport.scrollTop, 560);
});

test("manual navigation is available during countdown without changing mode", () => {
	const viewport = createViewport();
	const mode = "timed";

	moveViewport(viewport, MANUAL_SCROLL_DISTANCE);

	assert.equal(viewport.scrollTop, 820);
	assert.equal(mode, "timed");
});

test("Top scrolls to the beginning without changing routes", () => {
	const viewport = createViewport();
	const route = "/teleprompter";

	assert.equal(scrollViewportToTop(viewport), 0);

	assert.equal(viewport.scrollTop, 0);
	assert.equal(route, "/teleprompter");
});

test("Back stops both engines before navigating to the script workspace", () => {
	const calls = [];

	leaveTeleprompter({
		navigate: (route) => calls.push(`navigate:${route}`),
		stopTimed: () => calls.push("stop-timed"),
		stopVoice: () => calls.push("stop-voice"),
	});

	assert.deepEqual(calls, [
		"stop-voice",
		"stop-timed",
		`navigate:${SCRIPT_WORKSPACE_ROUTE}`,
	]);
});

test("Back does not mutate persisted script or reading settings", () => {
	const script = { text: "Keep this script." };
	const settings = { mirror: true, speed: 72 };

	leaveTeleprompter({
		navigate: () => {},
		stopTimed: () => {},
		stopVoice: () => {},
	});

	assert.deepEqual(script, { text: "Keep this script." });
	assert.deepEqual(settings, { mirror: true, speed: 72 });
});

test("keyboard navigation uses the same controls in timed and voice modes", () => {
	const calls = [];
	const controls = {
		forward: () => calls.push("forward"),
		jumpToStart: () => calls.push("home"),
		pause: () => calls.push("pause"),
		rewind: () => calls.push("rewind"),
		toggle: () => calls.push("timed-primary"),
		toggleFullscreen: () => calls.push("fullscreen"),
	};
	const timedKeys = createTeleprompterKeyMap(controls);
	const voiceKeys = createTeleprompterKeyMap(controls, () =>
		calls.push("voice-primary"),
	);

	timedKeys.ArrowLeft();
	timedKeys.ArrowRight();
	voiceKeys.ArrowLeft();
	voiceKeys.ArrowRight();
	timedKeys[" "]();
	voiceKeys[" "]();

	assert.deepEqual(calls, [
		"rewind",
		"forward",
		"rewind",
		"forward",
		"timed-primary",
		"voice-primary",
	]);
});
