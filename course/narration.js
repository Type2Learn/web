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
    lang: String(chunk?.lang || '').trim(),
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
      // A narrated task can join several bounded excerpts from one recording.
      // These excerpts continue to the next item instead of ending the task.
      advanceOnStop: Boolean(item?.advanceOnStop),
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
    // One preload per source is enough. A task may use several excerpts from
    // the same recording; duplicating it per excerpt wastes memory and can
    // create competing requests on slower connections.
    this.preloadedAudio = new Map();
    this.audioPreloadLinks = new Map();
    this.recordedAudioOnly = false;
    this.audioTimelineCache = new WeakMap();
    this.audioAnimationFrame = null;
    this.audioAnimationSession = 0;
    this.handleVoicesChanged = this.refreshVoices.bind(this);

    if (this.synth) {
      if (typeof this.synth.addEventListener === 'function') this.synth.addEventListener('voiceschanged', this.handleVoicesChanged);
      else this.synth.onvoiceschanged = this.handleVoicesChanged;
      this.refreshVoices();
    }
  }

  refreshVoices() {
    if (!this.synth) return [];
    this.voices = this.synth.getVoices().slice().sort((first, second) => first.name.localeCompare(second.name));
    this.onVoicesChange(this.voices.slice());
    return this.voices;
  }

  setChunks(chunks) {
    this.stop({ silent: true, resetIndex: true });
    this.clearPreloadedAudio();
    this.chunks = normaliseChunks(chunks);
    // A caller can set its playlist before it knows the final visible chunk
    // list. Rebuild fallback maps now that those chunks are available.
    this.audioPlaylist = normaliseAudioPlaylist(this.rawAudioPlaylist, this.chunks);
    this.currentIndex = 0;
    if (this.supported) this.setStatus('idle');
  }

  /*
   * Playlist item shape:
   * { src, text, chunkIndexes, chunkMap }
   *
   * chunkMap accepts [{ sourceStart, sourceEnd, index, startOffset }] or
   * [[sourceStart, sourceEnd, index, startOffset]]. An object keyed by
   * "start-end" is accepted too. index is the visible narration chunk index.
   */
  setAudioPlaylist(playlist) {
    this.stop({ silent: true, resetIndex: true });
    this.clearPreloadedAudio();
    this.rawAudioPlaylist = Array.isArray(playlist) ? playlist.slice() : [];
    this.audioPlaylist = normaliseAudioPlaylist(this.rawAudioPlaylist, this.chunks);
    if (this.supported) this.setStatus('idle');
    else this.setStatus('unsupported');
    // Warm every unique recording for the current rendered page before the
    // learner presses Play. This is intentionally independent of their TTS
    // preference, so turning it on never starts a fresh download.
    this.preloadAudioTracks();
    return this.audioPlaylist.slice();
  }

  setRecordedAudioOnly(enabled) {
    this.recordedAudioOnly = Boolean(enabled);
  }

  configure({ rate, voiceURI, volume } = {}) {
    if (Number.isFinite(Number(rate))) this.rate = Math.min(1.5, Math.max(0.75, Number(rate)));
    if (Number.isFinite(Number(volume))) this.volume = Math.min(1, Math.max(0, Number(volume)));
    if (typeof voiceURI === 'string') this.voiceURI = voiceURI;
    if (this.audio) {
      try { this.audio.playbackRate = this.rate; } catch (_) { /* Media rate support is best-effort. */ }
      try { this.audio.volume = this.volume; } catch (_) { /* Media volume support is best-effort. */ }
    }
  }

  setStatus(status) {
    this.status = status;
    this.onStateChange(status);
  }

  setActiveChunk(index) {
    this.onChunkChange(index);
  }

  selectedVoice(language = '') {
    const explicit = this.voices.find((voice) => voice.voiceURI === this.voiceURI);
    if (explicit) return explicit;
    const requestedLanguage = String(language || '').toLowerCase();
    if (!requestedLanguage) return null;
    return this.voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith(requestedLanguage)) || null;
  }

  hasAudioPlaylist() {
    return this.audioSupported && this.audioPlaylist.some((track) => track.src);
  }

  usingAudio() {
    return Boolean(this.audio && this.audioSession === this.session);
  }

  firstTrackChunkIndex(track, fallback = 0) {
    const mapped = track?.chunkMap?.[0]?.index;
    const indexed = track?.chunkIndexes?.[0];
    return nonNegativeInteger(mapped ?? indexed ?? fallback) ?? 0;
  }

  trackForChunk(index) {
    const requested = Math.max(0, Number(index) || 0);
    for (let trackIndex = 0; trackIndex < this.audioPlaylist.length; trackIndex += 1) {
      const track = this.audioPlaylist[trackIndex];
      const map = track.chunkMap.find((entry) => entry.index === requested);
      if (map) return { trackIndex, sourceChar: map.sourceStart, visibleIndex: requested };
      if (track.chunkIndexes.includes(requested) && track.chunkMap.length) {
        const nearest = track.chunkMap.find((entry) => entry.sourceStart >= 0) || track.chunkMap[0];
        return { trackIndex, sourceChar: nearest.sourceStart, visibleIndex: nearest.index };
      }
    }
    const firstTrack = this.audioPlaylist[0];
    return {
      trackIndex: 0,
      sourceChar: 0,
      visibleIndex: this.firstTrackChunkIndex(firstTrack, requested)
    };
  }

  mapForSourcePosition(track, position) {
    if (!track?.chunkMap?.length) return null;
    const sourcePosition = Math.max(0, Number(position) || 0);
    return track.chunkMap.find((entry) => sourcePosition >= entry.sourceStart && sourcePosition < entry.sourceEnd)
      || null;
  }

  audioTimelineFor(track) {
    if (!track || typeof track !== 'object') return [];
    const cached = this.audioTimelineCache.get(track);
    if (cached) return cached;
    const timeline = track.wordCues?.length ? track.wordCues : weightedWordCues(track.text);
    this.audioTimelineCache.set(track, timeline);
    return timeline;
  }

  cueRange(cue, duration) {
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const start = cue?.startTime !== null && cue?.startTime !== undefined && hasDuration
      ? cue.startTime / duration
      : cue?.startRatio;
    const end = cue?.endTime !== null && cue?.endTime !== undefined && hasDuration
      ? cue.endTime / duration
      : cue?.endRatio;
    const safeStart = ratioValue(start);
    const safeEnd = ratioValue(end);
    if (safeStart === null || safeEnd === null || safeEnd <= safeStart) return null;
    return { start: safeStart, end: safeEnd };
  }

  cueForPlaybackRatio(track, ratio, duration) {
    const position = Math.min(1, Math.max(0, Number(ratio) || 0));
    const timeline = this.audioTimelineFor(track);
    let lastCue = null;
    for (const cue of timeline) {
      const range = this.cueRange(cue, duration);
      if (!range) continue;
      if (position < range.start) return null;
      if (position < range.end) return { cue, range };
      lastCue = { cue, range };
    }
    return lastCue && position >= lastCue.range.end ? lastCue : null;
  }

  playbackRatioForSourcePosition(track, sourcePosition, duration) {
    const source = Math.max(0, Number(sourcePosition) || 0);
    const timeline = this.audioTimelineFor(track);
    let nextCue = null;
    for (const cue of timeline) {
      const range = this.cueRange(cue, duration);
      if (!range) continue;
      if (source >= cue.sourceStart && source < cue.sourceEnd) return range.start;
      if (source < cue.sourceStart && !nextCue) nextCue = range;
    }
    return nextCue?.start ?? 0;
  }

  clearAudioHighlight({ force = false } = {}) {
    if (!force && this.audioLastChunkIndex === -1 && !this.audioLastBoundaryKey) return;
    this.audioLastChunkIndex = -1;
    this.audioLastBoundaryKey = '';
    this.setActiveChunk(-1);
  }

  stopAudioPositionLoop() {
    const cancel = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : null;
    if (this.audioAnimationFrame !== null && cancel) cancel(this.audioAnimationFrame);
    this.audioAnimationFrame = null;
    this.audioAnimationSession = 0;
  }

  startAudioPositionLoop(audio, track, activeSession) {
    const request = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : null;
    if (!request) return;
    this.stopAudioPositionLoop();
    this.audioAnimationSession = activeSession;
    const tick = () => {
      if (activeSession !== this.session || this.audio !== audio || this.status !== 'playing') {
        this.stopAudioPositionLoop();
        return;
      }
      this.applyPendingAudioSeek(audio, track, activeSession);
      this.emitAudioPosition(track);
      this.audioAnimationFrame = request(tick);
    };
    this.audioAnimationFrame = request(tick);
  }

  disposeAudio({ resetTime = false, clearSource = false } = {}) {
    this.stopAudioPositionLoop();
    const audio = this.audio;
    this.audio = null;
    this.audioSession = 0;
    this.audioTrackIndex = -1;
    this.audioPendingSeekRatio = null;
    this.audioPendingSeekSourceChar = null;
    if (!audio) return;
    audio.onloadedmetadata = null;
    audio.oncanplay = null;
    audio.ontimeupdate = null;
    audio.onended = null;
    audio.onerror = null;
    try { audio.pause(); } catch (_) { /* Media cleanup is best-effort. */ }
    if (resetTime) {
      try { audio.currentTime = 0; } catch (_) { /* Not all media states are seekable. */ }
    }
    if (clearSource) {
      try { audio.removeAttribute?.('src'); } catch (_) { /* Best-effort source cleanup. */ }
      try { audio.src = ''; } catch (_) { /* Best-effort source cleanup. */ }
      try { audio.load?.(); } catch (_) { /* Best-effort source cleanup. */ }
    }
  }

  clearPreloadedAudio() {
    this.preloadedAudio.forEach((audio) => {
      try { audio.pause?.(); } catch (_) { /* Best-effort preload cleanup. */ }
      try { audio.removeAttribute?.('src'); } catch (_) { /* Best-effort preload cleanup. */ }
      try { audio.src = ''; } catch (_) { /* Best-effort preload cleanup. */ }
      try { audio.load?.(); } catch (_) { /* Best-effort preload cleanup. */ }
    });
    this.preloadedAudio.clear();
    this.audioPreloadLinks.forEach((link) => link.remove?.());
    this.audioPreloadLinks.clear();
  }

  preloadAudioTrack(trackIndex) {
    const track = this.audioPlaylist[trackIndex];
    this.preloadAudioSource(track?.src);
  }

  preloadAudioSource(source) {
    const safeSource = String(source || '').trim();
    if (!safeSource || !this.AudioConstructor || this.preloadedAudio.has(safeSource)) return;
    try {
      // An explicit resource hint makes the browser fetch the recording while
      // the page is idle. Unlike an unattached Audio object, it is honoured
      // consistently by Chromium and remains usable by the later Audio call.
      if (typeof document !== 'undefined' && !this.audioPreloadLinks.has(safeSource)) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'audio';
        link.href = safeSource;
        link.dataset.type2learnNarrationPreload = 'true';
        document.head.append(link);
        this.audioPreloadLinks.set(safeSource, link);
      }
      const preload = new this.AudioConstructor();
      preload.preload = 'auto';
      preload.src = safeSource;
      // Some browsers defer detached media elements until load() is explicit.
      preload.load?.();
      this.preloadedAudio.set(safeSource, preload);
    } catch (_) {
      // Playback still loads directly if this optional warm-up fails.
    }
  }

  preloadAudioTracks() {
    this.audioPlaylist.forEach((_, index) => this.preloadAudioTrack(index));
  }

  preloadAudioSources(sources) {
    (Array.isArray(sources) ? sources : []).forEach((source) => this.preloadAudioSource(source));
  }

  preloadNextAudioTrack(trackIndex) {
    this.preloadAudioTrack(trackIndex + 1);
  }

  advanceAudioTrack(trackIndex, activeSession) {
    if (activeSession !== this.session) return;
    const nextTrackIndex = trackIndex + 1;
    if (nextTrackIndex >= this.audioPlaylist.length) {
      this.setStatus('finished');
      return;
    }
    const nextTrack = this.audioPlaylist[nextTrackIndex];
    this.currentIndex = this.firstTrackChunkIndex(nextTrack, this.currentIndex);
    this.setActiveChunk(this.currentIndex);
    const sourceChar = nextTrack.chunkMap?.[0]?.sourceStart || 0;
    this.playAudioTrack(nextTrackIndex, activeSession, sourceChar);
  }

  emitAudioPosition(track, { force = false } = {}) {
    const audio = this.audio;
    if (!audio || !track || this.status !== 'playing') return;
    const duration = Number(audio.duration);
    const hasPendingSeek = Number.isFinite(this.audioPendingSeekRatio);
    const ratio = hasPendingSeek
      // Before the requested seek is applied, use that requested position
      // rather than briefly highlighting the beginning of the recording.
      ? Math.min(1, Math.max(0, Number(this.audioPendingSeekRatio) || 0))
      : (Number.isFinite(duration) && duration > 0
        ? Math.min(1, Math.max(0, Number(audio.currentTime) || 0) / duration)
        : 0);
    const timing = this.cueForPlaybackRatio(track, ratio, duration);
    if (!timing) {
      this.clearAudioHighlight({ force });
      return;
    }
    const { cue } = timing;
    if (Number.isFinite(track.stopAtSourceChar) && cue.sourceStart >= track.stopAtSourceChar) {
      // The current screen intentionally exposes only part of a full lesson
      // recording. Stop cleanly at its final visible word rather than moving
      // into later, unopened content.
      const trackIndex = this.audioTrackIndex;
      const activeSession = this.audioSession;
      this.disposeAudio({ clearSource: true });
      if (track.advanceOnStop) this.advanceAudioTrack(trackIndex, activeSession);
      else this.setStatus('finished');
      return;
    }
    const map = this.mapForSourcePosition(track, cue.sourceStart);
    if (!map) {
      // The recording can include an unrendered title or transition. Do not
      // mislead the learner by marking an unrelated visible paragraph.
      this.clearAudioHighlight({ force });
      return;
    }
    const visibleIndex = map.index;
    if (visibleIndex !== this.audioLastChunkIndex || force) {
      this.audioLastChunkIndex = visibleIndex;
      this.currentIndex = visibleIndex;
      this.setActiveChunk(visibleIndex);
    }
    const clippedStart = Math.max(cue.sourceStart, map.sourceStart);
    const clippedEnd = Math.min(cue.sourceEnd, map.sourceEnd);
    if (clippedEnd <= clippedStart) return;
    const key = `${map.index}:${map.sourceStart}:${clippedStart}:${clippedEnd}`;
    if (!force && key === this.audioLastBoundaryKey) return;
    this.audioLastBoundaryKey = key;
    this.onBoundary({
      index: map.index,
      charIndex: Math.max(0, clippedStart - map.sourceStart),
      charLength: Math.max(1, clippedEnd - clippedStart),
      startOffset: map.startOffset || 0
    });
  }

  applyPendingAudioSeek(audio, track, activeSession) {
    if (activeSession !== this.session || this.audio !== audio || this.audioPendingSeekRatio === null) return;
    const duration = Number(audio.duration);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const ratio = Math.min(1, Math.max(0, this.audioPendingSeekSourceChar === null
      ? this.audioPendingSeekRatio
      : this.playbackRatioForSourcePosition(track, this.audioPendingSeekSourceChar, duration)));
    const targetTime = Math.min(Math.max(0, ratio * duration), Math.max(0, duration - 0.01));
    try { audio.currentTime = targetTime; } catch (_) { /* Playback can begin at zero if a source is not seekable. */ }
    this.audioPendingSeekRatio = null;
    this.audioPendingSeekSourceChar = null;
    this.audioLastBoundaryKey = '';
    this.emitAudioPosition(track, { force: true });
  }

  handleAudioFailure(audio, activeSession, track, fallbackIndex) {
    if (activeSession !== this.session || this.audio !== audio) return;
    const selectedIndex = nonNegativeInteger(this.currentIndex) ?? this.firstTrackChunkIndex(track, fallbackIndex);
    this.disposeAudio({ clearSource: true });
    if (this.recordedAudioOnly || !this.speechSupported) {
      this.setStatus('error');
      return;
    }
    // A failed local recording should never remove the existing browser-speech
    // accessibility route. Continue from the currently highlighted chunk.
    this.currentIndex = Math.min(Math.max(selectedIndex, 0), Math.max(0, this.chunks.length - 1));
    try { this.synth.cancel(); } catch (_) { /* Browser cancellation is best-effort. */ }
    this.resumeFromRestart = false;
    this.setStatus('playing');
    this.setActiveChunk(this.currentIndex);
    this.speakCurrent(activeSession);
  }

  playAudioTrack(trackIndex, activeSession, sourceChar = 0) {
    const track = this.audioPlaylist[trackIndex];
    if (!track || !this.AudioConstructor || activeSession !== this.session) {
      if (this.recordedAudioOnly) this.setStatus('error');
      else this.startSpeech(this.currentIndex, activeSession);
      return false;
    }
    const preloaded = this.preloadedAudio.get(track.src);
    const usePreloadedAudio = Boolean(preloaded);
    let audio = preloaded || null;
    if (usePreloadedAudio) {
      this.preloadedAudio.delete(track.src);
    } else {
      try {
        audio = new this.AudioConstructor();
      } catch (_) {
        if (this.recordedAudioOnly) this.setStatus('error');
        else this.startSpeech(this.currentIndex, activeSession);
        return false;
      }
    }
    this.disposeAudio({ clearSource: true });
    this.audio = audio;
    this.audioSession = activeSession;
    this.audioTrackIndex = trackIndex;
    this.audioLastChunkIndex = -1;
    this.audioLastBoundaryKey = '';
    this.audioPendingSeekSourceChar = Math.max(0, Number(sourceChar) || 0);
    this.audioPendingSeekRatio = this.playbackRatioForSourcePosition(track, sourceChar, Number(audio.duration));
    try { audio.preload = 'auto'; } catch (_) { /* Optional media hint. */ }
    try { audio.playbackRate = this.rate; } catch (_) { /* Media rate support is best-effort. */ }
    try { audio.volume = this.volume; } catch (_) { /* Media volume support is best-effort. */ }
    audio.onloadedmetadata = () => this.applyPendingAudioSeek(audio, track, activeSession);
    audio.oncanplay = () => this.applyPendingAudioSeek(audio, track, activeSession);
    audio.ontimeupdate = () => {
      if (activeSession !== this.session || this.audio !== audio || this.status !== 'playing') return;
      this.applyPendingAudioSeek(audio, track, activeSession);
      this.emitAudioPosition(track);
    };
    audio.onended = () => {
      if (activeSession !== this.session || this.audio !== audio || this.status !== 'playing') return;
      this.stopAudioPositionLoop();
      this.emitAudioPosition(track, { force: true });
      // A whole-module recording may have been intentionally bounded to the
      // visible small section. Do not let natural media completion advance to
      // an add-on or another track that the learner has not chosen to hear.
      if (Number.isFinite(track.stopAtSourceChar)) {
        this.disposeAudio({ clearSource: true });
        if (track.advanceOnStop) this.advanceAudioTrack(trackIndex, activeSession);
        else this.setStatus('finished');
        return;
      }
      if (this.status !== 'playing' || this.audio !== audio) return;
      this.advanceAudioTrack(trackIndex, activeSession);
    };
    audio.onerror = () => this.handleAudioFailure(audio, activeSession, track, this.currentIndex);
    if (!usePreloadedAudio) {
      try { audio.src = track.src; } catch (_) {
        this.handleAudioFailure(audio, activeSession, track, this.currentIndex);
        return false;
      }
    }
    // Cached local media may already know its duration before an event fires.
    this.applyPendingAudioSeek(audio, track, activeSession);
    this.emitAudioPosition(track, { force: true });
    try {
      const playResult = audio.play();
      this.startAudioPositionLoop(audio, track, activeSession);
      this.preloadNextAudioTrack(trackIndex);
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => this.handleAudioFailure(audio, activeSession, track, this.currentIndex));
      }
      return true;
    } catch (_) {
      this.handleAudioFailure(audio, activeSession, track, this.currentIndex);
      return false;
    }
  }

  startAudio(index) {
    const selection = this.trackForChunk(index);
    if (this.status === 'paused'
      && this.usingAudio()
      && selection.trackIndex === this.audioTrackIndex
      && selection.visibleIndex === this.currentIndex) {
      try {
        const playResult = this.audio.play();
        this.setStatus('playing');
        this.startAudioPositionLoop(this.audio, this.audioPlaylist[this.audioTrackIndex], this.session);
        if (playResult && typeof playResult.catch === 'function') {
          const track = this.audioPlaylist[this.audioTrackIndex];
          playResult.catch(() => this.handleAudioFailure(this.audio, this.session, track, this.currentIndex));
        }
        return true;
      } catch (_) {
        const track = this.audioPlaylist[this.audioTrackIndex];
        this.handleAudioFailure(this.audio, this.session, track, this.currentIndex);
        return false;
      }
    }

    this.session += 1;
    const activeSession = this.session;
    try { this.synth?.cancel(); } catch (_) { /* Browser cancellation is best-effort. */ }
    this.resumeFromRestart = false;
    this.currentIndex = selection.visibleIndex;
    this.setStatus('playing');
    this.setActiveChunk(this.currentIndex);
    return this.playAudioTrack(selection.trackIndex, activeSession, selection.sourceChar);
  }

  startSpeech(index = this.currentIndex, existingSession = null) {
    if (this.recordedAudioOnly || !this.speechSupported) {
      this.setStatus(this.hasAudioPlaylist() ? 'error' : 'unsupported');
      return false;
    }
    const requestedIndex = Math.min(Math.max(Number(index) || 0, 0), this.chunks.length - 1);
    if (this.status === 'paused' && requestedIndex === this.currentIndex && !this.resumeFromRestart) {
      try {
        this.synth.resume();
        this.setStatus('playing');
        return true;
      } catch (_) {
        // Some engines cannot resume an interrupted utterance. Restart the
        // current chunk rather than leaving the learner in an unclear state.
      }
    }

    const activeSession = existingSession === null ? this.session + 1 : existingSession;
    this.session = activeSession;
    this.disposeAudio({ clearSource: true });
    try { this.synth.cancel(); } catch (_) { /* Browser cancellation is best-effort. */ }
    this.resumeFromRestart = false;
    this.currentIndex = requestedIndex;
    this.setStatus('playing');
    this.setActiveChunk(this.currentIndex);
    this.speakCurrent(activeSession);
    return true;
  }

  start(index = this.currentIndex) {
    if (!this.chunks.length) {
      this.setStatus('error');
      return false;
    }
    const requestedIndex = Math.min(Math.max(Number(index) || 0, 0), this.chunks.length - 1);
    if (this.hasAudioPlaylist()) return this.startAudio(requestedIndex);
    if (this.recordedAudioOnly || !this.speechSupported) {
      this.setStatus('unsupported');
      return false;
    }
    return this.startSpeech(requestedIndex);
  }

  speakCurrent(activeSession) {
    if (!this.speechSupported || activeSession !== this.session || this.status !== 'playing') return;
    if (this.currentIndex >= this.chunks.length) {
      this.currentIndex = Math.max(0, this.chunks.length - 1);
      this.setStatus('finished');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(this.chunks[this.currentIndex].text);
    utterance.rate = this.rate;
    utterance.volume = this.volume;
    if (this.chunks[this.currentIndex]?.lang) utterance.lang = this.chunks[this.currentIndex].lang;
    const voice = this.selectedVoice(utterance.lang);
    if (voice) utterance.voice = voice;

    utterance.onboundary = (event) => {
      if (activeSession !== this.session || this.status !== 'playing') return;
      const text = this.chunks[this.currentIndex]?.text || '';
      const charIndex = Math.min(Math.max(Number(event?.charIndex) || 0, 0), text.length);
      const charEnd = boundaryEnd(text, charIndex, event?.charLength);
      this.onBoundary({
        index: this.currentIndex,
        charIndex,
        charLength: Math.max(0, charEnd - charIndex),
        startOffset: this.chunks[this.currentIndex]?.startOffset || 0
      });
    };

    utterance.onend = () => {
      if (activeSession !== this.session || this.status !== 'playing') return;
      this.currentIndex += 1;
      if (this.currentIndex >= this.chunks.length) {
        this.currentIndex = Math.max(0, this.chunks.length - 1);
        this.setStatus('finished');
        return;
      }
      this.setActiveChunk(this.currentIndex);
      this.speakCurrent(activeSession);
    };

    utterance.onerror = (event) => {
      if (activeSession !== this.session || event?.error === 'canceled' || event?.error === 'interrupted') return;
      this.setStatus('error');
    };

    try {
      this.synth.speak(utterance);
    } catch (_) {
      if (activeSession === this.session) this.setStatus('error');
    }
  }

  pause() {
    if (this.status !== 'playing') return false;
    if (this.usingAudio()) {
      try {
        this.audio.pause();
        this.stopAudioPositionLoop();
        this.setStatus('paused');
        return true;
      } catch (_) {
        this.setStatus('error');
        return false;
      }
    }
    if (!this.speechSupported) return false;
    try {
      this.synth.pause();
      this.setStatus('paused');
      return true;
    } catch (_) {
      this.setStatus('error');
      return false;
    }
  }

  stop({ silent = false, resetIndex = true } = {}) {
    this.session += 1;
    this.disposeAudio({ resetTime: resetIndex, clearSource: true });
    if (this.synth) {
      try { this.synth.cancel(); } catch (_) { /* Browser cancellation is best-effort. */ }
    }
    if (resetIndex) this.currentIndex = 0;
    this.resumeFromRestart = false;
    this.audioLastChunkIndex = -1;
    this.audioLastBoundaryKey = '';
    this.setActiveChunk(-1);
    if (!silent && this.supported) this.setStatus('idle');
  }

  restart() {
    return this.start(0);
  }

  changePlayback({ rate, voiceURI, volume } = {}) {
    const wasPlaying = this.status === 'playing';
    const wasPaused = this.status === 'paused';
    const index = this.currentIndex;
    this.configure({ rate, voiceURI, volume });
    // Audio elements change speed in-place. That retains exact currentTime for
    // both playing and paused local MP3 narration.
    if (this.usingAudio()) return true;
    if (wasPlaying) return this.start(index);
    if (wasPaused) {
      this.session += 1;
      try { this.synth?.cancel(); } catch (_) { /* Best-effort browser cleanup. */ }
      this.resumeFromRestart = true;
      this.setStatus('paused');
      this.setActiveChunk(index);
    }
    return true;
  }

  destroy() {
    this.stop({ silent: true });
    this.clearPreloadedAudio();
    if (this.synth && typeof this.synth.removeEventListener === 'function') this.synth.removeEventListener('voiceschanged', this.handleVoicesChanged);
  }
}
