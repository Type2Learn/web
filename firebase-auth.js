import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAvzBlOjnU42ePOhE7X2i_iHbkD6kOQyX0',
  authDomain: 'type2learn-defcc.firebaseapp.com',
  projectId: 'type2learn-defcc',
  storageBucket: 'type2learn-defcc.firebasestorage.app',
  messagingSenderId: '383070749572',
  appId: '1:383070749572:web:c62898e35210bce59c13d1',
  measurementId: 'G-W0MFX5E8EL'
};

const errorMessages = {
  'auth/account-exists-with-different-credential': 'An account already uses this email with another sign-in method. Use that method first.',
  'auth/cancelled-popup-request': 'The newer Google sign-in window replaced the previous one.',
  'auth/email-already-in-use': 'An account already uses this email. Sign in or reset the password instead.',
  'auth/invalid-credential': 'The email or password was not recognized. Check both fields and try again.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/network-request-failed': 'The connection was interrupted. Check your internet connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method still needs to be enabled in the Firebase console.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups for Type2Learn and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
  'auth/too-many-requests': 'Too many attempts were made. Wait a moment before trying again.',
  'auth/unauthorized-domain': 'This domain needs to be added to Firebase Authentication authorized domains.',
  'auth/user-disabled': 'This account has been disabled. Contact Type2Learn support.',
  'auth/weak-password': 'Choose a stronger password with at least eight characters.'
};

const messageFor = (error) => errorMessages[error?.code] || 'Authentication could not be completed. Please try again.';

export const getType2LearnAuth = () => {
  const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  auth.useDeviceLanguage();
  return auth;
};

export const waitForType2LearnUser = () => new Promise((resolve) => {
  const auth = getType2LearnAuth();
  let unsubscribe = () => {};
  unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  }, () => {
    unsubscribe();
    resolve(null);
  });
});

export const signOutType2LearnUser = () => signOut(getType2LearnAuth());

