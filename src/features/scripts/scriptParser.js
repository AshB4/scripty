/** @format */

import {
	colonLabelPattern,
	metadataPattern,
	sceneHeadingPattern,
	stageSceneHeadingPattern,
	transitionPattern,
	displayHeadingPattern,
	sectionHeadingPattern,
	structuralLabelPattern,
	standaloneLabelPattern,
	noticePattern,
	commonRolePattern,
} from "./parser/patterns.js";

export const DEFAULT_SPEAKER_COLORS = [
	"#38BDF8",
	"#A78BFA",
	"#34D399",
	"#F59E0B",
	"#F472B6",
	"#FB7185",
	"#22D3EE",
];

function collapseWhitespace(value) {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

function titleCaseLabel(value) {
	return value
		.toLowerCase()
		.split(" ")
		.map((word) => {
			if (word.length <= 2) return word.toUpperCase();
			return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
		})
		.join(" ");
}

export function normalizeSpeaker(value) {
	const collapsed = collapseWhitespace(value).replace(/:\s*$/, "");
	const id = collapsed.toUpperCase();
	const label =
		collapsed === collapsed.toUpperCase() ||
		collapsed === collapsed.toLowerCase()
			? titleCaseLabel(collapsed)
			: collapsed;

	return { id, label };
}

function isUppercaseLine(value) {
	return /[A-Z]/.test(value) && value === value.toUpperCase();
}

function wordCount(value) {
	return collapseWhitespace(value).split(" ").filter(Boolean).length;
}

function previousContentIndex(lines, index) {
	for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
		if (lines[cursor].text) return cursor;
	}

	return -1;
}

function nextContentIndex(lines, index) {
	for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
		if (lines[cursor].text) return cursor;
	}

	return -1;
}

function isBracketed(value) {
	return /^\[[\s\S]+\]$/.test(value);
}

function isParenthetical(value) {
	return /^\([\s\S]+\)$/.test(value);
}

