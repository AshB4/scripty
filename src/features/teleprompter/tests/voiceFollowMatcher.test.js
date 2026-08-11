/** @format */

import assert from "node:assert/strict";
import test from "node:test";
import { stagePlaySample } from "../../scripts/fixtures/stagePlaySample.js";
import { parseScript } from "../../scripts/scriptParser.js";
import {
	createTrackableBlocks,
	findVoiceMatch,
	getOrderedPrefixProgress,
	getVoiceMatchThreshold,
	normalizeVoiceText,
	ROLLING_TRANSCRIPT_WORDS,
	toVoiceWords,
} from "../voiceFollow/voiceFollowMatcher.js";

const blocks = createTrackableBlocks([
	{ id: "1-host", speaker: "HOST", text: "Welcome to the Scripty studio." },
	{ id: "2-guest", speaker: "GUEST", text: "Thanks for having me here today." },
	{ id: "3-host", speaker: "HOST", text: "Let us skip ahead by one line." },
	{ id: "4-guest", speaker: "GUEST", text: "This is the fourth spoken block." },
	{ id: "5-host", speaker: "HOST", text: "The fifth block is still nearby." },
	{
		id: "6-guest",
		speaker: "GUEST",
		text: "The sixth block is the farthest allowed.",
	},
	{ id: "7-host", speaker: "HOST", text: "This block is too far away." },
]);

test("normalizes case, punctuation, apostrophes, and whitespace", () => {
	assert.equal(
		normalizeVoiceText("  We're LIVE -- right now!  "),
		"were live right now",
	);
});

test("matches dialogue without using speaker names", () => {
	assert.equal(blocks[0].words.includes("host"), false);

	const match = findVoiceMatch({
		blocks,
		currentIndex: 0,
		transcript: "welcome to the scripty studio",
	});

	assert.equal(match.index, 0);
	assert.equal(match.isVeryHighConfidence, true);
});

test("excludes non-spoken parser blocks from Voice Follow tracking", () => {
	const trackable = createTrackableBlocks([
		{ id: "display", text: "THE TITLE", type: "display" },
		{
			id: "dialogue",
			speaker: "Narrator",
			text: "This line is spoken.",
			type: "dialogue",
		},
		{ id: "notice", text: "Content notice: Example.", type: "notice" },
		{ id: "cue", text: "[Pause.]", type: "pause" },
	]);

	assert.deepEqual(
		trackable.map((block) => block.id),
		["dialogue"],
	);
});

test("screenplay candidates exclude directions while preserving dialogue skips", () => {
	const parsed = parseScript(stagePlaySample, { scriptType: "Screenplay" });
	const trackable = createTrackableBlocks(parsed);
	const directionMatch = findVoiceMatch({
		blocks: trackable,
		currentIndex: 0,
		transcript: "a small kitchen before sunrise",
	});
	const skippedDialogue = findVoiceMatch({
		blocks: trackable,
		currentIndex: 0,
		transcript: "you could still change your mind",
	});

	assert.deepEqual(
		trackable.map((block) => block.text),
		[
			"Did you sleep at all?",
			"Not enough to call it sleep.",
			"You could still change your mind.",
			"That is what I am afraid of.",
			"They are early.",
		],
	);
	assert.equal(directionMatch.isConfident, false);
	assert.equal(skippedDialogue.index, 2);
	assert.equal(skippedDialogue.isConfident, true);
	assert.ok(trackable[0].segmentIndex > 0);
});

test("allows one block backward for repeated dialogue", () => {
	const match = findVoiceMatch({
		blocks,
		currentIndex: 1,
		transcript: "welcome to the scripty studio",
	});

	assert.equal(match.index, 0);
	assert.equal(match.isConfident, true);
});

test("matches skipped lines up to five blocks forward", () => {
	const match = findVoiceMatch({
		blocks,
		currentIndex: 0,
		transcript: "sixth block is the farthest allowed",
	});

	assert.equal(match.index, 5);
	assert.equal(match.isConfident, true);
});

test("matches a single skipped line", () => {
	const match = findVoiceMatch({
		blocks,
		currentIndex: 0,
		transcript: "let us skip ahead by one line",
	});

	assert.equal(match.index, 2);
	assert.equal(match.isConfident, true);
});

