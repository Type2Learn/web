import { createHash, randomUUID } from 'node:crypto';
import { apiError } from './errors.mjs';
import { isTheoryCourseType } from './access-policy.mjs';
import { compileTheoryCourse, fallbackMcqDraft, parseTheoryMarkdown, validateTheoryCourse } from './theory-course-markdown.mjs';

const ROOT = 'type2learnCourseAuthoring';
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_MARKDOWN_CHARS = 220_000;
const MAX_AI_SOURCE_CHARS = 12_000;
const workflowStates = new Set(['submitted', 'source-reviewed', 'markdown-draft', 'validation-ready', 'ai-draft-ready', 'admin-review', 'audio-ready', 'backups-pending', 'backups-verified', 'approved', 'published', 'returned', 'rejected']);
const adminReviewStates = new Set(['source-reviewed', 'markdown-draft', 'validation-ready', 'ai-draft-ready', 'admin-review', 'audio-ready', 'backups-pending', 'backups-verified', 'approved', 'published', 'returned', 'rejected']);
const blockedSourceExtensions = new Set(['exe', 'dll', 'msi', 'bat', 'cmd', 'com', 'ps1', 'sh', 'jar', 'apk', 'app']);
const supportedTextExtensions = new Set(['md', 'markdown', 'txt', 'csv']);
const supportedAudioExtensions = new Set(['mp3', 'm4a', 'wav', 'ogg', 'webm']);

const nowIso = () => new Date().toISOString();
const clean = (value, limit = 200) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
const identifier = (value, limit = 80) => String(value || '').trim().replace(/[^a-z0-9-]/gi, '').slice(0, limit).toLowerCase();
const slug = (value) => identifier(value, 80).replace(/^-+|-+$/g, '');
const extensionOf = (name) => {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match ? match[1] : '';
};
const fileHash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const sourceCollection = (firestore, name) => firestore.collection(ROOT).doc('workspace').collection(name);
const audit = (firestore, entry) => sourceCollection(firestore, 'audit').add({ ...entry, createdAt: nowIso() });
const courseDoc = (firestore, courseId, version) => sourceCollection(firestore, 'courses').doc(`${courseId}@${version}`);
const publicCourse = (record = {}) => ({
  courseId: record.courseId || '',
  version: record.version || '',
  type: record.type || 'theory',
  status: record.status || 'submitted',
  ownerOrganisationId: record.ownerOrganisationId || '',
  requestedAudience: record.requestedAudience || 'organisation',
  title: record.title || { en: '', ur: '' },
  updatedAt: record.updatedAt || '',
  createdAt: record.createdAt || '',
  narration: record.narration || { humanAudioCount: 0, fallback: 'device-text-to-speech' },
  backups: {
    firebase: Boolean(record.backups?.firebase?.verified),
    github: Boolean(record.backups?.github?.verified),
    supabase: Boolean(record.backups?.supabase?.verified),
    zip: Boolean(record.backups?.zip?.verified && record.backups?.zip?.downloadedAt)
  }
});
const publicSubmission = (record = {}) => ({
  submissionId: record.submissionId || '',
  status: record.status || 'submitted',
  type: record.type || 'theory',
  ownerOrganisationId: record.ownerOrganisationId || '',
  submittedTitle: record.submittedTitle || '',
  source: { originalName: record.source?.originalName || '', extraction: record.source?.extraction || '', bytes: record.source?.bytes || 0 },
  createdAt: record.createdAt || '',
  updatedAt: record.updatedAt || ''
});

const requireService = ({ firebase, config }) => {
  if (!config?.educatorWorkspaceEnabled) throw apiError(503, 'EDUCATOR_WORKSPACE_DISABLED', 'The private educator workspace is not enabled yet.');
  if (!firebase?.available || !firebase.firestore || !firebase.auth) throw apiError(503, 'COURSE_WORKSPACE_NOT_CONFIGURED', 'Course authoring is not connected yet.');
};

