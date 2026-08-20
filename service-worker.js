import { CORE_SHELL_URLS, LEARNING_PACKAGE_URLS, OFFLINE_CACHE_VERSION, allOfflineUrls } from './offline-assets.js';

const CACHE_PREFIX = 'type2learn-offline-';
const cacheName = OFFLINE_CACHE_VERSION;

const cachePublicUrl = async (cache, url) => {
  const response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  await cache.put(url, response.clone());
};

const cacheUrls = async (urls, notify = () => {}) => {
  const cache = await caches.open(cacheName);
  let completed = 0;
  const failures = [];
  for (const url of urls) {
    try { await cachePublicUrl(cache, url); }
    catch { failures.push(url); }
    completed += 1;
    notify({ completed, total: urls.length, url });
  }
  return { completed, total: urls.length, failures };
};

self.addEventListener('install', (event) => {
  // A lean app shell makes a first offline visit recoverable. The larger course
  // package downloads only after a learner requests it from course settings.
  event.waitUntil(cacheUrls(CORE_SHELL_URLS).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== cacheName)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      void caches.open(cacheName).then((cache) => cache.put(request, copy));
      return response;
    }).catch(async () => (await caches.match(request, { ignoreSearch: true })) || (await caches.match('/offline.html'))));
    return;
  }

  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(cacheName).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});

self.addEventListener('message', (event) => {
  const port = event.ports?.[0];
  const reply = (payload) => port?.postMessage(payload);
  if (event.data?.type === 'OFFLINE_STATUS') {
    event.waitUntil((async () => {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      const learningDownloaded = await Promise.all(LEARNING_PACKAGE_URLS.map((url) => caches.match(url, { ignoreSearch: true }))).then((items) => items.filter(Boolean).length >= Math.ceil(LEARNING_PACKAGE_URLS.length * 0.9));
      reply({ ok: true, downloaded: learningDownloaded, cachedAssets: keys.length, version: cacheName });
    })());
    return;
  }
  if (event.data?.type !== 'DOWNLOAD_LEARNING_PACKAGE') return;
  event.waitUntil((async () => {
    try {
      const result = await cacheUrls(allOfflineUrls(), (progress) => reply({ type: 'progress', ...progress }));
      reply({ ok: true, downloaded: true, ...result, version: cacheName });
    } catch {
      reply({ ok: false, message: 'The learning package could not be downloaded. Your existing local work is unchanged.' });
    }
  })());
});
