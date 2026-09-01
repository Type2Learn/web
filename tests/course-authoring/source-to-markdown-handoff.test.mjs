import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
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
  async delete() { this.store.records.delete(this.store.key(this.parts)); }
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
  return fileFromBuffer(name, type, bytes);
};
const fileFromBuffer = (name, type, bytes) => {
  const buffer = Buffer.from(bytes);
  return {
    name,
    type,
    size: buffer.length,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
};
const form = (values) => ({ get: (name) => values[name] ?? null });

// A tiny stored ZIP is enough to exercise the real PPTX parser without
// checking a proprietary presentation binary into the repository. CRC values
// are not used by the bounded text extractor; ZIP readers accept these local
// entries and the central directory supplies every safe size/offset.
const pptxFromSlides = (slides) => {
  const locals = [];
  const central = [];
  let offset = 0;
  slides.forEach((slide, index) => {
    const name = Buffer.from(`ppt/slides/slide${index + 1}.xml`);
    const content = Buffer.from(typeof slide === 'string' ? slide : slide.xml, 'utf8');
    const compression = typeof slide === 'object' && slide.deflate ? 8 : 0;
    const archived = compression === 8 ? deflateRawSync(content) : content;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(compression, 8);
    local.writeUInt32LE(archived.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const entry = Buffer.concat([local, name, archived]);
    locals.push(entry);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(compression, 10);
    header.writeUInt32LE(archived.length, 20);
    header.writeUInt32LE(content.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([header, name]));
    offset += entry.length;
  });
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(slides.length, 8);
  end.writeUInt16LE(slides.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
};

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

test('an administrator can deliberately remove a reviewed course from the workspace and learner catalogue without erasing its private source trail', async () => {
  const { firestore, service } = createService();
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({
      courseType: 'theory',
      organisationId: 'org-water',
      title: 'Withdrawn water course source',
      sourceFile: binaryFile('withdrawn-water.txt', 'text/plain', 'Water can move between land, water, and air. Review the water cycle in small stages.')
    })
  });
  await service.saveMarkdown({
    authorization: authorisation,
    body: {
      courseId: 'withdrawn-water-course',
      version: '1.0.0',
      submissionId: source.submission.submissionId,
      markdown: THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', 'id: withdrawn-water-course')
    }
  });
  await firestore.collection('type2learnCourseAuthoring').doc('workspace').collection('courses').doc('withdrawn-water-course@1.0.0').set({ status: 'published' }, { merge: true });

  await assert.rejects(
    service.deleteCourse({ authorization: authorisation, body: { courseId: 'withdrawn-water-course', version: '1.0.0', confirmation: 'remove' } }),
    /Type DELETE to confirm/
  );

  const removed = await service.deleteCourse({
    authorization: authorisation,
    body: { courseId: 'withdrawn-water-course', version: '1.0.0', confirmation: 'DELETE' }
  });
  assert.deepEqual(removed, {
    deleted: true,
    courseId: 'withdrawn-water-course',
    version: '1.0.0',
    wasPublished: true,
    sourceSubmissionRetained: true
  });
  assert.deepEqual((await service.listCourses({ authorization: authorisation })).courses, []);
  await assert.rejects(
    service.courseSummary({ authorization: authorisation, courseId: 'withdrawn-water-course', version: '1.0.0' }),
    /This course draft was not found/
  );
  const retainedSubmission = (await firestore.collection('type2learnCourseAuthoring').doc('workspace').collection('submissions').doc(source.submission.submissionId).get()).data();
  assert.equal(retainedSubmission.status, 'course-deleted');
  assert.equal(retainedSubmission.source.originalName, 'withdrawn-water.txt');
  const auditRecords = await firestore.collection('type2learnCourseAuthoring').doc('workspace').collection('audit').get();
  assert.ok(auditRecords.docs.some((entry) => entry.data().action === 'course-deleted-from-workspace'));
});

test('a text-based PDF is extracted privately, reports its page count, and is available only through administrator review', async () => {
  const { service } = createService();
  const pdf = await readFile(new URL('../../assets/legal/Type2Learn_Privacy_Policy.pdf', import.meta.url));
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({
      courseType: 'theory',
      organisationId: 'org-water',
      title: 'Private policy source',
      sourceFile: {
        name: 'private-policy.pdf',
        type: 'application/pdf',
        size: pdf.length,
        arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength)
      }
    })
  });

  assert.equal(source.submission.source.extraction, 'safe-pdf-text-extracted');
  assert.equal(JSON.stringify(source).includes('PRIVACY & DATA PROTECTION'), false);

  const reviewed = await service.submissionReview({ authorization: authorisation, submissionId: source.submission.submissionId });
  assert.match(reviewed.extractedText, /PRIVACY & DATA PROTECTION/);
  assert.equal(reviewed.requiresAdminTranscription, false);
});

