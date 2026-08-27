import assert from 'node:assert/strict';
import test from 'node:test';
import { createCourseAuthoringService } from '../../server/course-authoring-service.mjs';
import { THEORY_COURSE_TEMPLATE } from '../../server/theory-course-markdown.mjs';

class Documents {
  constructor(store, parts) { this.store = store; this.parts = parts; }
  collection(name) { return new Collections(this.store, [...this.parts, name]); }
  async get() { const value = this.store.values.get(this.parts.join('/')); return { exists: value !== undefined, data: () => structuredClone(value), ref: this }; }
  async set(value, options = {}) { const key = this.parts.join('/'); this.store.values.set(key, structuredClone(options.merge ? { ...(this.store.values.get(key) || {}), ...value } : value)); }
}
class Collections {
  constructor(store, parts) { this.store = store; this.parts = parts; }
  doc(id) { return new Documents(this.store, [...this.parts, id]); }
  async add(value) { const document = this.doc(`audit-${++this.store.sequence}`); await document.set(value); return document; }
  orderBy() { return this; }
  limit() { return this; }
  async get() { return { docs: [] }; }
}
class Store { constructor() { this.values = new Map(); this.sequence = 0; } collection(name) { return new Collections(this, [name]); } }
class Storage { constructor() { this.values = new Map(); } file(path) { return { save: async (content) => this.values.set(path, Buffer.from(content)), download: async () => [this.values.get(path)] }; } }

const authorization = 'Bearer admin';
const account = { uid: 'admin', roles: ['platform-admin'], organisations: [] };
const create = ({ provider = null, speech = null } = {}) => {
  const firestore = new Store();
  const storage = new Storage();
  return { firestore, storage, service: createCourseAuthoringService({
    firebase: { available: true, firestore, storage, auth: {} }, config: { educatorWorkspaceEnabled: true },
    access: { accountFor: async () => account, assertAdmin: async () => account, assertOrganisationAccess: async () => account }, provider, speech
  }) };
};

const save = (service, id = 'enhanced-course') => service.saveMarkdown({ authorization, body: {
  courseId: id, version: '1.0.0', markdown: THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', `id: ${id}`)
} });

test('review-only AI translation returns a bounded draft and leaves reviewed Markdown unchanged', async () => {
  const provider = {
    status: () => ({ available: true }),
    generate: async ({ purpose, input }) => {
      assert.equal(purpose, 'course-authoring-translation');
      assert.match(input, /English source/);
      return { provider: 'gemini', text: JSON.stringify({ translation: 'اردو ترجمہ' }) };
    }
  };
  const { service } = create({ provider });
  await save(service);
  const translated = await service.translateReviewedText({ authorization, body: { sourceLanguage: 'en', text: 'English source' } });
  assert.equal(translated.translation, 'اردو ترجمہ');
  assert.equal(translated.targetLanguage, 'ur');
  const review = await service.courseReview({ authorization, courseId: 'enhanced-course', version: '1.0.0' });
  assert.match(review.markdown, /English course title/);
  assert.doesNotMatch(review.markdown, /اردو ترجمہ/);
});

test('review-only Urdu to English translation preserves direction and does not publish a draft', async () => {
  const provider = {
    status: () => ({ available: true }),
    generate: async ({ purpose, input }) => {
      assert.equal(purpose, 'course-authoring-translation');
      assert.match(input, /"sourceLanguage":"ur"/);
      assert.match(input, /"targetLanguage":"en"/);
      return { provider: 'gemini', text: JSON.stringify({ translation: 'Clear English review text.' }) };
    }
  };
  const { service } = create({ provider });
  await save(service, 'urdu-translation-course');
  const translated = await service.translateReviewedText({ authorization, body: { sourceLanguage: 'ur', text: 'نظر ثانی کا متن' } });
  assert.equal(translated.translation, 'Clear English review text.');
  assert.equal(translated.sourceLanguage, 'ur');
  assert.equal(translated.targetLanguage, 'en');
  const review = await service.courseReview({ authorization, courseId: 'urdu-translation-course', version: '1.0.0' });
  assert.doesNotMatch(review.markdown, /Clear English review text/);
});

test('generated narration uses reviewed module text, saves it privately, and records no learner-facing path', async () => {
  const speech = {
    status: () => ({ textToSpeech: { available: true } }),
    synthesise: async ({ body }) => {
      assert.equal(body.language, 'en');
      assert.match(body.text, /One small idea/);
      return { audio: Buffer.from('RIFF____WAVEgenerated'), contentType: 'audio/wav' };
    }
  };
  const { storage, service } = create({ speech });
  await save(service, 'narration-course');
  const result = await service.generateNarration({ authorization, body: { courseId: 'narration-course', version: '1.0.0', sectionId: 'first-module', locale: 'en' } });
  assert.equal(result.narration.generatedAudioCount, 1);
  assert.match(result.scriptPreview, /One small idea/);
  assert.equal([...storage.values.keys()].some((key) => key.includes('private-course-audio/narration-course/1.0.0/en/first-module')), true);
  const summary = await service.courseSummary({ authorization, courseId: 'narration-course', version: '1.0.0' });
  assert.equal(JSON.stringify(summary).includes('private-course-audio'), false);
});

test('an administrator module edit revalidates the complete canonical course without exposing its private manifest', async () => {
  const { service } = create();
  const initial = THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', 'id: edited-module-course');
  await service.saveMarkdown({ authorization, body: { courseId: 'edited-module-course', version: '1.0.0', markdown: initial } });
  const edited = initial.replace('One small idea', 'One reviewed small idea');
  const saved = await service.saveMarkdown({ authorization, body: { courseId: 'edited-module-course', version: '1.0.0', markdown: edited } });
  assert.equal(saved.validation.valid, true, saved.validation.errors.join('\n'));
  assert.equal(saved.learnerManifest.modules[0].en.title, 'One reviewed small idea');
  const review = await service.courseReview({ authorization, courseId: 'edited-module-course', version: '1.0.0' });
  assert.match(review.markdown, /# Module: first-module\n/);
  assert.match(review.markdown, /One reviewed small idea/);
  const learnerSummary = await service.courseSummary({ authorization, courseId: 'edited-module-course', version: '1.0.0' });
  assert.equal(Object.hasOwn(learnerSummary, 'markdown'), false);
  assert.equal(JSON.stringify(learnerSummary).includes('privateManifest'), false);
});