const canSubmit = (account) => account.roles.includes('platform-admin') || account.roles.includes('teacher') || account.roles.includes('institute-owner');
const canReadCourse = (account, record) => account.roles.includes('platform-admin')
  || record.createdBy === account.uid
  || account.organisations.some((entry) => entry.organisationId === record.ownerOrganisationId && entry.active !== false);

const noSecrets = (record) => {
  const copy = { ...record };
  delete copy.privateManifest;
  delete copy.markdown;
  delete copy.sourceText;
  delete copy.aiSourceExcerpt;
  return publicCourse(copy);
};

const sourceFileInfo = async (file) => {
  if (!file || typeof file.arrayBuffer !== 'function') throw apiError(400, 'SOURCE_FILE_REQUIRED', 'Choose a course source file.');
  const bytes = Number(file.size) || 0;
  if (bytes < 1) throw apiError(400, 'SOURCE_FILE_EMPTY', 'The source file is empty.');
  if (bytes > MAX_SOURCE_BYTES) throw apiError(413, 'SOURCE_FILE_TOO_LARGE', 'Course source files must be 25 MB or smaller.');
  const originalName = clean(file.name, 150) || 'course-source';
  const extension = extensionOf(originalName);
  if (blockedSourceExtensions.has(extension)) throw apiError(400, 'SOURCE_FILE_NOT_ALLOWED', 'Executable or script files cannot be uploaded as course source material.');
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    buffer,
    originalName,
    extension,
    contentType: clean(file.type, 100) || 'application/octet-stream',
    sha256: fileHash(buffer),
    text: supportedTextExtensions.has(extension) ? buffer.toString('utf8').slice(0, MAX_MARKDOWN_CHARS) : '',
    extraction: supportedTextExtensions.has(extension) ? 'safe-text-extracted' : 'requires-admin-transcription'
  };
};

const aiSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['drafts'],
  properties: {
    drafts: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['moduleId', 'field', 'language', 'text'],
        properties: {
          moduleId: { type: 'string', maxLength: 80 },
          field: { type: 'string', enum: ['simple', 'example', 'hint', 'check'] },
          language: { type: 'string', enum: ['en', 'ur'] },
          text: { type: 'string', maxLength: 700 }
        }
      }
    }
  }
};

const safeAiDraft = (payload) => ({
  drafts: Array.isArray(payload?.drafts) ? payload.drafts.map((draft) => ({
    moduleId: slug(draft?.moduleId),
    field: ['simple', 'example', 'hint', 'check'].includes(draft?.field) ? draft.field : '',
    language: draft?.language === 'ur' ? 'ur' : draft?.language === 'en' ? 'en' : '',
    text: clean(draft?.text, 700),
    source: 'ai-draft',
    reviewRequired: true
  })).filter((draft) => draft.moduleId && draft.field && draft.language && draft.text) : []
});

