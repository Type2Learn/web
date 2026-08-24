import { apiError } from './errors.mjs';

// Private course material can live in Firebase Storage when it is provisioned,
// but Firebase Storage is deliberately not a single point of failure. Until a
// project links billing, Supabase provides the encrypted-service-key fallback
// for source uploads, reviewed narration, and release archives. Object paths
// are never returned to learners.
export const supabaseStorageReady = (config) => Boolean(
  config?.supabaseBackupUrl
  && config?.supabaseBackupServiceKey
  && config?.supabaseBackupBucket
);

export const firebaseStorageReady = (firebase) => Boolean(firebase?.available && firebase?.storage);

export const privateStorageStatus = ({ firebase, config }) => ({
  firebase: firebaseStorageReady(firebase),
  supabase: supabaseStorageReady(config),
  available: firebaseStorageReady(firebase) || supabaseStorageReady(config)
});

const supabaseObjectUrl = ({ config, objectPath }) => {
  const base = String(config.supabaseBackupUrl || '').replace(/\/$/, '');
  const safePath = String(objectPath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/${encodeURIComponent(config.supabaseBackupBucket)}/${safePath}`;
};

const serviceHeaders = (config, extra = {}) => ({
  Authorization: `Bearer ${config.supabaseBackupServiceKey}`,
  apikey: config.supabaseBackupServiceKey,
  ...extra
});

const unavailable = () => apiError(503, 'PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED', 'Private object storage is not configured. Connect Firebase Storage or the verified Supabase backup store.');

const uploadToSupabase = async ({ config, objectPath, content, contentType }) => {
  if (!supabaseStorageReady(config)) throw unavailable();
  const response = await fetch(supabaseObjectUrl({ config, objectPath }), {
    method: 'POST',
    headers: serviceHeaders(config, { 'x-upsert': 'true', 'Content-Type': contentType || 'application/octet-stream' }),
    body: content,
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw apiError(502, 'SUPABASE_PRIVATE_OBJECT_WRITE_FAILED', 'The private fallback store could not save this file.');
  return { provider: 'supabase', objectPath };
};

export const uploadPrivateObject = async ({ firebase, config, objectPath, content, contentType, metadata = {} }) => {
  let firebaseUnavailable = false;
  if (firebaseStorageReady(firebase)) {
    try {
      await firebase.storage.file(objectPath).save(content, {
        resumable: false,
        contentType: contentType || 'application/octet-stream',
        metadata: { metadata }
      });
      return { provider: 'firebase', objectPath, firebaseUnavailable: false };
    } catch {
      // Never expose an upstream storage error. A configured but unavailable
      // Firebase bucket must not prevent the independently verified fallback.
      firebaseUnavailable = true;
    }
  }
  const stored = await uploadToSupabase({ config, objectPath, content, contentType });
  return { ...stored, firebaseUnavailable };
};

export const downloadPrivateObject = async ({ firebase, config, provider = 'firebase', objectPath }) => {
  if (!objectPath) throw apiError(409, 'PRIVATE_OBJECT_NOT_FOUND', 'This private file is unavailable.');
  if (provider === 'supabase') {
    if (!supabaseStorageReady(config)) throw unavailable();
    const response = await fetch(supabaseObjectUrl({ config, objectPath }), {
      headers: serviceHeaders(config),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw apiError(503, 'PRIVATE_OBJECT_UNAVAILABLE', 'The private fallback file could not be opened right now.');
    return Buffer.from(await response.arrayBuffer());
  }
  if (!firebaseStorageReady(firebase)) throw unavailable();
  try {
    const [buffer] = await firebase.storage.file(objectPath).download();
    return buffer;
  } catch {
    throw apiError(503, 'PRIVATE_OBJECT_UNAVAILABLE', 'The private file could not be opened right now.');
  }
};

export const signedPrivateObjectUrl = async ({ firebase, config, provider = 'firebase', objectPath, expiresAt }) => {
  if (!objectPath) throw apiError(409, 'PRIVATE_OBJECT_NOT_FOUND', 'This private file is unavailable.');
  if (provider === 'supabase') {
    if (!supabaseStorageReady(config)) throw unavailable();
    const seconds = Math.max(30, Math.min(300, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    const base = String(config.supabaseBackupUrl || '').replace(/\/$/, '');
    const safePath = String(objectPath).split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const response = await fetch(`${base}/storage/v1/object/sign/${encodeURIComponent(config.supabaseBackupBucket)}/${safePath}`, {
      method: 'POST',
      headers: serviceHeaders(config, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: seconds }),
      signal: AbortSignal.timeout(15_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload?.signedURL !== 'string' || !payload.signedURL.startsWith('/')) {
      throw apiError(503, 'PRIVATE_OBJECT_UNAVAILABLE', 'The private narration could not be opened right now.');
    }
    // Supabase returns a path relative to `/storage/v1`, not to the project
    // root. Keep this server-only conversion explicit so the learner receives
    // a valid short-lived URL without ever seeing the bucket credentials.
    return `${base}/storage/v1${payload.signedURL}`;
  }
  if (!firebaseStorageReady(firebase)) throw unavailable();
  try {
    const [url] = await firebase.storage.file(objectPath).getSignedUrl({ action: 'read', expires: new Date(expiresAt) });
    return url;
  } catch {
    throw apiError(503, 'PRIVATE_OBJECT_UNAVAILABLE', 'The private narration could not be opened right now.');
  }
};
