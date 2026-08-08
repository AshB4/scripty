/** @format */

import { toVoiceWords } from "../voiceFollow/voiceFollowMatcher.js";

export function splitDialogueProgress(text, matchedWordCount) {
	const value = String(text ?? "");
	const targetCount = Math.max(0, matchedWordCount);

	if (!value || targetCount === 0) {
		return { remaining: value, spoken: "" };
	}

	let consumedWords = 0;
	let splitIndex = 0;

	for (const match of value.matchAll(/\S+/g)) {
		const tokenWordCount = toVoiceWords(match[0]).length;
		if (tokenWordCount === 0) continue;
		if (consumedWords + tokenWordCount > targetCount) break;

		consumedWords += tokenWordCount;
		splitIndex = match.index + match[0].length;
		if (consumedWords === targetCount) break;
	}

	return {
		remaining: value.slice(splitIndex),
		spoken: value.slice(0, splitIndex),
	};
}