test("uses stronger thresholds backward and across larger forward skips", () => {
	assert.ok(getVoiceMatchThreshold(-1) > getVoiceMatchThreshold(1));
	assert.ok(getVoiceMatchThreshold(5) > getVoiceMatchThreshold(2));
});

test("marks a strong partial next-block result as responsive", () => {
	const match = findVoiceMatch({
		blocks,
		currentIndex: 0,
		transcript: "thanks for having me",
	});

	assert.equal(match.index, 1);
	assert.equal(match.isConfident, true);
	assert.equal(match.isImmediateMove, true);
});

test("allows an ordinary confident next-block result to move responsively", () => {
	const match = findVoiceMatch({
		blocks,
		currentIndex: 0,
		transcript: "thanks for having me unrelated words",
	});

	assert.equal(match.index, 1);
	assert.equal(match.isConfident, true);
	assert.equal(match.isVeryHighConfidence, false);
	assert.equal(match.isImmediateMove, true);
});

test("never searches farther than five blocks forward", () => {
	const match = findVoiceMatch({
		blocks,
		currentIndex: 0,
		transcript: "this block is too far away",
	});

	assert.notEqual(match.index, 6);
	assert.equal(match.isConfident, false);
});

test("tolerates a small paraphrase without guessing on unrelated speech", () => {
	const paraphrase = findVoiceMatch({
		blocks,
		currentIndex: 1,
		transcript: "let us jump ahead by one line",
	});
	const unrelated = findVoiceMatch({
		blocks,
		currentIndex: 1,
		transcript: "weather forecast changes tomorrow morning",
	});

	assert.equal(paraphrase.index, 2);
	assert.equal(paraphrase.isConfident, true);
	assert.equal(unrelated.isConfident, false);
});

test("uses proximity to avoid jumping between common repeated phrases", () => {
	const repeatedBlocks = createTrackableBlocks([
		{ id: "first", speaker: "A", text: "Let us continue with the report." },
		{ id: "current", speaker: "B", text: "Thank you for joining us today." },
		{ id: "near", speaker: "C", text: "Thank you for joining us today." },
		{ id: "far", speaker: "D", text: "Thank you for joining us today." },
	]);
	const match = findVoiceMatch({
		blocks: repeatedBlocks,
		currentIndex: 1,
		transcript: "thank you for joining us today",
	});

	assert.equal(match.index, 1);
	assert.equal(match.isConfident, true);
});

test("keeps only the latest rolling transcript words", () => {
	const transcript = Array.from(
		{ length: ROLLING_TRANSCRIPT_WORDS + 5 },
		(_, index) => `word${index}`,
	).join(" ");
	const match = findVoiceMatch({
		blocks,
		currentIndex: 0,
		transcript,
	});

	assert.equal(match.transcriptWords.length, ROLLING_TRANSCRIPT_WORDS);
	assert.deepEqual(
		match.transcriptWords,
		toVoiceWords(transcript).slice(-ROLLING_TRANSCRIPT_WORDS),
	);
});

test("supports arbitrary cast labels while matching dialogue only", () => {
	const castBlocks = createTrackableBlocks([
		{
			id: "one",
			speaker: "DR. RIVERA",
			text: "The test begins with this sentence.",
			type: "dialogue",
		},
		{
			id: "two",
			speaker: "CAPTAIN VALE",
			text: "The second reader continues from here.",
			type: "dialogue",
		},
	]);
	const match = findVoiceMatch({
		blocks: castBlocks,
		currentIndex: 0,
		transcript: "the second reader continues from here",
	});

	assert.equal(match.index, 1);
	assert.equal(castBlocks[1].words.includes("captain"), false);
});

test("marks only the first recognized word in the active block", () => {
	assert.equal(
		getOrderedPrefixProgress({
			blockWords: toVoiceWords("Welcome to Scripty."),
			transcriptWords: toVoiceWords("Welcome"),
		}),
		1,
	);
});

test("advances only through the ordered script prefix", () => {
	const blockWords = toVoiceWords("Welcome to the Scripty studio");
	const firstUpdate = getOrderedPrefixProgress({
		blockWords,
		transcriptWords: toVoiceWords("Welcome to"),
	});
	const secondUpdate = getOrderedPrefixProgress({
		blockWords,
		previousMatchedCount: firstUpdate,
		transcriptWords: toVoiceWords("Welcome to the Scripty"),
	});

	assert.equal(firstUpdate, 2);
	assert.equal(secondUpdate, 4);
	assert.equal(
		getOrderedPrefixProgress({
			blockWords,
			transcriptWords: toVoiceWords("Scripty studio"),
		}),
		0,
	);
});

