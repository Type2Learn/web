/*
 * Type2Learn bunny companion
 *
 * A deliberately small, self-contained page enhancement. It keeps its own
 * local presentation preferences and does not read, infer, or transmit course
 * responses, learner progress, or support-profile data.
 */

const SETTINGS_KEY = 'type2learn-bunny-companion-v1';
const LEGACY_SETTINGS_KEY = 'type2learn-companion-settings';
const LEGACY_COMPANION_KEY = 'type2learn-companion';
const QUEUED_MESSAGE_KEY = 'type2learn-bunny-companion-next-message';
const STYLE_ID = 'type2learn-bunny-companion-styles';
const ROOT_ID = 'type2learn-bunny-companion';
const ASSET_URL = '/assets/mascot/type2learn-bunny-web.glb?v=20260723-bunny-web';

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  easyReading: false,
  voiceEnabled: true,
  companion: 'bunny'
});

const MESSAGES = Object.freeze({
  home: [
    'Welcome to Type2Learn. We can take one clear step at a time.',
    'Welcome back. Your next learning step will be ready when you are.'
  ],
  pathways: ['Explore a path when you are ready. Every route begins with one clear next step.'],
  courses: ['Choose a course when you are ready. You can begin with one small step.'],
  learners: ['Learning supports are private, changeable, and available to everyone.'],
  families: ['Families can support the routine without adding pressure.'],
  schools: ['A calm learning routine can make the next action easier to see.'],
  team: ['The Type2Learn team is building with learners, families, and educators in mind.'],
  community: ['Bring a useful question. We will help you find the right next place.'],
  trust: ['Trust means keeping privacy, access, and honest limits visible.'],
  profile: ['Your learning controls and progress are private to you in this prototype.'],
  settings: ['Change this space whenever you need. Your choices stay in your control.'],
  dashboard: ['Your learning space is ready. One small step at a time.'],
  'course-ready': ['Your course is ready whenever you are.'],
  'course-complete': ['You completed the course. Take a moment to feel proud of that work.'],
  'settings-updated': ['Your companion preferences were updated.'],
  'default': ['Hello. I am here when you would like a calm next step.']
});

let settings = null;
let root = null;
let currentMessage = '';
let rendererState = null;
let modelLoadRequested = false;

const safeGet = (key, storage = window.localStorage) => {
  try { return storage.getItem(key); } catch (_) { return null; }
};

const safeSet = (key, value, storage = window.localStorage) => {
  try { storage.setItem(key, value); return true; } catch (_) { return false; }
};

const safeRemove = (key, storage = window.sessionStorage) => {
  try { storage.removeItem(key); } catch (_) { /* Storage is an optional enhancement. */ }
};

const safeJson = (value) => {
  try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
};

const normaliseSettings = (candidate) => ({
  enabled: candidate?.enabled !== false,
  easyReading: Boolean(candidate?.easyReading),
  voiceEnabled: candidate?.voiceEnabled !== false,
  companion: 'bunny'
});

const readSettings = () => {
  const saved = safeJson(safeGet(SETTINGS_KEY));
  if (saved) return normaliseSettings(saved);

  // Retain the two presentation preferences from the supplied mascot preview
  // if a learner already used it on the same deployed origin.
  const legacy = safeJson(safeGet(LEGACY_SETTINGS_KEY)) || {};
  const legacyCompanion = safeGet(LEGACY_COMPANION_KEY);
  const migrated = normaliseSettings({ ...DEFAULT_SETTINGS, ...legacy, companion: legacyCompanion || 'bunny' });
  safeSet(SETTINGS_KEY, JSON.stringify(migrated));
  return migrated;
};

const activeSettings = () => {
  if (!settings) settings = readSettings();
  return settings;
};

export const getMascotSettings = () => ({ ...activeSettings() });

