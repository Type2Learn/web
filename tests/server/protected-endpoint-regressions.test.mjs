import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCourseProgressService } from '../../server/course-progress-service.mjs';
import { apiError } from '../../server/errors.mjs';
import { createLegacyCourseCheckService } from '../../server/legacy-course-check-service.mjs';
import { consentAwareHtml } from '../../server.mjs';

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

test('account progress saves only a bounded resume marker and removes every course marker on privacy deletion', async () => {
  const written = [];
  const deleted = [];
  const documents = [
    { ref: { id: 'first' } },
    { ref: { id: 'second' } }
  ];
  const firestore = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ set: async (value) => { written.push(value); } }),
          limit: () => ({ get: async () => ({ empty: documents.length === 0, docs: documents.splice(0) }) })
        })
      })
    }),
    batch: () => ({ delete: (reference) => deleted.push(reference.id), commit: async () => {} })
  };
  const service = createCourseProgressService({
    firebase: { available: true, firestore, verifyBearer: async () => ({ uid: 'learner-1' }) }
  });
  await service.save({
    authorization: 'Bearer test',
    courseId: 'course-1-neurodivergent-conditions-v2',
    body: {
      state: {
        view: 'course',
        progress: {
          lessonIndex: 2,
          phase: 'type',
          completedSteps: [0, 1],
          attempt: { response: 'This raw answer must never reach Firestore.' },
          finalExam: { questionIndex: 1, answerIndex: 2, completed: false }
        }
      },
      settings: { mascot: 'on' },
      choices: { pacing: 'comfortable' }
    }
  });
  assert.equal(written.length, 1);
  assert.equal(written[0].state.progress.attempt, undefined);
  assert.equal(written[0].state.progress.finalExam.answerIndex, undefined);
  assert.deepEqual(written[0].state.progress.completedSteps, [0, 1]);
  const result = await service.remove({ authorization: 'Bearer test' });
  assert.deepEqual(result, { deleted: true, scope: 'all-courses' });
  assert.deepEqual(deleted, ['first', 'second']);
});

test('legacy default-course choices are checked server-side and only return a bounded outcome', async () => {
  const service = createLegacyCourseCheckService({
    firebase: { available: true, verifyBearer: async () => ({ uid: 'learner-1' }) }
  });
  const accepted = await service.check({
    authorization: 'Bearer test',
    body: { courseId: 'course-1-neurodivergent-conditions-v2', version: '1.1', scope: 'module', moduleIndex: 0, selectedIndex: 1 }
  });
  const retry = await service.check({
    authorization: 'Bearer test',
    body: { courseId: 'course-1-neurodivergent-conditions-v2', version: '1.1', scope: 'module', moduleIndex: 0, selectedIndex: 0 }
  });
  assert.deepEqual(accepted, { result: 'complete' });
  assert.deepEqual(retry, { result: 'try-again' });
  assert.equal(JSON.stringify(service.status()).includes('answerIndex'), false);
});

test('public HTML defers optional analytics until the consent controller runs', () => {
  const input = '<!doctype html><html><head><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE"></script><script>window.dataLayer = window.dataLayer || []; gtag(\'config\', \'G-EXAMPLE\');</script><!-- Cloudflare Web Analytics --><script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"example"}\'></script><!-- End Cloudflare Web Analytics --></head><body>Preview</body></html>';
  const output = consentAwareHtml(input);
  assert.equal(output.includes('googletagmanager.com'), false);
  assert.equal(output.includes('cloudflareinsights.com'), false);
  assert.match(output, /<script src="\/analytics-consent\.js" defer><\/script>/);
  assert.equal(consentAwareHtml(output), output, 'controller insertion is idempotent');
});
