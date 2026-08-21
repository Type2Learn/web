import { OFFLINE_CACHE_VERSION } from './offline-assets.js';

const canUseServiceWorker = () => 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

let registrationPromise = null;

export const registerOffline = async () => {
  if (!canUseServiceWorker()) return null;
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/service-worker.js', { scope: '/', type: 'module' })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        return registration;
      })
      .catch(() => null);
  }
  return registrationPromise;
};

const askWorker = async (type) => {
  const registration = await registerOffline();
  const worker = registration?.active || registration?.waiting || registration?.installing;
  if (!worker) throw new Error('Offline support is still preparing. Try again in a moment.');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error('Offline download did not finish in time.')), 120000);
    channel.port1.onmessage = (event) => {
      const payload = event.data || {};
      if (payload.type === 'progress') return;
      window.clearTimeout(timeout);
      if (payload.ok) resolve(payload);
      else reject(new Error(payload.message || 'Offline download could not finish.'));
    };
    worker.postMessage({ type, cacheVersion: OFFLINE_CACHE_VERSION }, [channel.port2]);
  });
};

export const downloadLearningForOffline = () => askWorker('DOWNLOAD_LEARNING_PACKAGE');

// Request persistent browser storage only after the learner explicitly asks
// for an offline package. Browsers may decline; the package still works in the
// regular cache and no permission prompt is shown before this deliberate act.
export const requestOfflinePersistence = async () => {
  if (!navigator.storage?.persist) return false;
  try { return Boolean(await navigator.storage.persist()); }
  catch { return false; }
};

export const getOfflineStatus = async () => {
  if (!canUseServiceWorker()) return { supported: false, installed: false, downloaded: false };
  const registration = await registerOffline();
  if (!registration) return { supported: true, installed: false, downloaded: false };
  try {
    const payload = await askWorker('OFFLINE_STATUS');
    return { supported: true, installed: true, ...payload };
  } catch {
    return { supported: true, installed: true, downloaded: false };
  }
};

// Registration is deliberately quiet. No banner, download, or storage request
// happens until a learner explicitly asks for offline learning.
void registerOffline();
