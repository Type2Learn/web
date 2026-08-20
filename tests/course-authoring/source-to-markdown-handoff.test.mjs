import assert from 'node:assert/strict';
import test from 'node:test';
import { createCourseAuthoringService } from '../../server/course-authoring-service.mjs';
import { THEORY_COURSE_TEMPLATE } from '../../server/theory-course-markdown.mjs';

// A compact Firestore/Storage double exercises the service boundary without
// credentials. It intentionally implements only the document operations used
// by source submission, human review, Markdown compilation and source export.
class MemoryFirestore {
  constructor() { this.records = new Map(); this.sequence = 0; }
  key(parts) { return parts.join('/'); }
  collection(name) { return new MemoryCollection(this, [name]); }
}

class MemoryCollection {
  constructor(store, parts) { this.store = store; this.parts = parts; }
  doc(id) { return new MemoryDocument(this.store, [...this.parts, String(id)]); }
  async add(value) { const reference = this.doc(`entry-${++this.store.sequence}`); await reference.set(value); return reference; }
  orderBy() { return this; }
  limit() { return this; }
  async get() {
    const prefix = `${this.store.key(this.parts)}/`;
    const depth = this.parts.length + 1;
    return {
      docs: [...this.store.records.entries()]
        .filter(([key]) => key.startsWith(prefix) && key.split('/').length === depth)
        .map(([key, value]) => ({ id: key.split('/').at(-1), data: () => structuredClone(value) }))
    };
  }
}

class MemoryDocument {
  constructor(store, parts) { this.store = store; this.parts = parts; }
  collection(name) { return new MemoryCollection(this.store, [...this.parts, String(name)]); }
  async get() {
    const value = this.store.records.get(this.store.key(this.parts));
    return { exists: value !== undefined, data: () => value === undefined ? undefined : structuredClone(value), ref: this };
  }
  async set(value, options = {}) {
    const key = this.store.key(this.parts);
    const current = this.store.records.get(key) || {};
    this.store.records.set(key, structuredClone(options.merge ? { ...current, ...value } : value));
  }
}

class MemoryStorage {
  constructor() { this.objects = new Map(); }
  file(path) {
    return {
      save: async (value) => { this.objects.set(path, Buffer.from(value)); },
      download: async () => {
        if (!this.objects.has(path)) throw new Error('not found');
        return [Buffer.from(this.objects.get(path))];
      }
    };
  }
}

const authorisation = 'Bearer administrator-test';
const binaryFile = (name, type, content) => {
  const bytes = Buffer.from(content, 'utf8');
  return {
    name,
    type,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
};
const form = (values) => ({ get: (name) => values[name] ?? null });

const createService = () => {
  const firestore = new MemoryFirestore();
  const storage = new MemoryStorage();
  const account = { uid: 'admin-1', roles: ['platform-admin'], organisations: [{ organisationId: 'org-water', active: true }] };
  return {
    firestore,
    service: createCourseAuthoringService({
      firebase: { available: true, firestore, storage, auth: {} },
      config: { educatorWorkspaceEnabled: true },
      access: {
        accountFor: async () => account,
        assertAdmin: async () => account,
        assertOrganisationAccess: async () => account
      },
      provider: { status: () => ({ available: false }) }
    })
  };
};

test('a private non-text teacher source can be reviewed, downloaded by an admin, and linked to its reviewed Markdown course', async () => {
  const { firestore, service } = createService();
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({
      courseType: 'theory',
      organisationId: 'org-water',
      title: 'Water conservation notes',
      sourceFile: binaryFile('water-notes.pdf', 'application/pdf', '%PDF-safe-course-source')
    })
  });

  assert.equal(source.submission.source.extraction, 'requires-admin-transcription');
  assert.equal(JSON.stringify(source).includes('%PDF-safe-course-source'), false);

  const reviewed = await service.submissionReview({ authorization: authorisation, submissionId: source.submission.submissionId });
  assert.equal(reviewed.submission.status, 'source-reviewed');
  assert.equal(reviewed.requiresAdminTranscription, true);
  assert.equal(reviewed.downloadAvailable, true);

  const downloaded = await service.downloadSource({ authorization: authorisation, submissionId: source.submission.submissionId });
  assert.equal(downloaded.filename, 'water-notes.pdf');
  assert.equal(downloaded.contentType, 'application/pdf');
  assert.equal(downloaded.buffer.toString('utf8'), '%PDF-safe-course-source');

  const saved = await service.saveMarkdown({
    authorization: authorisation,
    body: {
      courseId: 'new-theory-course',
      version: '1.0.0',
      ownerOrganisationId: 'org-water',
      submissionId: source.submission.submissionId,
      markdown: THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', 'id: new-theory-course')
    }
  });
  assert.equal(saved.validation.valid, true, saved.validation.errors.join('\n'));
  assert.equal(saved.course.status, 'validation-ready');
  assert.equal(JSON.stringify(saved.course).includes('correctOption'), false);
  assert.equal(saved.learnerManifest.id, 'new-theory-course');
  assert.equal(JSON.stringify(saved.learnerManifest).includes('correctOption'), false);
  assert.equal(JSON.stringify(saved.learnerManifest).includes('%PDF-safe-course-source'), false);

  const summary = await service.courseSummary({ authorization: authorisation, courseId: 'new-theory-course', version: '1.0.0' });
  assert.equal(summary.learnerManifest.title.en, 'English course title');
  assert.equal(JSON.stringify(summary.learnerManifest).includes('correctOption'), false);
  assert.equal(JSON.stringify(summary).includes('%PDF-safe-course-source'), false);

  const submissionRecord = (await firestore.collection('type2learnCourseAuthoring').doc('workspace').collection('submissions').doc(source.submission.submissionId).get()).data();
  assert.equal(submissionRecord.status, 'validation-ready');
  assert.equal(submissionRecord.courseId, 'new-theory-course');
  assert.equal(submissionRecord.version, '1.0.0');

  // An administrator can correct Markdown later without having to re-enter
  // the private source ID; that edit must not sever the review/audit link.
  await service.saveMarkdown({
    authorization: authorisation,
    body: { courseId: 'new-theory-course', version: '1.0.0', markdown: THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', 'id: new-theory-course') }
  });
  const courseRecord = (await firestore.collection('type2learnCourseAuthoring').doc('workspace').collection('courses').doc('new-theory-course@1.0.0').get()).data();
  assert.equal(courseRecord.submissionId, source.submission.submissionId);
});