test('a PPTX keeps its original private while extracting only visible slide text for administrator review', async () => {
  const { service } = createService();
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({
      courseType: 'theory',
      organisationId: 'org-water',
      title: 'Water cycle slides',
      sourceFile: fileFromBuffer('water-cycle.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pptxFromSlides([
        { xml: '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:t>Water moves through a cycle.</a:t></p:sld>', deflate: true },
        '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:t>Sunshine can help water evaporate.</a:t></p:sld>'
      ]))
    })
  });
  assert.equal(source.submission.source.extraction, 'safe-presentation-text-extracted');
  assert.equal(JSON.stringify(source).includes('Water moves through a cycle.'), false);
  const reviewed = await service.submissionReview({ authorization: authorisation, submissionId: source.submission.submissionId });
  assert.equal(reviewed.requiresAdminTranscription, false);
  assert.match(reviewed.extractedText, /Slide 1: Water moves through a cycle\./);
  assert.match(reviewed.extractedText, /Slide 2: Sunshine can help water evaporate\./);
});

test('an administrator can convert extracted source into canonical Markdown only after strict validation and independent critique', async () => {
  const calls = [];
  const markdown = THEORY_COURSE_TEMPLATE
    .replace('id: replace-with-course-id', 'id: water-from-source')
    .replace('English course title', 'Learning about water from source');
  const provider = {
    status: () => ({ available: true }),
    generate: async (request) => {
      calls.push(request);
      if (request.purpose === 'course-authoring-conversion') return { provider: 'gemini', text: JSON.stringify({ markdown }) };
      if (request.purpose === 'course-authoring-critique') return { provider: 'gemini', text: JSON.stringify({ decision: 'ready-for-human-review', issues: [] }) };
      throw new Error(`Unexpected purpose ${request.purpose}`);
    }
  };
  const { service } = (() => {
    const firestore = new MemoryFirestore();
    const storage = new MemoryStorage();
    const account = { uid: 'admin-1', roles: ['platform-admin'], organisations: [{ organisationId: 'org-water', active: true }] };
    return {
      service: createCourseAuthoringService({
        firebase: { available: true, firestore, storage, auth: {} }, config: { educatorWorkspaceEnabled: true },
        access: { accountFor: async () => account, assertAdmin: async () => account, assertOrganisationAccess: async () => account }, provider
      })
    };
  })();
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({
      courseType: 'theory', organisationId: 'org-water', title: 'Learning about water',
      learningGoal: 'Explain in their own words how water moves between land, water, and air.',
      intendedLearners: 'Year 7 science learners', sourceLanguage: 'en',
      sourceFile: binaryFile('water.txt', 'text/plain', 'Water moves between land, water, and air. Rain can refill a water source.')
    })
  });
  assert.equal(source.submission.authoringBrief.learningGoal, 'Explain in their own words how water moves between land, water, and air.');
  assert.equal(source.submission.authoringBrief.intendedLearners, 'Year 7 science learners');
  assert.equal(source.submission.authoringBrief.sourceLanguage, 'en');
  const conversion = await service.convertSourceToMarkdown({
    authorization: authorisation,
    body: { submissionId: source.submission.submissionId, courseId: 'water-from-source', version: '1.0.0' }
  });
  assert.equal(conversion.reviewRequired, true);
  assert.equal(conversion.readyForHumanReview, true);
  assert.equal(conversion.validation.valid, true, conversion.validation.errors.join('\n'));
  assert.match(conversion.markdown, /^format: type2learn-theory-course\/v1$/m);
  assert.deepEqual(calls.map((call) => call.purpose), ['course-authoring-conversion', 'course-authoring-critique']);
  assert.equal(calls[0].heavy, true);
  assert.equal(calls[0].allowExtendedOutput, true);
  assert.equal(calls[0].maxGeminiAttempts, 1);
  assert.equal(calls[0].timeoutMs, 18_000);
  assert.equal(calls[1].maxGeminiAttempts, 1);
  assert.equal(calls[1].timeoutMs, 12_000);
  assert.match(calls[0].instructions, /title\.en, title\.ur, label\.en, label\.ur, notice\.en, notice\.ur/);
  assert.match(calls[0].instructions, /# Module: lower-case-id/);
  assert.match(calls[0].instructions, /# Final exam/);
  assert.match(calls[0].input, /Water moves between land/);
  assert.match(calls[0].input, /Year 7 science learners/);
  assert.match(calls[0].input, /Explain in their own words how water moves/);
  assert.doesNotMatch(calls[0].input, /private-course-sources/);
  await assert.rejects(
    service.courseSummary({ authorization: authorisation, courseId: 'water-from-source', version: '1.0.0' }),
    (error) => error?.code === 'COURSE_DRAFT_NOT_FOUND'
  );
  const review = await service.submissionReview({ authorization: authorisation, submissionId: source.submission.submissionId });
  assert.equal(review.conversion.readyForHumanReview, true);
  assert.match(review.conversion.markdown, /Learning about water from source/);
  const submissions = await service.listSubmissions({ authorization: authorisation });
  assert.equal(JSON.stringify(submissions).includes('Learning about water from source'), false);
  const saved = await service.saveMarkdown({ authorization: authorisation, body: {
    courseId: 'water-from-source', version: '1.0.0', submissionId: source.submission.submissionId, markdown: conversion.markdown
  } });
  assert.equal(saved.validation.valid, true);
  assert.equal(saved.learnerManifest.id, 'water-from-source');
  assert.equal(JSON.stringify(saved.learnerManifest).includes('Year 7 science learners'), false);
  assert.equal(JSON.stringify(saved.learnerManifest).includes('Explain in their own words how water moves'), false);
});

