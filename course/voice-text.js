// Speech recognition is probabilistic, but placing text into a lesson's
// authored typing reference must remain predictable. These helpers only make
// mechanical, reviewable normalisations; they never call an AI model or invent
// wording that is not already visible to the learner.
export const normaliseText = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[“”]/g, '"')
  .replace(/[’]/g, "'");

export const normaliseTypingMatch = (value) => normaliseText(value)
  .toLocaleLowerCase()
  .replace(/[.,!?;:]/g, '');

export const speechComparableText = (value) => normaliseTypingMatch(value)
  // Speech engines commonly return an initialism as separately-spaced letters.
  .replace(/\ba\s*d\s*h\s*d\b/g, 'adhd')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const editDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

// Accept only a complete, close transcription of the one visible reference.
// Returning the authored target keeps the existing character-by-character
// feedback and auto-submit rules consistent for Speechmatics and browser STT.
export const canonicaliseSpokenTyping = (transcript, target) => {
  const spoken = speechComparableText(transcript);
  const expected = speechComparableText(target);
  if (!spoken || !expected) return { value: normaliseText(transcript), corrected: false };
  if (spoken === expected) return { value: target, corrected: true };
  const length = Math.max(spoken.length, expected.length, 1);
  const similarity = 1 - (editDistance(spoken, expected) / length);
  if (spoken.length >= expected.length * 0.72 && similarity >= 0.92) return { value: target, corrected: true };
  return { value: normaliseText(transcript), corrected: false };
};

// Live browser recognition emits a growing transcript. When that transcript
// is an exact spoken prefix of the authored reference, return the matching
// authored characters (including an initialism such as "ADHD") so the normal
// character-by-character display can acknowledge each correct spoken word.
// If speech diverges, leave the recognised text visible for normal red/green
// feedback rather than silently changing what the learner said.
export const canonicaliseSpokenTypingPrefix = (transcript, target) => {
  const spoken = speechComparableText(transcript);
  const expected = speechComparableText(target);
  if (!spoken || !expected.startsWith(spoken)) return { value: normaliseText(transcript), aligned: false };
  let authoredPrefix = '';
  for (let index = 1; index <= target.length; index += 1) {
    const candidate = target.slice(0, index);
    const comparable = speechComparableText(candidate);
    if (!spoken.startsWith(comparable)) break;
    if (comparable === spoken) authoredPrefix = candidate;
  }
  return authoredPrefix
    ? { value: authoredPrefix, aligned: true }
    : { value: normaliseText(transcript), aligned: false };
};
