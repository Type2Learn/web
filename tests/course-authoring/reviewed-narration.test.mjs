import assert from 'node:assert/strict';
import test from 'node:test';
import { createCourseCatalogService } from '../../server/course-catalog-service.mjs';

const reviewedRecord = {
  courseId: 'course-alpha',
  version: '1.0.0',
  status: 'published',
  requestedAudience: 'organisation',
  ownerOrganisationId: 'org-one',
  title: { en: 'Alpha', ur: 'الف' },
  learnerManifest: {
    label: { en: 'Theory', ur: 'نظریہ' },
    modules: [{ id: 'first-idea', en: { title: 'First idea' } }]
  },
  narrationAssets: [{ locale: 'en', sectionId: 'first-idea', objectPath: 'private-course-audio/no-leak.mp3' }]
};

const catalogueHarness = () => {
  const audit = [];
  const document = { get: async () => ({ exists: true, data: () => reviewedRecord, ref: { set: async () => {} } }) };
  const workspace = {
    collection: (name) => name === 'courses'
      ? { doc: () => document }
      : { add: async (entry) => audit.push(entry) }
  };
  const firebase = {
    available: true,
    firestore: { collection: () => ({ doc: () => workspace }) },
    storage: { file: (objectPath) => ({ getSignedUrl: async () => [`https://signed.example/${encodeURIComponent(objectPath)}`] }) }
  };
  const service = createCourseCatalogService({
    firebase,
    config: { educatorWorkspaceEnabled: true },
    access: { accountFor: async () => ({ uid: 'learner-one', roles: ['learner'], organisations: [{ organisationId: 'org-one', active: true }] }) }
  });
  return { service, audit };
};

test('reviewed human narration returns only a short-lived signed URL for an eligible learner and valid module', async () => {
  const { service, audit } = catalogueHarness();
  const result = await service.narration({ authorization: 'Bearer test', courseId: 'course-alpha', version: '1.0.0', moduleId: 'first-idea', language: 'en' });
  assert.equal(result.source, 'human-narration');
  assert.match(result.url, /^\/api\/v1\/course-narration-stream\?token=[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(result).includes('private-course-audio'), false);
  assert.equal(result.sectionId, 'first-idea');
  assert.equal(audit[0].action, 'learner-course-narration-opened');
});

test('the opaque narration lease resolves server-side without returning a Storage path to the learner API', async () => {
  const { service } = catalogueHarness();
  const narration = await service.narration({ authorization: 'Bearer test', courseId: 'course-alpha', version: '1.0.0', moduleId: 'first-idea', language: 'en' });
  const token = new URL(`https://example.test${narration.url}`).searchParams.get('token');
  const stream = await service.narrationStream({ token });
  assert.match(stream.url, /^https:\/\/signed\.example\//);
  assert.equal(JSON.stringify(narration).includes('no-leak'), false);
});

test('reviewed narration rejects an unknown module instead of signing arbitrary private files', async () => {
  const { service } = catalogueHarness();
  await assert.rejects(
    service.narration({ authorization: 'Bearer test', courseId: 'course-alpha', version: '1.0.0', moduleId: 'not-a-module', language: 'en' }),
    (error) => error?.code === 'NARRATION_SECTION_UNKNOWN'
  );
});