const eventDetail = (event, extra = {}) => {
  try {
    window.dispatchEvent(new CustomEvent(event, { detail: extra }));
  } catch (_) { /* Custom events are a progressive enhancement. */ }
};

const isBlockedRoute = () => {
  const path = window.location.pathname.replace(/\/+/g, '/');
  if (path === '/course/' || path === '/course' || path === '/login/' || path === '/login' || path === '/fallback/' || path === '/fallback') return true;
  const publicRoute = document.body.dataset.route || '';
  return ['privacy', 'terms', 'accessibility', 'security', 'support'].includes(publicRoute);
};

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/mascot.css?v=20260723-bunny-web';
  document.head.append(link);
};

const messageFor = (key) => {
  const choices = MESSAGES[key] || MESSAGES.default;
  if (choices.length === 1) return choices[0];
  // Keep the choice stable for a visit without using learner data.
  const parity = new Date().getDate() % choices.length;
  return choices[parity];
};

const defaultMessageKey = () => {
  const route = document.body.dataset.route || document.body.dataset.learnerView || '';
  return MESSAGES[route] ? route : 'default';
};

const messageFromDetail = (detail = {}) => {
  if (typeof detail === 'string') return detail;
  if (typeof detail.message === 'string' && detail.message.trim()) return detail.message.trim();
  return messageFor(detail.event || detail.key || defaultMessageKey());
};

const setMessage = (detail) => {
  currentMessage = messageFromDetail(detail);
  const bubble = root?.querySelector('[data-bunny-message]');
  if (bubble) bubble.textContent = currentMessage;
};

export const queueMascotMessage = (eventKey) => {
  if (!eventKey || typeof eventKey !== 'string') return;
  safeSet(QUEUED_MESSAGE_KEY, eventKey, window.sessionStorage);
};

export const notifyMascot = (detail) => {
  if (!root) {
    if (detail?.event || detail?.key) queueMascotMessage(detail.event || detail.key);
    return;
  }
  setMessage(detail);
};

const applyEasyReading = () => {
  document.documentElement.classList.toggle('type2learn-easy-reading', Boolean(activeSettings().easyReading));
};

const closePanel = () => {
  const panel = root?.querySelector('[data-bunny-panel]');
  const button = root?.querySelector('[data-bunny-settings]');
  if (panel) panel.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
};

const stopSpeech = () => {
  try { window.speechSynthesis?.cancel(); } catch (_) { /* Speech is best-effort. */ }
};

const applyMascotSettings = ({ announce = false } = {}) => {
  const preferences = activeSettings();
  applyEasyReading();
  if (!root) return;

  root.classList.toggle('is-disabled', !preferences.enabled);
  const showButton = root.querySelector('[data-bunny-show]');
  if (showButton) showButton.hidden = preferences.enabled;
  root.querySelectorAll('[data-bunny-setting]').forEach((control) => {
    const key = control.dataset.bunnySetting;
    control.checked = Boolean(preferences[key]);
    control.setAttribute('aria-checked', String(Boolean(preferences[key])));
  });
  if (!preferences.enabled) {
    stopSpeech();
    closePanel();
    destroyRenderer();
  } else {
    scheduleBunnyModel();
  }
  if (announce) eventDetail('type2learn:mascot-settings-changed', { settings: { ...preferences } });
};

export const setMascotSettings = (changes = {}) => {
  settings = normaliseSettings({ ...activeSettings(), ...changes });
  safeSet(SETTINGS_KEY, JSON.stringify(settings));
  applyMascotSettings({ announce: true });
  return getMascotSettings();
};

const selectVoice = () => {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find((voice) => /ava|zira|samantha|female/i.test(voice.name) && /^en/i.test(voice.lang))
      || voices.find((voice) => /^en/i.test(voice.lang))
      || null;
  } catch (_) { return null; }
};