test('a malformed model draft receives one bounded AI repair and remains review-only after the repaired schema passes', async () => {
  const calls = [];
  const repaired = THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', 'id: repaired-source-course');
  const provider = {
    status: () => ({ available: true }),
    generate: async (request) => {
      calls.push(request);
      if (request.purpose === 'course-authoring-conversion') return { provider: 'gemini', text: JSON.stringify({ markdown: '---\nformat: wrong\nid: bad\n---\n# Module: broken' }) };
      if (request.purpose === 'course-authoring-repair') return { provider: 'openai', text: JSON.stringify({ markdown: repaired }) };
      if (request.purpose === 'course-authoring-critique') return { provider: 'gemini', text: JSON.stringify({ decision: 'ready-for-human-review', issues: [] }) };
      throw new Error(`Unexpected purpose ${request.purpose}`);
    }
  };
  const firestore = new MemoryFirestore();
  const storage = new MemoryStorage();
  const account = { uid: 'admin-1', roles: ['platform-admin'], organisations: [{ organisationId: 'org-water', active: true }] };
  const service = createCourseAuthoringService({
    firebase: { available: true, firestore, storage, auth: {} }, config: { educatorWorkspaceEnabled: true },
    access: { accountFor: async () => account, assertAdmin: async () => account, assertOrganisationAccess: async () => account }, provider
  });
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({ courseType: 'theory', organisationId: 'org-water', title: 'Repaired source', sourceFile: binaryFile('repair.txt', 'text/plain', 'A long enough source paragraph explains an educational concept with reviewed context for a lesson.') })
  });
  const conversion = await service.convertSourceToMarkdown({ authorization: authorisation, body: { submissionId: source.submission.submissionId, courseId: 'repaired-source-course', version: '1.0.0' } });
  assert.equal(conversion.validation.valid, true, conversion.validation.errors.join('\n'));
  assert.equal(conversion.reviewRequired, true);
  assert.deepEqual(calls.map((call) => call.purpose), ['course-authoring-conversion', 'course-authoring-repair', 'course-authoring-critique']);
  assert.ok(conversion.stages.some((stage) => stage.id === 'ai-structure-repair' && stage.passed));
});