export const setupFirebaseAuth = ({ setStatus }) => {
  const auth = getType2LearnAuth();
  const provider = new GoogleAuthProvider();
  const dialog = document.querySelector('[data-auth-dialog]');
  const formStage = document.querySelector('.auth-form-stage');
  const forms = Array.from(document.querySelectorAll('[data-auth-form]'));
  const account = document.querySelector('[data-auth-account]');
  const accountName = document.querySelector('[data-auth-account-name]');
  const accountEmail = document.querySelector('[data-auth-account-email]');
  const accountAvatar = document.querySelector('[data-auth-account-avatar]');
  const title = document.getElementById('auth-title');
  const description = document.getElementById('auth-description');
  const integrationNote = document.querySelector('.auth-integration-note');
  const loginForm = document.querySelector('[data-auth-form="login"]');
  const registerForm = document.querySelector('[data-auth-form="register"]');
  const resetForm = document.querySelector('[data-auth-form="reset"]');
  const loginEmail = document.getElementById('login-email');
  const rememberEmail = document.getElementById('remember-email');

  const safeAuthDestination = () => {
    const fallback = '/learn/';
    const next = new URLSearchParams(window.location.search).get('next') || fallback;
    try {
      const destination = new URL(next, window.location.origin);
      if (destination.origin !== window.location.origin) return fallback;
      if (destination.pathname === '/login/') return fallback;
      return destination.pathname + destination.search + destination.hash;
    } catch (error) {
      return fallback;
    }
  };

  const redirectAfterAuth = () => {
    window.location.assign(safeAuthDestination());
  };

  const setBusy = (form, busy) => {
    dialog?.setAttribute('aria-busy', String(busy));
    form?.querySelectorAll('button, input').forEach((control) => {
      control.disabled = busy;
    });
  };

  const showAuthenticatedUser = (user) => {
    if (!user || !account || !formStage) return;
    const name = user.displayName?.trim() || user.email?.split('@')[0] || 'Type2Learn learner';
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    formStage.hidden = true;
    forms.forEach((form) => {
      form.hidden = true;
      form.classList.remove('is-active');
      form.setAttribute('aria-hidden', 'true');
    });
    account.hidden = false;
    account.setAttribute('aria-hidden', 'false');
    if (accountName) accountName.textContent = name;
    if (accountEmail) accountEmail.textContent = user.email || 'Authenticated with Google';
    if (accountAvatar) accountAvatar.textContent = initials || 'T2';
    if (title) title.textContent = 'You are signed in.';
    if (description) description.textContent = 'Your Type2Learn account is ready for the next learning step.';
    if (integrationNote) integrationNote.hidden = true;
    dialog?.removeAttribute('aria-busy');
  };

  const showSignedOutState = () => {
    if (account) {
      account.hidden = true;
      account.setAttribute('aria-hidden', 'true');
    }
    if (formStage) formStage.hidden = false;
    if (integrationNote) {
      integrationNote.hidden = false;
      integrationNote.classList.remove('is-connecting', 'is-error');
      integrationNote.classList.add('is-connected');
      integrationNote.lastChild.textContent = 'Firebase Authentication connected';
    }
  };

  onAuthStateChanged(auth, (user) => {
    if (user) showAuthenticatedUser(user);
    else showSignedOutState();
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    setBusy(loginForm, true);
    setStatus(loginForm, 'Signing you in…', 'working');
    try {
      const persistence = rememberEmail?.checked ? browserLocalPersistence : browserSessionPersistence;
      await setPersistence(auth, persistence);
      await signInWithEmailAndPassword(auth, loginEmail.value.trim(), document.getElementById('login-password').value);
      try {
        if (rememberEmail?.checked) window.localStorage.setItem('type2learn-remember-email', loginEmail.value.trim());
        else window.localStorage.removeItem('type2learn-remember-email');
      } catch (error) { /* Authentication remains available if storage is restricted. */ }
      redirectAfterAuth();
    } catch (error) {
      setStatus(loginForm, messageFor(error), 'error');
    } finally {
      setBusy(loginForm, false);
    }
  });

  document.querySelectorAll('[data-google-auth]').forEach((button) => {
    button.addEventListener('click', async () => {
      const form = button.closest('form');
      setBusy(form, true);
      setStatus(form, 'Opening secure Google sign-in…', 'working');
      try {
        const persistence = rememberEmail?.checked ? browserLocalPersistence : browserSessionPersistence;
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
        await setPersistence(auth, persistence);
        redirectAfterAuth();
      } catch (error) {
        setStatus(form, messageFor(error), 'error');
      } finally {
        setBusy(form, false);
      }
    });
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('register-password');
    const confirmation = document.getElementById('register-confirm');
    confirmation.setCustomValidity(password.value === confirmation.value ? '' : 'The passwords do not match.');
    if (!registerForm.reportValidity()) return;
    setBusy(registerForm, true);
    setStatus(registerForm, 'Creating your account…', 'working');
    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(auth, document.getElementById('register-email').value.trim(), password.value);
      const displayName = document.getElementById('register-name').value.trim();
      if (displayName) await updateProfile(credential.user, { displayName });
      showAuthenticatedUser(credential.user);
      redirectAfterAuth();
    } catch (error) {
      setStatus(registerForm, messageFor(error), 'error');
    } finally {
      setBusy(registerForm, false);
    }
  });

  resetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!resetForm.reportValidity()) return;
    setBusy(resetForm, true);
    setStatus(resetForm, 'Preparing your secure reset email…', 'working');
    try {
      await sendPasswordResetEmail(auth, document.getElementById('reset-email').value.trim());
      setStatus(resetForm, 'If an account uses this email, a password-reset message is on its way.', 'success');
    } catch (error) {
      setStatus(resetForm, messageFor(error), 'error');
    } finally {
      setBusy(resetForm, false);
    }
  });

  document.querySelector('[data-auth-signout]')?.addEventListener('click', async () => {
    const button = document.querySelector('[data-auth-signout]');
    button.disabled = true;
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      if (accountEmail) accountEmail.textContent = messageFor(error);
    }
  });

  return auth;
};
