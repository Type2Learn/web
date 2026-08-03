/*
 * Reusable browser narration service.
 *
 * A lesson supplies short, semantic text chunks and the UI decides how to
 * present them. Browser SpeechSynthesis remains the default path. A lesson
 * can additionally supply a local-audio playlist through setAudioPlaylist();
 * when usable audio is available, it is preferred so every learner hears the
 * same recorded narration. Both paths report the same chunk and word-boundary
 * callbacks, which keeps the UI's existing text highlighting independent from
 * the source of the voice.
 */

const textForSpeech = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const normaliseChunks = (chunks) => (Array.isArray(chunks) ? chunks : [])
  .map((chunk, index) => ({
    id: String(chunk?.id || index),
    label: textForSpeech(chunk?.label || ''),
    text: textForSpeech(typeof chunk === 'string' ? chunk : chunk?.text),
    // A click inside a rendered text node can start speech partway through a
    // chunk. Keep that source offset so the UI can highlight the matching word
    // in the original visible text rather than the beginning of the paragraph.
    startOffset: Math.max(0, Number(chunk?.startOffset) || 0)
  }))
  .filter((chunk) => chunk.text);

const boundaryEnd = (text, start, suppliedLength) => {
  if (Number.isFinite(Number(suppliedLength)) && Number(suppliedLength) > 0) return Math.min(text.length, start + Number(suppliedLength));
  let end = Math.min(Math.max(start, 0), text.length);
  while (end < text.length && !/\s/.test(text[end])) end += 1;
  return end > start ? end : Math.min(text.length, start + 1);
};

const nonNegativeInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

const finiteNonNegative = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const uniqueIndexes = (values) => [...new Set((Array.isArray(values) ? values : [])
  .map(nonNegativeInteger)
  .filter((value) => value !== null))];

const rangeFromKey = (key) => {
  const numbers = String(key || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return numbers.length >= 2 ? { start: numbers[0], end: numbers[1] } : null;
};

const mapEntry = (source, fallbackIndex = null, range = null) => {
  const item = Array.isArray(source) ? {
    sourceStart: source[0],
    sourceEnd: source[1],
    index: source[2],
    startOffset: source[3]
  } : (source && typeof source === 'object' ? source : { index: source });
  const sourceRange = Array.isArray(item.sourceRange) ? item.sourceRange : [];
  const start = finiteNonNegative(
    item.sourceStart ?? item.start ?? item.from ?? sourceRange[0] ?? range?.start,
    0
  );
  const end = finiteNonNegative(
    item.sourceEnd ?? item.end ?? item.to ?? sourceRange[1] ?? range?.end,
    start
  );
  const index = nonNegativeInteger(
    item.index ?? item.chunkIndex ?? item.visibleIndex ?? item.targetIndex ?? fallbackIndex
  );
  if (index === null || end <= start) return null;
  return {
    sourceStart: start,
    sourceEnd: end,
    index,
    // Some playlists can begin a visible chunk partway through its text. The
    // existing UI adds startOffset to charIndex, just like speech chunks do.
    startOffset: finiteNonNegative(item.startOffset ?? item.visibleStart ?? item.targetStart, 0)
  };
};

const explicitMapEntries = (chunkMap) => {
  if (Array.isArray(chunkMap)) return chunkMap.map((entry) => mapEntry(entry)).filter(Boolean);
  if (!chunkMap || typeof chunkMap !== 'object') return [];
  return Object.entries(chunkMap).map(([key, value]) => {
    const keyIndex = nonNegativeInteger(key);
    const range = rangeFromKey(key);
    return mapEntry(value, keyIndex, range);
  }).filter(Boolean);
};

const defaultMapEntries = ({ text, chunks, chunkIndexes, fallbackIndex }) => {
  const indexes = uniqueIndexes(chunkIndexes);
  const targets = indexes.length ? indexes : [Math.max(0, fallbackIndex)];
  const length = text.length;
  if (!length) return targets.map((index) => ({ sourceStart: 0, sourceEnd: 1, index, startOffset: 0 }));

  const lowerText = text.toLocaleLowerCase();
  let cursor = 0;
  // Only map text that really occurs in the recording transcript. Inventing
  // equal-sized ranges for an unmatched visual label made local-audio
  // highlights jump to unrelated text (for example, an unspoken heading).
  return targets.reduce((entries, index) => {
    const chunkText = textForSpeech(chunks[index]?.text || '');
    const matchedStart = chunkText ? lowerText.indexOf(chunkText.toLocaleLowerCase(), cursor) : -1;
    if (matchedStart < 0) return entries;
    const sourceEnd = Math.min(length, matchedStart + chunkText.length);
    cursor = sourceEnd;
    entries.push({ sourceStart: matchedStart, sourceEnd, index, startOffset: 0 });
    return entries;
  }, []);
};

const ratioValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null;
};