test('a long source conversion persists a running state, prevents duplicate jobs, and later saves its reviewed draft', async () => {
  let releaseConversion;
  const conversionPending = new Promise((resolve) => { releaseConversion = resolve; });
  const markdown = THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', 'id: background-water-course');
  const provider = {
    status: () => ({ available: true }),
    generate: async (request) => {
      if (request.purpose === 'course-authoring-conversion') return conversionPending;
      if (request.purpose === 'course-authoring-critique') return { provider: 'gemini', text: JSON.stringify({ decision: 'ready-for-human-review', issues: [] }) };
      throw new Error(`Unexpected purpose ${request.purpose}`);
    }
  };
  const firestore = new MemoryFirestore();
  const storage = new MemoryStorage();
  const account = { uid: 'admin-1', roles: ['platform-admin'], organisations: [{ organisationId: 'org-water', active: true }] };
  const service = createCourseAuthoringService({
    firebase: { available: true, firestore, storage, auth: {} }, config: { educatorWorkspaceEnabled: true },
    access: { accountFor: async () => account, assertAdmin: async () => account, assertOrganisationAccess: async () => account }, provider
  });
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({ courseType: 'theory', organisationId: 'org-water', title: 'Background water source', sourceFile: binaryFile('background-water.txt', 'text/plain', 'Water moves between land, water, and air. Rain can refill a water source.') })
  });
  const body = { submissionId: source.submission.submissionId, courseId: 'background-water-course', version: '1.0.0', background: true };
  const queued = await service.convertSourceToMarkdown({ authorization: authorisation, body });
  assert.deepEqual(queued, { submissionId: source.submission.submissionId, courseId: 'background-water-course', version: '1.0.0', queued: true, state: 'running', reviewRequired: true });
  const running = await service.submissionReview({ authorization: authorisation, submissionId: source.submission.submissionId });
  assert.equal(running.submission.status, 'conversion-running');
  assert.equal(running.conversion.state, 'running');
  assert.equal(running.conversion.markdown, '');
  const duplicate = await service.convertSourceToMarkdown({ authorization: authorisation, body });
  assert.equal(duplicate.state, 'running');
  releaseConversion({ provider: 'gemini', text: JSON.stringify({ markdown }) });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const complete = await service.submissionReview({ authorization: authorisation, submissionId: source.submission.submissionId });
  assert.equal(complete.conversion.state, 'complete');
  assert.equal(complete.conversion.readyForHumanReview, true);
  assert.match(complete.conversion.markdown, /^format: type2learn-theory-course\/v1$/m);
});

test('a failed background conversion is persisted as a reviewable failure instead of leaving the source reviewed forever', async () => {
  const provider = { status: () => ({ available: true }), generate: async () => { throw new Error('provider unavailable'); } };
  const firestore = new MemoryFirestore();
  const storage = new MemoryStorage();
  const account = { uid: 'admin-1', roles: ['platform-admin'], organisations: [{ organisationId: 'org-water', active: true }] };
  const service = createCourseAuthoringService({
    firebase: { available: true, firestore, storage, auth: {} }, config: { educatorWorkspaceEnabled: true },
    access: { accountFor: async () => account, assertAdmin: async () => account, assertOrganisationAccess: async () => account }, provider
  });
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({ courseType: 'theory', organisationId: 'org-water', title: 'Unavailable model source', sourceFile: binaryFile('unavailable.txt', 'text/plain', 'This source contains enough text for a course conversion attempt, but the configured model is unavailable today.') })
  });
  await service.convertSourceToMarkdown({ authorization: authorisation, body: { submissionId: source.submission.submissionId, courseId: 'unavailable-model-course', version: '1.0.0', background: true } });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const review = await service.submissionReview({ authorization: authorisation, submissionId: source.submission.submissionId });
  assert.equal(review.submission.status, 'conversion-needs-review');
  assert.equal(review.conversion.state, 'failed');
  assert.match(review.conversion.failure, /Automated conversion did not complete/);
  assert.equal(review.conversion.markdown, '');
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

test('an administrator can review canonical Markdown one module at a time without exposing it through the learner summary', async () => {
  const { service } = createService();
  const markdown = THEORY_COURSE_TEMPLATE.replace('id: replace-with-course-id', 'id: reviewable-course');
  await service.saveMarkdown({ authorization: authorisation, body: { courseId: 'reviewable-course', version: '1.0.0', markdown } });

  const review = await service.courseReview({ authorization: authorisation, courseId: 'reviewable-course', version: '1.0.0' });
  assert.match(review.markdown, /^# Module: first-module/m);
  assert.equal(review.learnerManifest.modules[0].id, 'first-module');

  const learnerSummary = await service.courseSummary({ authorization: authorisation, courseId: 'reviewable-course', version: '1.0.0' });
  assert.equal(Object.hasOwn(learnerSummary, 'markdown'), false);
});

test('direct administrator intake uses controlled private source ownership without requiring a teacher submission', async () => {
  const { firestore, service } = createService();
  const source = await service.submitSource({
    authorization: authorisation,
    form: form({ courseType: 'theory', title: 'Administrator source', sourceFile: binaryFile('reviewed.txt', 'text/plain', 'Private reviewed source') })
  });
  const record = (await firestore.collection('type2learnCourseAuthoring').doc('workspace').collection('submissions').doc(source.submission.submissionId).get()).data();
  assert.equal(record.ownerOrganisationId, 'org-water');
  assert.equal(source.submission.source.extraction, 'safe-text-extracted');
});