const speakMessage = () => {
  const preferences = activeSettings();
  if (!preferences.enabled || !preferences.voiceEnabled || !currentMessage || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
  stopSpeech();
  const utterance = new window.SpeechSynthesisUtterance(currentMessage);
  utterance.rate = 1;
  utterance.pitch = 1.04;
  const voice = selectVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  try { window.speechSynthesis.speak(utterance); } catch (_) { /* Browser speech remains optional. */ }
};

const parseGlb = (arrayBuffer) => {
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('Unsupported bunny model.');
  let offset = 12;
  let document = null;
  let binary = null;
  while (offset < arrayBuffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (type === 0x4e4f534a) {
      document = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, offset, length)).replace(/\0+$/g, '').trim());
    } else if (type === 0x004e4942) {
      binary = arrayBuffer.slice(offset, offset + length);
    }
    offset += length;
  }
  if (!document || !binary) throw new Error('The bunny model is incomplete.');
  return { document, binary };
};

const accessorArray = (document, binary, index) => {
  const accessor = document.accessors[index];
  const bufferView = document.bufferViews[accessor.bufferView];
  const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const constructors = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const Type = constructors[accessor.componentType];
  const count = accessor.count * componentCounts[accessor.type];
  if (!Type || !count) throw new Error('The bunny model contains an unsupported attribute.');
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  return new Type(binary, byteOffset, count);
};

