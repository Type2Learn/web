import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCourseProgressService } from '../../server/course-progress-service.mjs';
import { apiError } from '../../server/errors.mjs';

const serverSource = await readFile(new URL('../../server.mjs', import.meta.url), 'utf8');

test('assessment draft lookup parses its own query before reading query fields', () => {
  assert.match(
    serverSource,
    /pathname === '\/api\/v1\/assessment\/drafts'\) \{\s*const url = new URL\(request\.url \|\| '\/', 'http:\/\/localhost'\);\s*return sendJson/
  );
});

test('unauthenticated course progress fails with sign-in before course validation', async () => {
  const service = createCourseProgressService({
    firebase: {
      available: true,
      firestore: {},
      verifyBearer: async () => { throw apiError(401, 'SIGN_IN_REQUIRED', 'Please sign in to use the AI helper.'); }
    }
  });
  await assert.rejects(
    () => service.load({ authorization: '', courseId: '!' }),
    (error) => error?.status === 401 && error?.code === 'SIGN_IN_REQUIRED'
  );
  await assert.rejects(
    () => service.save({ authorization: '', courseId: '!', body: {} }),
    (error) => error?.status === 401 && error?.code === 'SIGN_IN_REQUIRED'
  );
});
