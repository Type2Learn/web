import { createHash, randomUUID } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import { apiError } from './errors.mjs';
import { isTheoryCourseType } from './access-policy.mjs';
import { compileTheoryCourse, fallbackMcqDraft, parseTheoryMarkdown, validateTheoryCourse } from './theory-course-markdown.mjs';
import { canTransitionCourseWorkflow, isWorkflowState } from './course-workflow.mjs';
import { downloadPrivateObject, privateStorageStatus, uploadPrivateObject } from './private-object-storage.mjs';

const ROOT = 'type2learnCourseAuthoring';
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_MARKDOWN_CHARS = 220_000;
const MAX_AI_SOURCE_CHARS = 12_000;
const blockedSourceExtensions = new Set(['exe', 'dll', 'msi', 'bat', 'cmd', 'com', 'ps1', 'sh', 'jar', 'apk', 'app']);
const supportedTextExtensions = new Set(['md', 'markdown', 'txt', 'csv']);
const supportedPdfExtensions = new Set(['pdf']);
const supportedAudioExtensions = new Set(['mp3', 'm4a', 'wav', 'ogg', 'webm']);

const nowIso = () => new Date().toISOString();
const clean = (value, limit = 200) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
// Course and module identifiers intentionally remain hyphen-only because they
// become learner-route keys. Workspace identifiers are different: access-code
// redemption creates organisation IDs such as `org_…`, and source submissions
// use `sub_…`. Never run those IDs through the course slug normaliser.
const identifier = (value, limit = 80) => String(value || '').trim().replace(/[^a-z0-9-]/gi, '').slice(0, limit).toLowerCase();
const workspaceIdentifier = (value, limit = 96) => String(value || '').trim().replace(/[^a-z0-9_-]/gi, '').slice(0, limit).toLowerCase();
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
  // This is staff-only workflow metadata. It gives an administrator the exact
  // reviewed module IDs needed to attach a narration file, without exposing a
  // Storage path, source upload, answer key or private manifest.
  narrationSections: Array.isArray(record.learnerManifest?.modules)
    ? record.learnerManifest.modules.map((module) => ({ id: String(module?.id || ''), title: String(module?.en?.title || module?.id || '') })).filter((module) => module.id)
    : [],
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
  let text = '';
  let extraction = 'requires-admin-transcription';
  let pages = 0;
  if (supportedTextExtensions.has(extension)) {
    text = buffer.toString('utf8').slice(0, MAX_MARKDOWN_CHARS);
    extraction = 'safe-text-extracted';
  } else if (supportedPdfExtensions.has(extension) || /^application\/pdf$/i.test(clean(file.type, 100))) {
    // PDF intake is deliberately text-first. We never run OCR or send an
    // original private document to a model. A text-based PDF is extracted in
    // this server process, capped, then an administrator can ask the existing
    // review-only AI draft flow to work from that extracted text. Image-only
    // scans stay private and are clearly marked for transcription.
    let parser = null;
    try {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = String(result?.text || '').replace(/\u0000/g, '').trim().slice(0, MAX_MARKDOWN_CHARS);
      pages = Number(result?.total || result?.pages?.length || 0) || 0;
      extraction = text ? 'safe-pdf-text-extracted' : 'requires-admin-transcription';
    } catch {
      extraction = 'requires-admin-transcription';
    } finally {
      // `pdf-parse` can allocate parser resources even when a malformed PDF
      // throws before text is returned. Always release them before this
      // request continues; source uploads must remain bounded under load.
      await parser?.destroy?.().catch(() => undefined);
    }
  }
  return {
    buffer,
    originalName,
    extension,
    contentType: clean(file.type, 100) || 'application/octet-stream',
    sha256: fileHash(buffer),
    text,
    pages,
    extraction
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

const translationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['translation'],
  properties: { translation: { type: 'string', minLength: 1, maxLength: 12000 } }
};

const generatedNarration = (module, locale) => {
  const lesson = locale === 'ur' ? module?.ur : module?.en;
  if (!lesson) return '';
  const pieces = [
    lesson.title,
    lesson.content?.definitionHeading,
    lesson.content?.definition,
    lesson.content?.dailyLifeHeading,
    lesson.content?.dailyLife,
    lesson.content?.strengthsHeading,
    lesson.content?.strengths,
    lesson.content?.challengesHeading,
    ...(lesson.content?.challenges || []),
    lesson.content?.supportsHeading,
    ...(lesson.content?.supports || []),
    lesson.simple,
    lesson.example
  ].map((part) => clean(part, 600)).filter(Boolean);
  return pieces.join('. ').replace(/\s+([.,!?])/g, '$1').slice(0, 1200);
};