const imageTexture = async (THREE, document, binary, textureIndex, { color = false } = {}) => {
  const texture = document.textures[textureIndex];
  const image = document.images[texture.source];
  const view = document.bufferViews[image.bufferView];
  const source = new Blob([binary.slice(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)], { type: image.mimeType || 'image/jpeg' });
  const sourceUrl = URL.createObjectURL(source);
  try {
    const element = await new Promise((resolve, reject) => {
      const loaded = new Image();
      loaded.decoding = 'async';
      loaded.onload = () => resolve(loaded);
      loaded.onerror = () => reject(new Error('The bunny texture could not be read.'));
      loaded.src = sourceUrl;
    });
    const result = new THREE.Texture(element);
    result.flipY = false;
    result.wrapS = THREE.RepeatWrapping;
    result.wrapT = THREE.RepeatWrapping;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    result.needsUpdate = true;
    return result;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

const createBunnyScene = async (THREE, arrayBuffer) => {
  const { document, binary } = parseGlb(arrayBuffer);
  const primitive = document.meshes?.[0]?.primitives?.[0];
  if (!primitive?.attributes?.POSITION || !primitive?.attributes?.NORMAL || !primitive?.attributes?.TEXCOORD_0 || primitive.indices === undefined) {
    throw new Error('The bunny geometry is incomplete.');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(accessorArray(document, binary, primitive.attributes.POSITION), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(accessorArray(document, binary, primitive.attributes.NORMAL), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(accessorArray(document, binary, primitive.attributes.TEXCOORD_0), 2));
  geometry.setIndex(new THREE.BufferAttribute(accessorArray(document, binary, primitive.indices), 1));
  geometry.computeBoundingSphere();

  const materialDocument = document.materials?.[primitive.material || 0] || {};
  const pbr = materialDocument.pbrMetallicRoughness || {};
  const [map, metalnessMap, normalMap] = await Promise.all([
    pbr.baseColorTexture ? imageTexture(THREE, document, binary, pbr.baseColorTexture.index, { color: true }) : null,
    pbr.metallicRoughnessTexture ? imageTexture(THREE, document, binary, pbr.metallicRoughnessTexture.index) : null,
    materialDocument.normalTexture ? imageTexture(THREE, document, binary, materialDocument.normalTexture.index) : null
  ]);
  const material = new THREE.MeshStandardMaterial({
    map,
    metalnessMap,
    normalMap,
    color: 0xffffff,
    // A small friendly companion should read as soft rather than reflective.
    metalness: 0,
    roughness: 0.78,
    side: materialDocument.doubleSided ? THREE.DoubleSide : THREE.FrontSide
  });
  const bunny = new THREE.Mesh(geometry, material);
  bunny.scale.setScalar(1.04);
  bunny.rotation.set(-0.06, -0.34, 0.04);
  return { bunny, geometry, material, textures: [map, metalnessMap, normalMap].filter(Boolean) };
};

const renderBunny = () => {
  const state = rendererState;
  if (!state) return;
  const rect = state.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.render(state.scene, state.camera);
};

const destroyRenderer = () => {
  if (!rendererState) return;
  const state = rendererState;
  rendererState = null;
  try { state.observer?.disconnect(); } catch (_) { /* Optional observer cleanup. */ }
  try { state.geometry.dispose(); } catch (_) { /* Optional GPU cleanup. */ }
  try { state.material.dispose(); } catch (_) { /* Optional GPU cleanup. */ }
  state.textures.forEach((texture) => { try { texture.dispose(); } catch (_) { /* No-op. */ } });
  try { state.renderer.dispose(); } catch (_) { /* Optional GPU cleanup. */ }
};

const loadBunnyModel = async () => {
  if (rendererState || !root || !activeSettings().enabled) return;
  const canvas = root.querySelector('[data-bunny-canvas]');
  if (!canvas) return;
  root.classList.add('is-loading');
  try {
    const [THREE, response] = await Promise.all([
      import('/vendor/three.module.min.js'),
      fetch(ASSET_URL, { credentials: 'same-origin' })
    ]);
    if (!response.ok) throw new Error('The companion model could not be loaded.');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 10);
    camera.position.set(0, 0.06, 4.7);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xf5faff, 0x19c5b5, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(-2.4, 3.5, 4.2);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x19c85a, 0.65);
    fillLight.position.set(2.2, 0.4, 2.5);
    scene.add(fillLight);
    const asset = await createBunnyScene(THREE, await response.arrayBuffer());
    scene.add(asset.bunny);
    rendererState = {
      renderer,
      canvas,
      scene,
      camera,
      geometry: asset.geometry,
      material: asset.material,
      textures: asset.textures,
      observer: typeof ResizeObserver === 'function' ? new ResizeObserver(renderBunny) : null
    };
    rendererState.observer?.observe(canvas);
    root.classList.remove('is-loading');
    root.classList.add('has-model');
    renderBunny();
  } catch (_) {
    root?.classList.remove('is-loading');
    root?.classList.add('has-fallback');
    destroyRenderer();
  }
};

const scheduleBunnyModel = () => {
  if (modelLoadRequested || rendererState || !root || !activeSettings().enabled) return;
  modelLoadRequested = true;
  const start = () => {
    modelLoadRequested = false;
    loadBunnyModel();
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: 1600 });
  else window.setTimeout(start, 260);
};

const initialiseControls = () => {
  const trigger = root.querySelector('[data-bunny-trigger]');
  const settingsButton = root.querySelector('[data-bunny-settings]');
  const panel = root.querySelector('[data-bunny-panel]');
  const hearButton = root.querySelector('[data-bunny-hear]');
  const showButton = root.querySelector('[data-bunny-show]');

  trigger?.addEventListener('mouseenter', speakMessage);
  trigger?.addEventListener('click', speakMessage);
  settingsButton?.addEventListener('click', () => {
    const opening = panel?.hidden;
    stopSpeech();
    if (panel) panel.hidden = !opening;
    settingsButton.setAttribute('aria-expanded', String(Boolean(opening)));
    if (opening) panel?.querySelector('[data-bunny-setting]')?.focus();
  });
  hearButton?.addEventListener('click', speakMessage);
  showButton?.addEventListener('click', () => setMascotSettings({ enabled: true }));
  root.querySelectorAll('[data-bunny-setting]').forEach((control) => control.addEventListener('change', () => {
    setMascotSettings({ [control.dataset.bunnySetting]: control.checked });
  }));
  document.addEventListener('pointerdown', (event) => {
    if (root && !root.contains(event.target)) closePanel();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel && !panel.hidden) {
      closePanel();
      settingsButton?.focus();
    }
  });
  window.addEventListener('pagehide', () => {
    stopSpeech();
    destroyRenderer();
  }, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeech();
  });
};