test('reviewed Markdown cannot silently diverge from the form identifiers or source organisation', async () => {
  const { service } = createService();
  const markdown = THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', 'id: valid-course-id');
  await assert.rejects(
    service.saveMarkdown({ authorization: authorisation, body: { courseId: 'different-course-id', version: '1.0.0', markdown } }),
    (error) => error?.code === 'MARKDOWN_COURSE_ID_MISMATCH'
  );

  const source = await service.submitSource({
    authorization: authorisation,
    form: form({ courseType: 'theory', organisationId: 'org-water', sourceFile: binaryFile('notes.txt', 'text/plain', 'Reviewed notes') })
  });
  await assert.rejects(
    service.saveMarkdown({ authorization: authorisation, body: { courseId: 'valid-course-id', version: '1.0.0', ownerOrganisationId: 'another-org', submissionId: source.submission.submissionId, markdown } }),
    (error) => error?.code === 'SOURCE_OWNERSHIP_MISMATCH'
  );
});

test('an administrator can directly compile, inspect, and enter review for a reviewed Markdown course without a teacher submission', async () => {
  const { service } = createService();
  const markdown = THEORY_COURSE_TEMPLATE
    .replace('id: replace-with-course-id', 'id: direct-admin-course')
    .replace('English course title', 'Direct administrator course');
  const saved = await service.saveMarkdown({
    authorization: authorisation,
    body: { courseId: 'direct-admin-course', version: '1.0.0', markdown }
  });

  assert.equal(saved.validation.valid, true, saved.validation.errors.join('\n'));
  assert.equal(saved.course.ownerOrganisationId, '');
  assert.equal(saved.learnerManifest.title.en, 'Direct administrator course');
  assert.equal(JSON.stringify(saved.learnerManifest).includes('correctOption'), false);

  const inspected = await service.courseSummary({ authorization: authorisation, courseId: 'direct-admin-course', version: '1.0.0' });
  assert.equal(inspected.course.status, 'validation-ready');
  assert.equal(inspected.learnerManifest.modules[0].en.title, 'One small idea');
  assert.equal(JSON.stringify(inspected).includes('privateManifest'), false);

  const review = await service.transition({
    authorization: authorisation,
    body: { courseId: 'direct-admin-course', version: '1.0.0', status: 'admin-review', reviewNote: 'Direct administrator Markdown review.' }
  });
  assert.equal(review.course.status, 'admin-review');
});
