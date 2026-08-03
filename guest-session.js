const GUEST_COOKIE = 'type2learn_guest_id';
const GUEST_COOKIE_AGE_SECONDS = 60 * 60 * 24 * 14;
const validGuestId = /^[A-Za-z0-9_-]{20,96}$/;

const readCookie = (name) => {
  const prefix = name + '=';
  return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || '';
};

const cookieOptions = () => '; Path=/; SameSite=Lax; Max-Age=' + GUEST_COOKIE_AGE_SECONDS + (window.location.protocol === 'https:' ? '; Secure' : '');

const newGuestId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '');
  const values = new Uint32Array(4);
  window.crypto?.getRandomValues?.(values);
  return Array.from(values, (value) => value.toString(36)).join('') || String(Date.now()) + Math.random().toString(36).slice(2);
};

const guestFromId = (id) => ({
  uid: 'guest-' + id,
  displayName: 'Guest learner',
  email: '',
  isGuest: true
});

export const getType2LearnGuest = () => {
  let id = '';
  try { id = decodeURIComponent(readCookie(GUEST_COOKIE)); } catch (_) { return null; }
  return validGuestId.test(id) ? guestFromId(id) : null;
};

export const createType2LearnGuest = () => {
  const existing = getType2LearnGuest();
  if (existing) return existing;
  const id = newGuestId();
  if (!validGuestId.test(id)) return null;
  document.cookie = GUEST_COOKIE + '=' + encodeURIComponent(id) + cookieOptions();
  return getType2LearnGuest();
};

export const clearType2LearnGuest = () => {
  const guest = getType2LearnGuest();
  document.cookie = GUEST_COOKIE + '=; Path=/; SameSite=Lax; Max-Age=0' + (window.location.protocol === 'https:' ? '; Secure' : '');
  if (!guest) return;
  const guestKey = encodeURIComponent(guest.uid);
  try {
    Object.keys(window.localStorage).forEach((key) => {
      if (key.includes(guestKey)) window.localStorage.removeItem(key);
    });
  } catch (_) {
    /* Clearing the cookie still ends guest access when browser storage is unavailable. */
  }
};