function isDisplayLeadCue(value) {
	return /^\[(?:TITLE\s+CARD|DOCUMENT\s+STAMP|ON\s+SCREEN|SUPER|CHYRON|LOWER\s+THIRD)\b/i.test(
		value,
	);
}

function isStrongNonSpeaker(value) {
	return (
		noticePattern.test(value) ||
		metadataPattern.test(value) ||
		sceneHeadingPattern.test(value) ||
		stageSceneHeadingPattern.test(value) ||
		transitionPattern.test(value) ||
		displayHeadingPattern.test(value) ||
		sectionHeadingPattern.test(value) ||
		isBracketed(value)
	);
}

function isLikelyDialogue(value) {
	if (!value || isStrongNonSpeaker(value)) return false;
	if (isParenthetical(value)) return true;
	return /[a-z]/.test(value) || /[.!?]["']?$/.test(value);
}

function collectKnownSpeakerIds(lines) {
	const knownIds = new Set();
	const standaloneCounts = new Map();

	lines.forEach(({ text }, index) => {
		if (!text) return;

		const colonMatch = text.match(colonLabelPattern);
		if (
			colonMatch &&
			!structuralLabelPattern.test(collapseWhitespace(colonMatch[1]))
		) {
			const nextIndex = nextContentIndex(lines, index);
			const hasDialogue =
				Boolean(colonMatch[2]) ||
				(nextIndex >= 0 && isLikelyDialogue(lines[nextIndex].text));
			if (hasDialogue) knownIds.add(normalizeSpeaker(colonMatch[1]).id);
			return;
		}

		if (
			!standaloneLabelPattern.test(text) ||
			isStrongNonSpeaker(text) ||
			wordCount(text) > 3
		) {
			return;
		}

		const nextIndex = nextContentIndex(lines, index);
		if (nextIndex < 0 || !isLikelyDialogue(lines[nextIndex].text)) return;

		const id = normalizeSpeaker(text).id;
		standaloneCounts.set(id, (standaloneCounts.get(id) ?? 0) + 1);
	});

	standaloneCounts.forEach((count, id) => {
		if (count > 1) knownIds.add(id);
	});

	return knownIds;
}

function detectSpeakerCue(lines, index, knownSpeakerIds) {
	const text = lines[index].text;
	const colonMatch = text.match(colonLabelPattern);

	if (colonMatch) {
		const candidate = collapseWhitespace(colonMatch[1]);
		if (structuralLabelPattern.test(candidate)) return null;

		const nextIndex = nextContentIndex(lines, index);
		const hasDialogue =
			Boolean(colonMatch[2]) ||
			(nextIndex >= 0 && isLikelyDialogue(lines[nextIndex].text));
		if (!hasDialogue) return null;

		return {
			dialogue: colonMatch[2].trim(),
			speaker: normalizeSpeaker(candidate),
		};
	}

	if (
		!standaloneLabelPattern.test(text) ||
		isStrongNonSpeaker(text) ||
		wordCount(text) > 3
	) {
		return null;
	}

	const speaker = normalizeSpeaker(text);
	const nextIndex = nextContentIndex(lines, index);
	if (nextIndex < 0) return null;

	const nextText = lines[nextIndex].text;
	const nextUppercase = isUppercaseLine(nextText) && !isParenthetical(nextText);
	if (nextUppercase || !isLikelyDialogue(nextText)) return null;

	const isUppercaseCue = isUppercaseLine(text);
	const isKnownCue = knownSpeakerIds.has(speaker.id);
	const isCommonRole = commonRolePattern.test(text);
	const hasParenthetical = isParenthetical(nextText);

	if (!isUppercaseCue && !isKnownCue && !isCommonRole) return null;
	if (wordCount(text) === 3 && !isKnownCue && !hasParenthetical) return null;

	return { dialogue: "", speaker };
}

function classifyBracketedCue(text) {
	const cue = text.slice(1, -1).trim();

	if (/^(?:pause|beat|silence|hold)(?:\.|\s|$)/i.test(cue)) {
		return { subtype: "pause", type: "pause" };
	}

	if (/^(?:ON\s+SCREEN|SUPER|CHYRON|LOWER\s+THIRD)\s*:/i.test(cue)) {
		return { subtype: "display-cue", type: "display" };
	}

	if (/\b(?:music|sound|sfx|audio|theme|sting|voice-over)\b/i.test(cue)) {
		return { subtype: "audio", type: "direction" };
	}

	if (
		/\b(?:screen|camera|fade|cut|lights?|cabinet|door|title\s+card|document\s+stamp)\b/i.test(
			cue,
		)
	) {
		return {
			subtype: isDisplayLeadCue(text) ? "display-cue" : "visual",
			type: "direction",
		};
	}

	return { subtype: "direction", type: "direction" };
}

function classifyUppercaseBlock(lines, index) {
	const text = lines[index].text;
	const previousIndex = previousContentIndex(lines, index);
	const nextIndex = nextContentIndex(lines, index);
	const previousText = previousIndex >= 0 ? lines[previousIndex].text : "";
	const nextText = nextIndex >= 0 ? lines[nextIndex].text : "";

	if (metadataPattern.test(text)) return "metadata";
	if (sectionHeadingPattern.test(text)) return "section";
	if (displayHeadingPattern.test(text) || isDisplayLeadCue(previousText)) {
		return "display";
	}

	const adjacentUppercase =
		isUppercaseLine(previousText) || isUppercaseLine(nextText);
	return adjacentUppercase || index < 8 ? "display" : "section";
}

function createBlock(blocks, type, text, metadata = {}) {
	blocks.push({
		id: `${blocks.length + 1}-${type}`,
		text,
		type,
		...metadata,
	});
}

export function resolveParserMode(rawScript, requestedType = "Auto") {
	if (requestedType === "Screenplay" || requestedType === "Stage play") {
		return requestedType;
	}

	if (requestedType !== "Auto") return requestedType;

	const text = String(rawScript ?? "");
	const lines = text.split(/\r?\n/).map((line) => line.trim());
	if (lines.some((line) => sceneHeadingPattern.test(line))) return "Screenplay";

	const hasActOrScene = lines.some((line) => /^(?:ACT|SCENE)\b/i.test(line));
	const hasParenthetical = lines.some(isParenthetical);
	return hasActOrScene && hasParenthetical ? "Stage play" : "Auto";
}

export function isSpeakableBlock(block) {
	return !block.type || block.type === "dialogue";
}

export function getSpeakableBlocks(blocks) {
	return blocks.filter(isSpeakableBlock);
}

export function parseScript(rawScript, { scriptType = "Auto" } = {}) {
	const lines = String(rawScript ?? "")
		.split(/\r?\n/)
		.map((raw) => ({ raw, text: raw.trim() }));
	const parserMode = resolveParserMode(rawScript, scriptType);
	const usesCharacterDialogueBoundaries =
		parserMode === "Screenplay" || parserMode === "Stage play";
	const knownSpeakerIds = collectKnownSpeakerIds(lines);
	const blocks = [];
	const speakerLabels = new Map();
	const speakerOrder = new Map();
	let currentSpeaker = normalizeSpeaker("Narrator");
	let currentText = [];
	let isCharacterDialogueOpen = false;

	const rememberSpeaker = (speaker) => {
		if (!speakerLabels.has(speaker.id)) {
			speakerLabels.set(speaker.id, speaker.label);
		}

		return { id: speaker.id, label: speakerLabels.get(speaker.id) };
	};

	const colorFor = (speakerId) => {
		if (!speakerOrder.has(speakerId)) {
			speakerOrder.set(speakerId, speakerOrder.size);
		}

		return DEFAULT_SPEAKER_COLORS[
			speakerOrder.get(speakerId) % DEFAULT_SPEAKER_COLORS.length
		];
	};

	const flushDialogue = () => {
		if (!currentText.length) return;

		const speaker = rememberSpeaker(currentSpeaker);
		createBlock(blocks, "dialogue", currentText.join(" "), {
			color: colorFor(speaker.id),
			speaker: speaker.label,
			speakerId: speaker.id,
			speakerLabel: speaker.label,
		});
		currentText = [];
	};

	for (let index = 0; index < lines.length; index += 1) {
		const { text } = lines[index];

		if (!text) {
			flushDialogue();
			if (usesCharacterDialogueBoundaries) isCharacterDialogueOpen = false;
			continue;
		}

		if (noticePattern.test(text)) {
			flushDialogue();
			if (usesCharacterDialogueBoundaries) isCharacterDialogueOpen = false;
			const noticeLines = [text];

			while (index + 1 < lines.length && lines[index + 1].text) {
				const nextIndex = index + 1;
				const nextText = lines[nextIndex].text;
				if (
					isBracketed(nextText) ||
					isUppercaseLine(nextText) ||
					sceneHeadingPattern.test(nextText) ||
					stageSceneHeadingPattern.test(nextText) ||
					transitionPattern.test(nextText) ||
					metadataPattern.test(nextText) ||
					detectSpeakerCue(lines, nextIndex, knownSpeakerIds)
				) {
					break;
				}

				noticeLines.push(nextText);
				index = nextIndex;
			}

			createBlock(blocks, "notice", noticeLines.join("\n"));
			continue;
		}

		if (isBracketed(text)) {
			flushDialogue();
			if (usesCharacterDialogueBoundaries) isCharacterDialogueOpen = false;
			const classification = classifyBracketedCue(text);
			createBlock(blocks, classification.type, text, {
				subtype: classification.subtype,
			});
			continue;
		}

		if (sceneHeadingPattern.test(text) || stageSceneHeadingPattern.test(text)) {
			flushDialogue();
			if (usesCharacterDialogueBoundaries) isCharacterDialogueOpen = false;
			createBlock(blocks, "scene", text);
			continue;
		}

		if (transitionPattern.test(text)) {
			flushDialogue();
			if (usesCharacterDialogueBoundaries) isCharacterDialogueOpen = false;
			createBlock(blocks, "transition", text);
			continue;
		}

		if (metadataPattern.test(text)) {
			flushDialogue();
			if (usesCharacterDialogueBoundaries) isCharacterDialogueOpen = false;
			createBlock(blocks, "metadata", text);
			continue;
		}

		const speakerCue = detectSpeakerCue(lines, index, knownSpeakerIds);
		if (speakerCue) {
			flushDialogue();
			currentSpeaker = rememberSpeaker(speakerCue.speaker);
			isCharacterDialogueOpen = true;
			if (speakerCue.dialogue) currentText.push(speakerCue.dialogue);
			continue;
		}

		if (isParenthetical(text)) {
			flushDialogue();
			createBlock(blocks, "direction", text, { subtype: "parenthetical" });
			continue;
		}

		if (isUppercaseLine(text)) {
			flushDialogue();
			if (usesCharacterDialogueBoundaries) isCharacterDialogueOpen = false;
			createBlock(blocks, classifyUppercaseBlock(lines, index), text);
			continue;
		}

		if (usesCharacterDialogueBoundaries && !isCharacterDialogueOpen) {
			flushDialogue();
			createBlock(blocks, "direction", text, { subtype: "action" });
			continue;
		}

		currentText.push(text);
	}

	flushDialogue();
	return blocks;
}

export function getSpeakers(blocks) {
	const speakers = new Map();

	blocks.forEach((block) => {
		if (block.type && block.type !== "dialogue") return;

		const normalized = normalizeSpeaker(block.speakerId ?? block.speaker);
		if (!normalized.id || speakers.has(normalized.id)) return;

		speakers.set(normalized.id, {
			color: block.color,
			id: normalized.id,
			label: block.speakerLabel ?? normalized.label,
			name: block.speakerLabel ?? normalized.label,
		});
	});

	return Array.from(speakers.values());
}

export function countWords(blocks) {
	return blocks.reduce((total, block) => {
		if (block.type && block.type !== "dialogue") return total;
		return total + block.text.split(/\s+/).filter(Boolean).length;
	}, 0);
}

function countMatchingPatterns(text, patterns) {
	return patterns.reduce(
		(count, pattern) => count + (pattern.test(text) ? 1 : 0),
		0,
	);
}

function detectDocumentType(blocks, spokenWords, rawScript) {
	const text = rawScript
		? String(rawScript)
		: blocks
				.map((block) =>
					block.type === "dialogue" && block.speakerId !== "NARRATOR"
						? `${block.speakerId}: ${block.text}`
						: block.text,
				)
				.join("\n");
	const resumeSections = countMatchingPatterns(text, [
		/(?:^|\n)\s*(?:professional\s+summary|profile|objective)\s*(?:\n|$)/im,
		/(?:^|\n)\s*(?:work|employment)\s+experience\s*(?:\n|$)/im,
		/(?:^|\n)\s*education\s*(?:\n|$)/im,
		/(?:^|\n)\s*(?:skills|certifications|qualifications)\s*(?:\n|$)/im,
	]);
	const hasContactDetails =
		/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text) ||
		/\b(?:linkedin\.com|github\.com|portfolio)\b/i.test(text);

	if (resumeSections >= 3 || (resumeSections >= 2 && hasContactDetails)) {
		return "Resume";
	}

	const researchSignals = countMatchingPatterns(text, [
		/(?:^|\n)\s*abstract\s*(?:\n|$)/im,
		/(?:^|\n)\s*(?:methodology|methods)\s*(?:\n|$)/im,
		/(?:^|\n)\s*results\s*(?:\n|$)/im,
		/(?:^|\n)\s*references\s*(?:\n|$)/im,
		/\bdoi:\s*10\./i,
	]);
	if (researchSignals >= 2) return "Research paper";

	const meetingSignals = countMatchingPatterns(text, [
		/\bmeeting\s+(?:notes|minutes)\b/i,
		/(?:^|\n)\s*attendees?\s*:/im,
		/(?:^|\n)\s*agenda\s*:/im,
		/(?:^|\n)\s*action\s+items?\s*:/im,
		/(?:^|\n)\s*decisions?\s*:/im,
	]);
	if (meetingSignals >= 2) return "Meeting notes";

	const manualSignals = countMatchingPatterns(text, [
		/\b(?:user|instruction|service|operations?)\s+manual\b/i,
		/(?:^|\n)\s*(?:installation|setup)\s*(?:\n|$)/im,
		/(?:^|\n)\s*troubleshooting\s*(?:\n|$)/im,
		/(?:^|\n)\s*safety\s+(?:instructions|information)\s*(?:\n|$)/im,
	]);
	if (manualSignals >= 2) return "Manual";

	const bookSignals = countMatchingPatterns(text, [
		/(?:^|\n)\s*chapter\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five)\b/im,
		/\bISBN(?:-1[03])?\s*:/i,
		/\bcopyright\s+(?:©|\(c\)|\d{4})/i,
		/(?:^|\n)\s*(?:prologue|epilogue|dedication)\s*(?:\n|$)/im,
	]);
	if (bookSignals >= 2 || (bookSignals >= 1 && spokenWords >= 300)) {
		return "Book";
	}

	const articleSignals = countMatchingPatterns(text, [
		/(?:^|\n)[ \t]*by\s+[A-Z][A-Za-z .'-]{2,60}[ \t]*(?:\n|$)/im,
		/(?:^|\n)\s*(?:published|updated)\s*:/im,
		/(?:^|\n)\s*(?:news|feature|opinion)\s+article\s*(?:\n|$)/im,
	]);
	if (articleSignals >= 2) return "Article";

	return null;
}

function detectProductionFormat(counts, speakers, inferredParserMode = "Auto") {
	const structuralCount =
		counts.direction +
		counts.display +
		counts.notice +
		counts.pause +
		counts.section;
	const hasCast = speakers.length >= 2;
	const strongMatches = [];
	const partialMatches = [];

	if (inferredParserMode === "Screenplay" && counts.dialogue >= 1) {
		return {
			confidence: "High",
			reason: "Scene-heading and character-dialogue structure",
			scriptType: "Screenplay",
		};
	}

	if (inferredParserMode === "Stage play" && hasCast && counts.dialogue >= 2) {
		return {
			confidence: "High",
			reason: "Act or scene headings with character dialogue and directions",
			scriptType: "Stage play",
		};
	}

	if (counts.scene >= 2 || (counts.scene >= 1 && counts.transition >= 1)) {
		strongMatches.push("Screenplay");
	} else if (counts.scene || counts.transition) {
		partialMatches.push("Screenplay");
	}

	if (
		hasCast &&
		counts.dialogue >= 2 &&
		counts.display + counts.section >= 1 &&
		structuralCount >= 3
	) {
		strongMatches.push("Documentary");
	} else if (hasCast && counts.display + counts.section >= 1) {
		partialMatches.push("Documentary");
	}

	if (hasCast && counts.dialogue >= 2 && structuralCount === 0) {
		strongMatches.push("Podcast");
	} else if (hasCast && structuralCount <= 1) {
		partialMatches.push("Podcast");
	}

	if (
		hasCast &&
		counts.dialogue >= 2 &&
		counts.direction + counts.pause >= 1 &&
		!counts.scene &&
		!counts.display
	) {
		strongMatches.push("Stage play");
	} else if (hasCast && counts.direction + counts.pause >= 1) {
		partialMatches.push("Stage play");
	}

	if (speakers.length <= 1 && counts.dialogue >= 1 && counts.display >= 2) {
		strongMatches.push("Presentation");
	} else if (
		speakers.length <= 1 &&
		counts.dialogue >= 1 &&
		counts.display + counts.section >= 1
	) {
		partialMatches.push("Presentation");
	}

	if (strongMatches.length === 1) {
		return {
			confidence: "High",
			reason: `Strong ${strongMatches[0].toLowerCase()} structure`,
			scriptType: strongMatches[0],
		};
	}

	if (strongMatches.length === 0 && partialMatches.length === 1) {
		return {
			confidence: "Medium",
			reason: `Some ${partialMatches[0].toLowerCase()} structure`,
			scriptType: partialMatches[0],
		};
	}

	return {
		confidence: "Low",
		reason:
			strongMatches.length > 1 || partialMatches.length > 1
				? `Mixed production signals: ${[...strongMatches, ...partialMatches].join(", ")}`
				: "Limited production-script structure",
		scriptType: "Generic Teleprompter",
	};
}

export function analyzeScript(blocks, rawScript = "", options = {}) {
	const speakers = getSpeakers(blocks);
	const counts = blocks.reduce(
		(totals, block) => {
			if (block.type in totals) totals[block.type] += 1;
			return totals;
		},
		{
			dialogue: 0,
			direction: 0,
			display: 0,
			metadata: 0,
			notice: 0,
			pause: 0,
			scene: 0,
			section: 0,
			transition: 0,
		},
	);
	const spokenWords = countWords(blocks);
	const documentType = detectDocumentType(blocks, spokenWords, rawScript);
	const inferredParserMode = resolveParserMode(rawScript, "Auto");
	const detection = documentType
		? {
				confidence: "Low",
				reason: `Document signals resemble a ${documentType.toLowerCase()}`,
				scriptType: "Generic Teleprompter",
			}
		: detectProductionFormat(counts, speakers, inferredParserMode);
	const blockTypes = Object.fromEntries(
		Object.entries(counts).filter(([, count]) => count > 0),
	);

	return {
		...counts,
		blockTypes,
		confidence: detection.confidence,
		detectionReason: detection.reason,
		documentType,
		direction: counts.direction + counts.pause,
		displayAndSection: counts.display + counts.section,
		estimatedMinutes: spokenWords
			? Math.max(1, Math.round(spokenWords / 140))
			: 0,
		parsedBlockCount: blocks.length,
		parserMode: options.parserMode ?? "Auto",
		scriptType: detection.scriptType,
		speakerCount: speakers.length,
		speakableBlockCount: getSpeakableBlocks(blocks).length,
		wordCount: spokenWords,
	};
}

export function normalizeSpeakerColors(savedColors = {}, speakers = []) {
	const speakerDefaults = new Map(
		speakers.map((speaker) => [speaker.id, speaker.color]),
	);
	const grouped = new Map();

	Object.entries(savedColors).forEach(([key, color]) => {
		if (typeof color !== "string" || !color.trim()) return;
		const speaker = normalizeSpeaker(key);
		if (!speaker.id) return;
		if (!grouped.has(speaker.id)) grouped.set(speaker.id, []);
		grouped.get(speaker.id).push({
			color,
			isCanonicalKey:
				collapseWhitespace(key).replace(/:\s*$/, "") === speaker.id,
		});
	});

	const normalizedColors = {};
	grouped.forEach((candidates, speakerId) => {
		const defaultColor = speakerDefaults.get(speakerId)?.toLowerCase();
		const customCandidates = defaultColor
			? candidates.filter(({ color }) => color.toLowerCase() !== defaultColor)
			: [];
		const preferred =
			customCandidates.find(({ isCanonicalKey }) => isCanonicalKey) ??
			customCandidates[0] ??
			candidates.find(({ isCanonicalKey }) => isCanonicalKey) ??
			candidates[0];

		normalizedColors[speakerId] = preferred.color;
	});

	return normalizedColors;
}

export function speakerColorsAreEqual(left = {}, right = {}) {
	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key, index) => key === rightKeys[index] && left[key] === right[key],
		)
	);
}
