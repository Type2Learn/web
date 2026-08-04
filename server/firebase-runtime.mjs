import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { apiError } from './errors.mjs';

const APP_NAME = 'type2learn-ai-service';

export const createFirebaseRuntime = (config) => {
  if (!config.firebaseServiceAccountJson) {
    return { available: false, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured.' };
  }

  try {
    const serviceAccount = JSON.parse(config.firebaseServiceAccountJson);
    if (!serviceAccount?.client_email || !serviceAccount?.private_key) throw new Error('Incomplete service account.');
    const app = getApps().find((candidate) => candidate.name === APP_NAME)
      || initializeApp({ credential: cert(serviceAccount), projectId: config.firebaseProjectId }, APP_NAME);
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    return {
      available: true,
      firestore,
      async verifyBearer(authorization) {
        const token = String(authorization || '').startsWith('Bearer ')
          ? String(authorization).slice(7).trim()
          : '';
        if (!token) throw apiError(401, 'SIGN_IN_REQUIRED', 'Please sign in to use the AI helper.');
        try {
          const decoded = await auth.verifyIdToken(token);
          if (!decoded?.uid) throw new Error('No user ID.');
          return { uid: String(decoded.uid) };
        } catch {
          throw apiError(401, 'INVALID_SESSION', 'Your sign-in session is not valid. Please sign in again.');
        }
      }
    };
  } catch {
    return { available: false, reason: 'Firebase service credentials are not valid.' };
  }
};