export const createCourseAuthoringService = ({ firebase, config, access, provider, speech = null }) => {
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
      privateSourceStorage: privateStorageStatus({ firebase, config }).available,
      privateStorageProviders: privateStorageStatus({ firebase, config }),
      theoryOnly: true,
      aiDrafting: Boolean(provider?.status?.().available),
      pdfTextExtraction: true,
      automaticTranslation: Boolean(provider?.status?.().available),
      generatedNarration: Boolean(speech?.status?.().textToSpeech?.available),
      maxSourceBytes: MAX_SOURCE_BYTES
    }),

    async submitSource({ authorization, form }) {
      const account = await accountFor(authorization);
      if (!canSubmit(account)) throw apiError(403, 'COURSE_SUBMISSION_DENIED', 'A teacher, institute owner, or administrator account is required to submit a course.');
      if (!privateStorageStatus({ firebase, config }).available) throw apiError(503, 'PRIVATE_SOURCE_STORAGE_NOT_CONFIGURED', 'Private course-source storage is not configured yet.');
      const type = String(form?.get('courseType') || '');
      if (!isTheoryCourseType(type)) throw apiError(400, 'COURSE_TYPE_LOCKED', 'Only theory courses are supported at this time.');
      const isAdmin = account.roles.includes('platform-admin');
      // A platform administrator can start a platform-owned course without
      // first creating a dummy teacher organisation. Teacher and institute
      // submissions still require their real organisation membership.
      const organisationId = workspaceIdentifier(form?.get('organisationId')) || account.organisations.find((entry) => entry.active !== false)?.organisationId || (isAdmin ? 'type2learn-platform' : '');
      if (!organisationId) throw apiError(400, 'ORGANISATION_REQUIRED', 'Choose the organisation that owns this course submission.');
      if (!isAdmin || workspaceIdentifier(form?.get('organisationId'))) await access.assertOrganisationAccess(authorization, organisationId);
      const source = await sourceFileInfo(form?.get('sourceFile'));
      const submissionId = `sub_${randomUUID().replace(/-/g, '')}`;
      const objectPath = `private-course-sources/${organisationId}/${submissionId}/${source.sha256}.${source.extension || 'bin'}`;
      const privateObject = await uploadPrivateObject({
        firebase,
        config,
        objectPath,
        content: source.buffer,
        contentType: source.contentType,
        metadata: { submissionId, sha256: source.sha256, originalName: source.originalName }
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
          objectPath: privateObject.objectPath,
          provider: privateObject.provider,
          extraction: source.extraction,
          extractedText: source.text,
          extractedPages: source.pages
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
      const id = workspaceIdentifier(submissionId);
      const reference = sourceCollection(firebase.firestore, 'submissions').doc(id);
      const snapshot = await reference.get();
      if (!snapshot.exists) throw apiError(404, 'SUBMISSION_NOT_FOUND', 'This course submission was not found.');
      const record = snapshot.data() || {};
      // Opening the secure review route is the explicit human hand-off from a
      // teacher or institute to the administrator. Keep the original upload
      // private, but record that a human reviewer has started the conversion.
      if (record.status === 'submitted') {
        await reference.set({ status: 'source-reviewed', updatedAt: nowIso(), reviewedBy: admin.uid, reviewedAt: nowIso() }, { merge: true });
      }
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-source-review-opened', submissionId: id, organisationId: record.ownerOrganisationId });
      return {
        submission: publicSubmission({ ...record, status: record.status === 'submitted' ? 'source-reviewed' : record.status }),
        extractedText: /^safe-(?:pdf-)?text-extracted$/.test(String(record.source?.extraction || '')) ? String(record.source?.extractedText || '') : '',
        requiresAdminTranscription: !/^safe-(?:pdf-)?text-extracted$/.test(String(record.source?.extraction || '')),
        downloadAvailable: Boolean(record.source?.objectPath && privateStorageStatus({ firebase, config }).available)
      };
    },

    // The original teacher/institute upload never becomes public course
    // content. Administrators may download it through this authenticated route
    // for transcription/review, while learners only ever receive the compiled
    // learner manifest after publication.
    async downloadSource({ authorization, submissionId }) {
      const admin = await requireAdmin(authorization);
      const id = workspaceIdentifier(submissionId);
      const snapshot = await sourceCollection(firebase.firestore, 'submissions').doc(id).get();
      if (!snapshot.exists) throw apiError(404, 'SUBMISSION_NOT_FOUND', 'This course submission was not found.');
      const record = snapshot.data() || {};
      const objectPath = String(record.source?.objectPath || '');
      if (!objectPath) throw apiError(409, 'SOURCE_FILE_UNAVAILABLE', 'This source submission has no private file to download.');
      let buffer;
      try { buffer = await downloadPrivateObject({ firebase, config, provider: record.source?.provider || 'firebase', objectPath }); } catch {
        throw apiError(503, 'SOURCE_FILE_UNAVAILABLE', 'The private source file could not be opened right now.');
      }
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-source-downloaded-for-review', submissionId: id, organisationId: record.ownerOrganisationId });
      return {
        buffer,
        contentType: String(record.source?.contentType || 'application/octet-stream'),
        filename: String(record.source?.originalName || 'course-source')
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
      // Markdown is the canonical reviewed course definition. Do not silently
      // create a record under a different form-field ID or version: that would
      // separate the human-reviewed text from the course later published.
      const courseId = identifier(metadata.id);
      const version = clean(metadata.version, 32);
      const requestedCourseId = identifier(body?.courseId);
      const requestedVersion = clean(body?.version, 32);
      if (requestedCourseId && requestedCourseId !== courseId) throw apiError(400, 'MARKDOWN_COURSE_ID_MISMATCH', 'The course ID field must match the reviewed Markdown metadata id.');
      if (requestedVersion && requestedVersion !== version) throw apiError(400, 'MARKDOWN_VERSION_MISMATCH', 'The version field must match the reviewed Markdown metadata version.');
      if (!courseId || !version) throw apiError(400, 'COURSE_ID_AND_VERSION_REQUIRED', 'Markdown metadata needs a valid course id and version.');
      const submissionId = workspaceIdentifier(body?.submissionId);
      let submissionReference = null;
      let sourceSubmission = null;
      if (submissionId) {
        submissionReference = sourceCollection(firebase.firestore, 'submissions').doc(submissionId);
        const submissionSnapshot = await submissionReference.get();
        if (!submissionSnapshot.exists) throw apiError(404, 'SUBMISSION_NOT_FOUND', 'The linked private source submission was not found.');
        sourceSubmission = submissionSnapshot.data() || {};
        const linkedCourseId = identifier(sourceSubmission.courseId);
        const linkedVersion = clean(sourceSubmission.version, 32);
        if (linkedCourseId && (linkedCourseId !== courseId || linkedVersion !== version)) {
          throw apiError(409, 'SUBMISSION_ALREADY_LINKED', 'This private source is already linked to a different reviewed course version.');
        }
      }
      let compiled = null;
      if (validation.valid) compiled = compileTheoryCourse(validation);
      const existing = await courseDoc(firebase.firestore, courseId, version).get();
      const existingRecord = existing.exists ? existing.data() || {} : {};
      const requestedOwnerOrganisationId = workspaceIdentifier(body?.ownerOrganisationId);
      const sourceOwnerOrganisationId = workspaceIdentifier(sourceSubmission?.ownerOrganisationId);
      if (requestedOwnerOrganisationId && sourceOwnerOrganisationId && requestedOwnerOrganisationId !== sourceOwnerOrganisationId) {
        throw apiError(409, 'SOURCE_OWNERSHIP_MISMATCH', 'The reviewed course owner must match the organisation that submitted the private source.');
      }
      const ownerOrganisationId = requestedOwnerOrganisationId || sourceOwnerOrganisationId || workspaceIdentifier(existingRecord.ownerOrganisationId);
      const record = {
        ...existingRecord,
        courseId,
        version,
        type: 'theory',
        ownerOrganisationId,
        // Submission IDs are workspace identifiers (`sub_…`), not course
        // slugs. A later Markdown edit may omit the form field, so preserve
        // the exact existing private-source link instead of stripping `_`.
        submissionId: submissionId || workspaceIdentifier(existingRecord.submissionId),
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
      if (submissionReference) {
        await submissionReference.set({
          status: validation.valid ? 'validation-ready' : 'markdown-draft',
          courseId,
          version,
          updatedAt: nowIso(),
          reviewedBy: admin.uid
        }, { merge: true });
      }
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-markdown-saved', courseId, version, status: record.status, validationErrors: validation.errors.length });
      // `learnerManifest` is already compiled without answer keys, rubrics,
      // source material, or private authoring notes. Returning it here lets an
      // administrator inspect the *actual* learner payload immediately after
      // a direct Markdown upload or structured-form conversion. It is never
      // returned by the public catalogue endpoint.
      return { course: noSecrets(record), validation: record.validation, learnerManifest: record.learnerManifest || null };
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

    // Translation is a review-only tool. It never changes the canonical
    // Markdown on its own, so every bilingual sentence can still be checked
    // in the structured editor before compilation and publishing.
    async translateReviewedText({ authorization, body }) {
      const admin = await requireAdmin(authorization);
      if (!provider?.status?.().available) throw apiError(503, 'AI_TRANSLATION_NOT_CONFIGURED', 'Automatic translation is not configured. You can still enter reviewed bilingual text manually.');
      const sourceLanguage = body?.sourceLanguage === 'ur' ? 'ur' : 'en';
      const targetLanguage = sourceLanguage === 'ur' ? 'en' : 'ur';
      const text = clean(body?.text, MAX_AI_SOURCE_CHARS);
      if (!text) throw apiError(400, 'TRANSLATION_TEXT_REQUIRED', 'Add the reviewed text you want to translate.');
      const result = await provider.generate({
        purpose: 'course-authoring-translation',
        instructions: [
          'Translate the reviewed educational text faithfully.',
          'Do not add facts, diagnoses, learner claims, markup, or commentary.',
          sourceLanguage === 'en' ? 'Return clear Urdu in Urdu script.' : 'Return clear English.',
          'The result is a review draft, not publishable content.'
        ].join(' '),
        input: JSON.stringify({ sourceLanguage, targetLanguage, text }),
        jsonSchema: translationSchema,
        maxOutputTokens: 1800
      });
      let translation = '';
      try { translation = clean(JSON.parse(result.text)?.translation, MAX_AI_SOURCE_CHARS); } catch { /* schema failure falls through */ }
      if (!translation) throw apiError(502, 'AI_TRANSLATION_INVALID', 'The translation draft was not in the required format. No course content changed.');
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-reviewed-text-translated', sourceLanguage, targetLanguage, provider: result.provider, characters: text.length });
      return { translation, sourceLanguage, targetLanguage, provider: result.provider, reviewRequired: true };
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
      if (!isWorkflowState(status) || status === 'submitted') throw apiError(400, 'WORKFLOW_STATUS_INVALID', 'Choose a valid administrator review state.');
      if (status === 'published') throw apiError(409, 'PUBLISH_THROUGH_RELEASE_GATE', 'Use the release gate to publish a course after all backups verify.');
      if (!canTransitionCourseWorkflow(record.status, status)) throw apiError(409, 'WORKFLOW_TRANSITION_INVALID', `This course cannot move from ${record.status} to ${status} yet.`);
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
      // This endpoint is staff-authorised and still deliberately exposes only
      // the learner-safe manifest. The private manifest, Markdown source,
      // answer keys, rubrics, and upload references remain server-only.
      return {
        course: noSecrets(record),
        validation: record.validation || { valid: false, errors: [] },
        learnerManifest: record.learnerManifest || null,
        aiDraft: record.aiDraft ? { ...record.aiDraft, sourceExcerpt: undefined } : null,
        deterministicDrafts: record.deterministicDrafts || []
      };
    },

    // The separate admin review endpoint deliberately includes canonical
    // Markdown, which is never exposed through public catalogue or learner
    // endpoints. The UI edits one module slice at a time, then routes the
    // complete source back through the normal validator/compiler.
    async courseReview({ authorization, courseId, version }) {
      await requireAdmin(authorization);
      const { record } = await courseFor(courseId, version);
      return {
        course: noSecrets(record),
        markdown: String(record.markdown || ''),
        learnerManifest: record.learnerManifest || null,
        validation: record.validation || { valid: false, errors: [] }
      };
    },

    async generateNarration({ authorization, body }) {
      const admin = await requireAdmin(authorization);
      if (!speech?.synthesise || !speech?.status?.().textToSpeech?.available) throw apiError(503, 'NARRATION_GENERATION_NOT_CONFIGURED', 'Automatic narration is not connected. You can upload reviewed narration instead.');
      if (!privateStorageStatus({ firebase, config }).available) throw apiError(503, 'PRIVATE_SOURCE_STORAGE_NOT_CONFIGURED', 'Private narration storage is not configured yet.');
      const { reference, record } = await courseFor(body?.courseId, body?.version);
      const locale = body?.locale === 'ur' ? 'ur' : 'en';
      const sectionId = slug(body?.sectionId);
      const module = (record.learnerManifest?.modules || []).find((item) => slug(item?.id) === sectionId);
      if (!module) throw apiError(400, 'NARRATION_SECTION_UNKNOWN', 'Choose a reviewed module before generating narration.');
      const script = generatedNarration(module, locale);
      if (!script) throw apiError(409, 'NARRATION_SCRIPT_UNAVAILABLE', 'This reviewed module does not contain enough text for narration.');
      const audio = await speech.synthesise({ authorization, body: { text: script, language: locale, purpose: 'course-narration' } });
      const digest = fileHash(audio.audio);
      const objectPath = `private-course-audio/${record.courseId}/${record.version}/${locale}/${sectionId}/generated-${digest}.wav`;
      const privateObject = await uploadPrivateObject({
        firebase, config, objectPath, content: audio.audio, contentType: audio.contentType,
        metadata: { courseId: record.courseId, version: record.version, locale, sectionId, sha256: digest, generated: 'true' }
      });
      const assets = [...(record.narrationAssets || []), { locale, sectionId, objectPath: privateObject.objectPath, provider: 'speechmatics-generated', sha256: digest, bytes: audio.audio.length, generated: true, scriptCharacters: script.length, uploadedAt: nowIso(), uploadedBy: admin.uid }];
      const narration = { humanAudioCount: assets.filter((asset) => !asset.generated).length, generatedAudioCount: assets.filter((asset) => asset.generated).length, fallback: 'device-text-to-speech' };
      await reference.set({ narrationAssets: assets, narration, status: record.status === 'admin-review' ? 'audio-ready' : record.status, updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-narration-generated', courseId: record.courseId, version: record.version, locale, sectionId, scriptCharacters: script.length });
      return { narration, status: record.status === 'admin-review' ? 'audio-ready' : record.status, scriptPreview: script };
    },

    async uploadNarration({ authorization, form }) {
      const admin = await requireAdmin(authorization);
      if (!privateStorageStatus({ firebase, config }).available) throw apiError(503, 'PRIVATE_SOURCE_STORAGE_NOT_CONFIGURED', 'Private narration storage is not configured yet.');
      const { reference, record } = await courseFor(form?.get('courseId'), form?.get('version'));
      const file = await sourceFileInfo(form?.get('audioFile'));
      if (!supportedAudioExtensions.has(file.extension) || !/^audio\//i.test(file.contentType)) throw apiError(400, 'AUDIO_FILE_NOT_SUPPORTED', 'Upload an MP3, M4A, WAV, OGG, or WebM audio file.');
      const locale = form?.get('locale') === 'ur' ? 'ur' : 'en';
      const sectionId = slug(form?.get('sectionId'));
      if (!sectionId) throw apiError(400, 'NARRATION_SECTION_REQUIRED', 'Choose the module or section this narration belongs to.');
      const knownModule = Array.isArray(record.learnerManifest?.modules)
        && record.learnerManifest.modules.some((module) => slug(module?.id) === sectionId);
      if (!knownModule) throw apiError(400, 'NARRATION_SECTION_UNKNOWN', 'Use the exact reviewed module ID shown in the validated course before uploading narration.');
      const objectPath = `private-course-audio/${record.courseId}/${record.version}/${locale}/${sectionId}/${file.sha256}.${file.extension}`;
      const privateObject = await uploadPrivateObject({
        firebase,
        config,
        objectPath,
        content: file.buffer,
        contentType: file.contentType,
        metadata: { courseId: record.courseId, version: record.version, locale, sectionId, sha256: file.sha256 }
      });
      const assets = [...(record.narrationAssets || []), { locale, sectionId, objectPath: privateObject.objectPath, provider: privateObject.provider, sha256: file.sha256, bytes: file.buffer.length, uploadedAt: nowIso(), uploadedBy: admin.uid }];
      const narration = { humanAudioCount: assets.length, fallback: 'device-text-to-speech' };
      await reference.set({ narrationAssets: assets, narration, status: record.status === 'admin-review' ? 'audio-ready' : record.status, updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-narration-uploaded', courseId: record.courseId, version: record.version, locale, sectionId });
      return { narration, status: record.status === 'admin-review' ? 'audio-ready' : record.status };
    }
  };
};