const normaliseWordCues = (cues, sourceLength) => (Array.isArray(cues) ? cues : [])
  .map((cue) => {
    const sourceStart = finiteNonNegative(cue?.sourceStart ?? cue?.start ?? cue?.from, 0);
    const sourceEnd = finiteNonNegative(cue?.sourceEnd ?? cue?.end ?? cue?.to, sourceStart);
    const startRatio = ratioValue(cue?.startRatio ?? cue?.ratioStart);
    const endRatio = ratioValue(cue?.endRatio ?? cue?.ratioEnd);
    const startTime = Number(cue?.startTime ?? cue?.timeStart);
    const endTime = Number(cue?.endTime ?? cue?.timeEnd);
    if (sourceEnd <= sourceStart || sourceStart >= sourceLength) return null;
    if ((startRatio === null || endRatio === null || endRatio <= startRatio)
      && (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime)) return null;
    return {
      sourceStart: Math.min(sourceLength - 1, sourceStart),
      sourceEnd: Math.min(sourceLength, sourceEnd),
      startRatio,
      endRatio,
      startTime: Number.isFinite(startTime) ? Math.max(0, startTime) : null,
      endTime: Number.isFinite(endTime) ? Math.max(0, endTime) : null
    };
  })
  .filter(Boolean)
  .sort((first, second) => (first.startRatio ?? first.startTime ?? 0) - (second.startRatio ?? second.startTime ?? 0));

const normaliseAudioPlaylist = (playlist, chunks) => (Array.isArray(playlist) ? playlist : [])
  .map((item, fallbackIndex) => {
    const src = String(item?.src || '').trim();
    if (!src) return null;
    const suppliedMap = explicitMapEntries(item?.chunkMap);
    const explicitIndexes = uniqueIndexes(item?.chunkIndexes);
    const mappedIndexes = uniqueIndexes(suppliedMap.map((entry) => entry.index));
    const chunkIndexes = explicitIndexes.length ? explicitIndexes : (mappedIndexes.length ? mappedIndexes : [fallbackIndex]);
    const sourceText = textForSpeech(item?.text || chunkIndexes.map((index) => chunks[index]?.text || '').join(' '));
    const map = (suppliedMap.length ? suppliedMap : defaultMapEntries({
      text: sourceText,
      chunks,
      chunkIndexes,
      fallbackIndex
    }))
      .map((entry) => {
        const maximum = Math.max(sourceText.length, 1);
        const sourceStart = Math.min(Math.max(0, entry.sourceStart), maximum - 1);
        const sourceEnd = Math.min(Math.max(sourceStart + 1, entry.sourceEnd), maximum);
        return { ...entry, sourceStart, sourceEnd };
      })
      .sort((first, second) => first.sourceStart - second.sourceStart);
    const requestedStop = Number(item?.stopAtSourceChar);
    const stopAtSourceChar = Number.isFinite(requestedStop)
      ? Math.min(sourceText.length, Math.max(0, requestedStop))
      : null;
    return {
      id: String(item?.id || fallbackIndex),
      src,
      text: sourceText,
      chunkIndexes: uniqueIndexes([...chunkIndexes, ...map.map((entry) => entry.index)]),
      chunkMap: map,
      // A full recording can be used for a smaller visible lesson section.
      // In that case the caller supplies the source boundary where playback
      // must stop, instead of reading unseen content from the same recording.
      stopAtSourceChar,
      // Paired recordings carry exact Edge WordBoundary cues. A legacy or
      // unpaired recording can still use the deterministic timeline below as
      // a graceful fallback, but course narration supplies the exact path.
      wordCues: normaliseWordCues(item?.wordCues ?? item?.cues, sourceText.length)
    };
  })
  .filter(Boolean);