const listenForMessages = () => {
  const update = (event) => setMessage(event.detail || {});
  window.addEventListener('type2learn:mascot-message', update);
  // Accept the preview's event name, so older page-level triggers continue to
  // update only the bubble if they are present in a later restored snapshot.
  window.addEventListener('type2learn:companion-message', update);
};

export const mountType2LearnMascot = () => {
  if (isBlockedRoute()) return null;
  ensureStyles();
  if (root || document.getElementById(ROOT_ID)) {
    root = root || document.getElementById(ROOT_ID);
    applyMascotSettings();
    return root;
  }
  root = document.createElement('aside');
  root.id = ROOT_ID;
  root.className = 'type2learn-bunny-companion';
  root.setAttribute('aria-label', 'Type2Learn bunny companion');
  root.innerHTML = [
    '<div class="bunny-companion-main">',
    '  <p class="bunny-companion-message" id="type2learn-bunny-message" data-bunny-message role="status" aria-live="polite" aria-atomic="true"></p>',
    '  <div class="bunny-companion-stage">',
    '    <button class="bunny-companion-trigger" type="button" data-bunny-trigger aria-describedby="type2learn-bunny-message" aria-label="Hear the Type2Learn bunny companion message">',
    '      <canvas data-bunny-canvas aria-hidden="true"></canvas><span class="bunny-companion-fallback" aria-hidden="true">🐰</span>',
    '      <span class="sr-only">Hear the current bunny companion message</span>',
    '    </button>',
    '    <button class="bunny-companion-settings-button" type="button" data-bunny-settings aria-expanded="false" aria-controls="type2learn-bunny-settings" aria-label="Bunny companion preferences">⚙</button>',
    '  </div>',
    '</div>',
    '<section class="bunny-companion-panel" id="type2learn-bunny-settings" data-bunny-panel aria-label="Bunny companion preferences" hidden>',
    '  <p class="bunny-companion-panel-title">Bunny companion</p>',
    '  <label class="bunny-companion-setting"><span>Show companion<small>Keep the bunny in the lower-right corner on supported pages.</small></span><input type="checkbox" role="switch" data-bunny-setting="enabled"></label>',
    '  <label class="bunny-companion-setting"><span>Easy reading font<small>Use a clearer system text style across supported pages.</small></span><input type="checkbox" role="switch" data-bunny-setting="easyReading"></label>',
    '  <label class="bunny-companion-setting"><span>Voice on hover<small>Read the current message only when you hover or choose it.</small></span><input type="checkbox" role="switch" data-bunny-setting="voiceEnabled"></label>',
    '  <button class="bunny-companion-hear-button" type="button" data-bunny-hear>Hear current message</button>',
    '</section>',
    '<button class="bunny-companion-show-button" type="button" data-bunny-show hidden>Show bunny companion</button>'
  ].join('');
  document.body.append(root);

  const storedKey = safeGet(QUEUED_MESSAGE_KEY, window.sessionStorage);
  safeRemove(QUEUED_MESSAGE_KEY, window.sessionStorage);
  setMessage({ event: storedKey || defaultMessageKey() });
  initialiseControls();
  listenForMessages();
  applyMascotSettings();
  return root;
};

// The public shell calls mount explicitly after it has rendered its page.
// Exporting a small global bridge also lets independently rendered learner
// pages update the companion without copying component markup or storage code.
window.Type2LearnMascot = Object.freeze({
  getSettings: getMascotSettings,
  setSettings: setMascotSettings,
  mount: mountType2LearnMascot,
  notify: notifyMascot,
  queue: queueMascotMessage
});