export const createCourseAuthoringService = ({ firebase, config, access, provider }) => {
  const accountFor = async (authorization) => {
    requireService({ firebase, config });
    return access.accountFor(authorization);
  };
  const requireAdmin = async (authorization) => {
    requireService({ firebase, config });
    return access.assertAdmin(authorization);
  };
  const courseFor = async (courseId, version) => {
    const snapshot = await courseDoc(firebase.firestore, identifier(courseId), clean(version, 32)).get();
    if (!snapshot.exists) throw apiError(404, 'COURSE_DRAFT_NOT_FOUND', 'This course draft was not found.');
    return { reference: snapshot.ref, record: snapshot.data() || {} };
  };

  return {
    status: () => ({
      enabled: Boolean(config?.educatorWorkspaceEnabled),
      firebase: Boolean(firebase?.available && firebase.firestore),
      privateSourceStorage: Boolean(firebase?.storage),
      theoryOnly: true,
      aiDrafting: Boolean(provider?.status?.().available),
      maxSourceBytes: MAX_SOURCE_BYTES
    }),

    async submitSource({ authorization, form }) {
      const account = await accountFor(authorization);
      if (!canSubmit(account)) throw apiError(403, 'COURSE_SUBMISSION_DENIED', 'A teacher, institute owner, or administrator account is required to submit a course.');
      if (!firebase.storage) throw apiError(503, 'PRIVATE_SOURCE_STORAGE_NOT_CONFIGURED', 'Private course-source storage is not configured yet.');
      const type = String(form?.get('courseType') || '');
      if (!isTheoryCourseType(type)) throw apiError(400, 'COURSE_TYPE_LOCKED', 'Only theory courses are supported at this time.');
      const organisationId = identifier(form?.get('organisationId')) || account.organisations.find((entry) => entry.active !== false)?.organisationId || '';
      if (!organisationId) throw apiError(400, 'ORGANISATION_REQUIRED', 'Choose the organisation that owns this course submission.');
      await access.assertOrganisationAccess(authorization, organisationId);
      const source = await sourceFileInfo(form?.get('sourceFile'));
      const submissionId = `sub_${randomUUID().replace(/-/g, '')}`;
      const objectPath = `private-course-sources/${organisationId}/${submissionId}/${source.sha256}.${source.extension || 'bin'}`;
      await firebase.storage.file(objectPath).save(source.buffer, {
        resumable: false,
        contentType: source.contentType,
        metadata: { metadata: { submissionId, sha256: source.sha256, originalName: source.originalName } }
      });
      const record = {
        submissionId,
        type,
        ownerOrganisationId: organisationId,
        createdBy: account.uid,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        status: 'submitted',
        submittedTitle: clean(form?.get('title'), 160),
        source: {
          originalName: source.originalName,
          contentType: source.contentType,
          bytes: source.buffer.length,
          sha256: source.sha256,
          objectPath,
          extraction: source.extraction,
          extractedText: source.text
        }
      };
      await sourceCollection(firebase.firestore, 'submissions').doc(submissionId).set(record);
      await audit(firebase.firestore, { actorUid: account.uid, action: 'course-source-submitted', submissionId, organisationId, type });
      return { submission: publicSubmission(record) };
    },

    async listSubmissions({ authorization }) {
      const account = await accountFor(authorization);
      const snapshot = await sourceCollection(firebase.firestore, 'submissions').orderBy('updatedAt', 'desc').limit(100).get();
      const submissions = snapshot.docs.map((document) => document.data() || {}).filter((record) => canReadCourse(account, record));
      return { submissions: submissions.map(publicSubmission) };
    },

    async submissionReview({ authorization, submissionId }) {
      const admin = await requireAdmin(authorization);
      const id = clean(submissionId, 96);
      const snapshot = await sourceCollection(firebase.firestore, 'submissions').doc(id).get();
      if (!snapshot.exists) throw apiError(404, 'SUBMISSION_NOT_FOUND', 'This course submission was not found.');
      const record = snapshot.data() || {};
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-source-review-opened', submissionId: id, organisationId: record.ownerOrganisationId });
      return {
        submission: publicSubmission(record),
        extractedText: record.source?.extraction === 'safe-text-extracted' ? String(record.source?.extractedText || '') : '',
        requiresAdminTranscription: record.source?.extraction !== 'safe-text-extracted'
      };
    },

    async listCourses({ authorization }) {
      const account = await accountFor(authorization);
      const snapshot = await sourceCollection(firebase.firestore, 'courses').orderBy('updatedAt', 'desc').limit(100).get();
      return { courses: snapshot.docs.map((document) => document.data() || {}).filter((record) => canReadCourse(account, record)).map(noSecrets) };
    },

    async saveMarkdown({ authorization, body }) {
      const admin = await requireAdmin(authorization);
      const markdown = String(body?.markdown || '');
      if (!markdown || markdown.length > MAX_MARKDOWN_CHARS) throw apiError(400, 'MARKDOWN_SIZE_INVALID', 'The Markdown file must be between 1 and 220,000 characters.');
      const parsed = parseTheoryMarkdown(markdown);
      const validation = validateTheoryCourse(parsed);
      const metadata = validation.metadata || {};
      const courseId = identifier(body?.courseId || metadata.id);
      const version = clean(body?.version || metadata.version, 32);
      if (!courseId || !version) throw apiError(400, 'COURSE_ID_AND_VERSION_REQUIRED', 'Markdown metadata needs a valid course id and version.');
      let compiled = null;
      if (validation.valid) compiled = compileTheoryCourse(validation);
      const existing = await courseDoc(firebase.firestore, courseId, version).get();
      const existingRecord = existing.exists ? existing.data() || {} : {};
      const record = {
        ...existingRecord,
        courseId,
        version,
        type: 'theory',
        ownerOrganisationId: identifier(body?.ownerOrganisationId || existingRecord.ownerOrganisationId),
        submissionId: identifier(body?.submissionId || existingRecord.submissionId),
        createdBy: existingRecord.createdBy || admin.uid,
        createdAt: existingRecord.createdAt || nowIso(),
        updatedAt: nowIso(),
        updatedBy: admin.uid,
        markdown,
        validation: { valid: validation.valid, errors: validation.errors },
        title: { en: metadata['title.en'] || '', ur: metadata['title.ur'] || '' },
        status: validation.valid ? 'validation-ready' : 'markdown-draft',
        learnerManifest: compiled?.learnerManifest || null,
        privateManifest: compiled?.privateManifest || null,
        narration: existingRecord.narration || { humanAudioCount: 0, fallback: 'device-text-to-speech' },
        backups: existingRecord.backups || { firebase: false, github: false, supabase: false, zip: false },
        requestedAudience: existingRecord.requestedAudience || 'organisation'
      };
      await courseDoc(firebase.firestore, courseId, version).set(record);
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-markdown-saved', courseId, version, status: record.status, validationErrors: validation.errors.length });
      return { course: noSecrets(record), validation: record.validation };
    },

    async generateAiDraft({ authorization, body }) {
      const admin = await requireAdmin(authorization);
      if (!provider?.status?.().available) throw apiError(503, 'AI_DRAFTING_NOT_CONFIGURED', 'AI drafting is not configured. You can continue with the deterministic authoring template.');
      const { reference, record } = await courseFor(body?.courseId, body?.version);
      const excerpt = clean(body?.sourceExcerpt, MAX_AI_SOURCE_CHARS);
      if (!excerpt) throw apiError(400, 'REVIEWED_SOURCE_REQUIRED', 'Paste the reviewed source excerpt that the draft may use.');
      const missingFields = Array.isArray(body?.missingFields) ? body.missingFields.map((field) => clean(field, 30)).filter((field) => ['simple', 'example', 'hint', 'check'].includes(field)) : ['simple', 'example', 'hint', 'check'];
      const result = await provider.generate({
        purpose: 'course-authoring-draft',
        instructions: [
          'You draft only missing, non-diagnostic Type2Learn theory-course material.',
          'Use only the reviewed source excerpt. Do not introduce factual claims, diagnoses, learner profiles, grades, or personal data.',
          'Return concise draft text in the requested schema. Every draft requires administrator review before use.'
        ].join(' '),
        input: JSON.stringify({ courseId: record.courseId, version: record.version, sourceExcerpt: excerpt, requestedFields: missingFields }),
        jsonSchema: aiSchema,
        maxOutputTokens: 1800
      });
      let generated;
      try { generated = safeAiDraft(JSON.parse(result.text)); } catch { throw apiError(502, 'AI_DRAFT_INVALID', 'The AI draft was not in the required format. No course content was changed.'); }
      const aiDraft = { ...generated, provider: result.provider, createdAt: nowIso(), createdBy: admin.uid, reviewRequired: true };
      await reference.set({ aiDraft, status: 'ai-draft-ready', updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-ai-draft-created', courseId: record.courseId, version: record.version, provider: result.provider, draftCount: generated.drafts.length });
      return { aiDraft: { ...aiDraft, provider: result.provider }, course: noSecrets({ ...record, status: 'ai-draft-ready' }) };
    },

    async createDeterministicMcqDraft({ authorization, body }) {
      const admin = await requireAdmin(authorization);
      const { reference, record } = await courseFor(body?.courseId, body?.version);
      const draft = fallbackMcqDraft({ prompt: body?.prompt, answer: body?.answer, distractors: Array.isArray(body?.distractors) ? body.distractors : [] });
      if (!draft.question || !draft.options.every(Boolean)) throw apiError(400, 'MCQ_DRAFT_INCOMPLETE', 'Provide a reviewed question, correct answer, and useful distractors.');
      const deterministicDrafts = [...(record.deterministicDrafts || []), { ...draft, createdAt: nowIso(), createdBy: admin.uid }];
      await reference.set({ deterministicDrafts, status: 'ai-draft-ready', updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-deterministic-mcq-created', courseId: record.courseId, version: record.version });
      return { draft, reviewRequired: true };
    },

    async transition({ authorization, body }) {
      const admin = await requireAdmin(authorization);
      const { reference, record } = await courseFor(body?.courseId, body?.version);
      const status = String(body?.status || '');
      if (!workflowStates.has(status) || !adminReviewStates.has(status)) throw apiError(400, 'WORKFLOW_STATUS_INVALID', 'Choose a valid administrator review state.');
      if (status === 'published') throw apiError(409, 'PUBLISH_THROUGH_RELEASE_GATE', 'Use the release gate to publish a course after all backups verify.');
      if (status === 'approved' && (!record.validation?.valid || !record.learnerManifest || !record.privateManifest)) {
        throw apiError(409, 'COURSE_NOT_READY_FOR_APPROVAL', 'A valid bilingual Markdown manifest is required before approval.');
      }
      const reviewNote = clean(body?.reviewNote, 800);
      await reference.set({ status, reviewNote, updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-workflow-transition', courseId: record.courseId, version: record.version, from: record.status, to: status, reviewNote });
      return { course: noSecrets({ ...record, status, reviewNote, updatedAt: nowIso() }) };
    },

    async courseSummary({ authorization, courseId, version }) {
      const account = await accountFor(authorization);
      const { record } = await courseFor(courseId, version);
      if (!canReadCourse(account, record)) throw apiError(403, 'COURSE_ACCESS_DENIED', 'This course is not available to your account.');
      return { course: noSecrets(record), validation: record.validation || { valid: false, errors: [] }, aiDraft: record.aiDraft ? { ...record.aiDraft, sourceExcerpt: undefined } : null, deterministicDrafts: record.deterministicDrafts || [] };
    },

    async uploadNarration({ authorization, form }) {
      const admin = await requireAdmin(authorization);
      if (!firebase.storage) throw apiError(503, 'PRIVATE_SOURCE_STORAGE_NOT_CONFIGURED', 'Private narration storage is not configured yet.');
      const { reference, record } = await courseFor(form?.get('courseId'), form?.get('version'));
      const file = await sourceFileInfo(form?.get('audioFile'));
      if (!supportedAudioExtensions.has(file.extension) || !/^audio\//i.test(file.contentType)) throw apiError(400, 'AUDIO_FILE_NOT_SUPPORTED', 'Upload an MP3, M4A, WAV, OGG, or WebM audio file.');
      const locale = form?.get('locale') === 'ur' ? 'ur' : 'en';
      const sectionId = slug(form?.get('sectionId'));
      if (!sectionId) throw apiError(400, 'NARRATION_SECTION_REQUIRED', 'Choose the module or section this narration belongs to.');
      const objectPath = `private-course-audio/${record.courseId}/${record.version}/${locale}/${sectionId}/${file.sha256}.${file.extension}`;
      await firebase.storage.file(objectPath).save(file.buffer, { resumable: false, contentType: file.contentType, metadata: { metadata: { courseId: record.courseId, version: record.version, locale, sectionId, sha256: file.sha256 } } });
      const assets = [...(record.narrationAssets || []), { locale, sectionId, objectPath, sha256: file.sha256, bytes: file.buffer.length, uploadedAt: nowIso(), uploadedBy: admin.uid }];
      const narration = { humanAudioCount: assets.length, fallback: 'device-text-to-speech' };
      await reference.set({ narrationAssets: assets, narration, status: record.status === 'admin-review' ? 'audio-ready' : record.status, updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-narration-uploaded', courseId: record.courseId, version: record.version, locale, sectionId });
      return { narration, status: record.status === 'admin-review' ? 'audio-ready' : record.status };
    }
  };
};