test("does not mark later repeated words prematurely", () => {
	const blockWords = toVoiceWords("Go go now");
	const firstUpdate = getOrderedPrefixProgress({
		blockWords,
		transcriptWords: toVoiceWords("Go"),
	});
	const repeatedUpdate = getOrderedPrefixProgress({
		blockWords,
		previousMatchedCount: firstUpdate,
		transcriptWords: toVoiceWords("Go"),
	});

	assert.equal(firstUpdate, 1);
	assert.equal(repeatedUpdate, 1);
	assert.equal(
		getOrderedPrefixProgress({
			blockWords,
			transcriptWords: toVoiceWords("Go now"),
		}),
		1,
	);
});

test("normalizes punctuation while calculating word progress", () => {
	assert.equal(
		getOrderedPrefixProgress({
			blockWords: toVoiceWords("Welcome, to Scripty!"),
			transcriptWords: toVoiceWords("Welcome to"),
		}),
		2,
	);
});

test("keeps partial progress monotonic as interim transcripts update", () => {
	const blockWords = toVoiceWords("Welcome to Scripty");
	const previousMatchedCount = 2;

	assert.equal(
		getOrderedPrefixProgress({
			blockWords,
			previousMatchedCount,
			transcriptWords: toVoiceWords("Welcome to Scripty"),
		}),
		3,
	);
	assert.equal(
		getOrderedPrefixProgress({
			blockWords,
			previousMatchedCount,
			transcriptWords: toVoiceWords("unrelated words"),
		}),
		previousMatchedCount,
	);
});

test("stale previous-block words cannot complete the next block", () => {
	const nextBlockWords = toVoiceWords("Welcome to the next chapter now");
	const staleTranscript = toVoiceWords("Welcome to the previous chapter");
	const progress = getOrderedPrefixProgress({
		blockWords: nextBlockWords,
		transcriptWords: staleTranscript,
	});

	assert.ok(progress < nextBlockWords.length);
});

test('active progress can consume a missing article "a" when later words match', () => {
	const blockWords = toVoiceWords("I picked up a cup of coffee");
	const progress = getOrderedPrefixProgress({
		blockWords,
		transcriptWords: toVoiceWords("I picked up cup of coffee"),
	});

	assert.equal(progress, blockWords.length);
});

test('active progress continues when words after a missing article arrive in a new result boundary', () => {
	const blockWords = toVoiceWords("I picked up a cup of coffee");
	const progress = getOrderedPrefixProgress({
		blockWords,
		previousMatchedCount: 3,
		transcriptWords: toVoiceWords("cup of coffee"),
	});

	assert.equal(progress, blockWords.length);
});

test('active progress can consume a missing article "an" when later words match', () => {
	const blockWords = toVoiceWords("We shared an update with everyone");
	const progress = getOrderedPrefixProgress({
		blockWords,
		transcriptWords: toVoiceWords("We shared update with everyone"),
	});

	assert.equal(progress, blockWords.length);
});

test('active progress can consume a missing article "the" at the start', () => {
	const blockWords = toVoiceWords("The tracker should follow the next line");
	const progress = getOrderedPrefixProgress({
		blockWords,
		transcriptWords: toVoiceWords("Tracker should follow the next line"),
	});

	assert.equal(progress, blockWords.length);
});

test('active progress does not consume a missing meaningful word', () => {
	const progress = getOrderedPrefixProgress({
		blockWords: toVoiceWords("I will not go there"),
		transcriptWords: toVoiceWords("I will go there"),
	});

	assert.equal(progress, 2);
});

test('active progress retains filler and contraction normalization behavior', () => {
	const blockWords = toVoiceWords("We're ready to begin");
	const progress = getOrderedPrefixProgress({
		blockWords,
		transcriptWords: toVoiceWords("We're um ready to begin"),
	});

	assert.equal(progress, blockWords.length);
});

test('active progress cannot leap across several omitted script words', () => {
	const progress = getOrderedPrefixProgress({
		blockWords: toVoiceWords("I picked a very carefully chosen route"),
		transcriptWords: toVoiceWords("I picked chosen route"),
	});

	assert.equal(progress, 2);
});