const audioConstructor = () => {
  if (typeof window === 'undefined') return null;
  if (typeof window.Audio === 'function') return window.Audio;
  return typeof Audio === 'function' ? Audio : null;
};

const spokenWordPattern = /[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*/g;

const syllableEstimate = (word) => {
  const normalised = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!normalised) return 1;
  const groups = normalised.match(/[aeiouy]+/g) || [];
  return Math.max(1, groups.length - (normalised.endsWith('e') && groups.length > 1 ? 1 : 0));
};

const spokenWordWeight = (word) => {
  const text = String(word || '');
  // Initialisms such as ADHD are normally spoken letter-by-letter.
  if (/^[A-Z]{2,6}$/.test(text)) return Math.max(1.6, text.length * 0.6);
  return 0.52 + (syllableEstimate(text) * 0.58) + Math.min(0.38, Math.max(0, text.length - 5) * 0.055);
};

const punctuationPauseWeight = (gap) => {
  const value = String(gap || '');
  let weight = 0;
  if (/\.{3}|\u2026/.test(value)) weight += 1.35;
  else if (/[!?]/.test(value)) weight += 1.08;
  else if (/\./.test(value)) weight += 0.92;
  else if (/[;:]/.test(value)) weight += 0.64;
  else if (/[,]/.test(value)) weight += 0.36;
  if (/[\u2013\u2014-]/.test(value)) weight += 0.28;
  if (/\n/.test(value)) weight += 0.16;
  return weight;
};

const weightedWordCues = (text) => {
  const source = String(text || '');
  const matches = [...source.matchAll(spokenWordPattern)];
  if (!matches.length) return [];
  let elapsedWeight = 0;
  const rawCues = matches.map((match, index) => {
    const word = match[0];
    const sourceStart = match.index || 0;
    const sourceEnd = sourceStart + word.length;
    const nextStart = index + 1 < matches.length ? (matches[index + 1].index || source.length) : source.length;
    const voiceWeight = spokenWordWeight(word);
    const pauseWeight = punctuationPauseWeight(source.slice(sourceEnd, nextStart));
    const startWeight = elapsedWeight;
    const endWeight = startWeight + voiceWeight;
    elapsedWeight = endWeight + pauseWeight;
    return { sourceStart, sourceEnd, startWeight, endWeight: elapsedWeight };
  });
  const totalWeight = Math.max(elapsedWeight, 1);
  return rawCues.map((cue) => ({
    sourceStart: cue.sourceStart,
    sourceEnd: cue.sourceEnd,
    startRatio: cue.startWeight / totalWeight,
    // Keep the last word visibly current during a natural spoken pause.
    endRatio: cue.endWeight / totalWeight,
    startTime: null,
    endTime: null
  }));
};

export class NarrationService {
  constructor({ onStateChange = () => {}, onChunkChange = () => {}, onBoundary = () => {}, onVoicesChange = () => {} } = {}) {
    this.onStateChange = onStateChange;
    this.onChunkChange = onChunkChange;
    this.onBoundary = onBoundary;
    this.onVoicesChange = onVoicesChange;
    this.speechSupported = typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && 'SpeechSynthesisUtterance' in window;
    this.synth = this.speechSupported ? window.speechSynthesis : null;
    this.AudioConstructor = audioConstructor();
    this.audioSupported = Boolean(this.AudioConstructor);
    // Kept public for existing callers. Audio makes narration usable even if
    // SpeechSynthesis is absent, provided a playlist has been supplied.
    this.supported = this.speechSupported || this.audioSupported;
    this.chunks = [];
    this.currentIndex = 0;
    this.status = this.supported ? 'idle' : 'unsupported';
    this.rate = 1;
    this.volume = 1;
    this.voiceURI = '';
    this.session = 0;
    this.resumeFromRestart = false;
    this.voices = [];
    this.rawAudioPlaylist = [];
    this.audioPlaylist = [];
    this.audio = null;
    this.audioSession = 0;
    this.audioTrackIndex = -1;
    this.audioLastChunkIndex = -1;
    this.audioLastBoundaryKey = '';
    this.audioPendingSeekRatio = null;
    this.audioPendingSeekSourceChar = null;
    this.audioTimelineCache = new WeakMap();
    this.audioAnimationFrame = null;