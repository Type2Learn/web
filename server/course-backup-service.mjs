import { createHash } from 'node:crypto';
import { apiError } from './errors.mjs';
import { createCoursePackage } from './course-package.mjs';
import { downloadPrivateObject, firebaseStorageReady } from './private-object-storage.mjs';

const ROOT = 'type2learnCourseAuthoring';
const nowIso = () => new Date().toISOString();
const clean = (value, limit = 200) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
const identifier = (value, limit = 80) => String(value || '').trim().replace(/[^a-z0-9-]/gi, '').slice(0, limit).toLowerCase();
const courseDoc = (firestore, courseId, version) => firestore.collection(ROOT).doc('workspace').collection('courses').doc(`${identifier(courseId)}@${clean(version, 32)}`);
const audit = (firestore, entry) => firestore.collection(ROOT).doc('workspace').collection('audit').add({ ...entry, createdAt: nowIso() });
const checksum = (content) => createHash('sha256').update(content).digest('hex');

const requirePublishing = ({ firebase, config }) => {
  if (!config?.educatorWorkspaceEnabled || !config?.coursePublishingEnabled) throw apiError(503, 'COURSE_PUBLISHING_DISABLED', 'Course publishing is not enabled yet.');
  if (!firebase?.available || !firebase.firestore) throw apiError(503, 'COURSE_BACKUP_WORKSPACE_NOT_CONFIGURED', 'Firebase Firestore is required before publication.');
};

const backupShape = (value = {}) => ({
  firebase: value.firebase || { verified: false },
  github: value.github || { verified: false },
  supabase: value.supabase || { verified: false },
  zip: value.zip || { verified: false, downloadedAt: '' }
});
// Firebase is a third optional receipt until its private bucket is provisioned.
// The release gate still requires two independent remote stores (private
// GitHub and Supabase) and administrator acknowledgement of the ZIP export.
export const backupsComplete = (backups, { firebaseRequired = false } = {}) => Boolean(
  (!firebaseRequired || backups.firebase?.verified)
  && backups.github?.verified
  && backups.supabase?.verified
  && backups.zip?.verified
  && backups.zip?.downloadedAt
);

const githubRequest = async ({ config, path, content, message }) => {
  if (!config.courseBackupGithubRepository || !config.courseBackupGithubToken) throw apiError(503, 'GITHUB_BACKUP_NOT_CONFIGURED', 'Private GitHub backup is not configured.');
  const url = `https://api.github.com/repos/${config.courseBackupGithubRepository}/contents/${path}`;
  const headers = { Authorization: `Bearer ${config.courseBackupGithubToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Type2Learn-course-backup' };
  let existingSha = '';
  const existing = await fetch(`${url}?ref=${encodeURIComponent(config.courseBackupGithubBranch)}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (existing.ok) existingSha = String((await existing.json().catch(() => ({})))?.sha || '');
  else if (existing.status !== 404) throw apiError(502, 'GITHUB_BACKUP_FAILED', 'Private GitHub backup could not be checked.');
  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, branch: config.courseBackupGithubBranch, content: Buffer.from(content).toString('base64'), ...(existingSha ? { sha: existingSha } : {}) }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw apiError(502, 'GITHUB_BACKUP_FAILED', 'Private GitHub backup could not be written.');
  const payload = await response.json().catch(() => ({}));
  return { path, sha: String(payload?.content?.sha || ''), checksum: checksum(content) };
};

const supabaseRequest = async ({ config, path, content, contentType }) => {
  if (!config.supabaseBackupUrl || !config.supabaseBackupServiceKey || !config.supabaseBackupBucket) throw apiError(503, 'SUPABASE_BACKUP_NOT_CONFIGURED', 'Supabase backup is not configured.');
  const base = config.supabaseBackupUrl.replace(/\/$/, '');
  const target = `${base}/storage/v1/object/${encodeURIComponent(config.supabaseBackupBucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(target, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.supabaseBackupServiceKey}`, apikey: config.supabaseBackupServiceKey, 'x-upsert': 'true', 'Content-Type': contentType },
    body: content,
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw apiError(502, 'SUPABASE_BACKUP_FAILED', 'Supabase backup could not be written.');
  return { path, checksum: checksum(content) };
};

export const createCourseBackupService = ({ firebase, config, access }) => {
  const requireAdmin = async (authorization) => {
    requirePublishing({ firebase, config });
    return access.assertAdmin(authorization);
  };
  const loadCourse = async (courseId, version) => {
    const reference = courseDoc(firebase.firestore, courseId, version);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw apiError(404, 'COURSE_DRAFT_NOT_FOUND', 'This course draft was not found.');
    return { reference, record: snapshot.data() || {} };
  };
  const packageFor = (record) => createCoursePackage([
    { name: 'course.md', content: record.markdown || '' },
    { name: 'learner-manifest.json', content: JSON.stringify(record.learnerManifest || {}, null, 2) },
    { name: 'private-authoring-manifest.json', content: JSON.stringify(record.privateManifest || {}, null, 2) },
    { name: 'backup-metadata.json', content: JSON.stringify({ courseId: record.courseId, version: record.version, createdAt: nowIso(), sourceUploadsExcluded: true, learnerDataExcluded: true }, null, 2) }
  ]);

  return {
    status: () => ({
      enabled: Boolean(config?.educatorWorkspaceEnabled && config?.coursePublishingEnabled),
      firebase: firebaseStorageReady(firebase),
      firebaseRequired: Boolean(config?.courseBackupFirebaseRequired),
      github: Boolean(config?.courseBackupGithubRepository && config?.courseBackupGithubToken),
      supabase: Boolean(config?.supabaseBackupUrl && config?.supabaseBackupServiceKey && config?.supabaseBackupBucket)
    }),

    async verifyBackups({ authorization, body }) {
      const admin = await requireAdmin(authorization);
      const { reference, record } = await loadCourse(body?.courseId, body?.version);
      if (!record.validation?.valid || !record.learnerManifest || !record.privateManifest) throw apiError(409, 'COURSE_NOT_READY_FOR_BACKUP', 'A validated bilingual course manifest is required before backup.');
      if (record.status !== 'backups-pending') throw apiError(409, 'BACKUP_STAGE_REQUIRED', 'Finish human review, then move the course to Backups pending before verifying publication backups.');
      const packageData = packageFor(record);
      const basePath = `courses/${record.courseId}/${record.version}`;
      const markdown = Buffer.from(record.markdown || '', 'utf8');
      const learner = Buffer.from(JSON.stringify(record.learnerManifest, null, 2), 'utf8');
      const privateManifest = Buffer.from(JSON.stringify(record.privateManifest, null, 2), 'utf8');
      const firebasePath = `private-course-exports/${record.courseId}/${record.version}/course-package-${packageData.sha256}.zip`;
      let firebaseReceipt = { verified: false, optional: !config.courseBackupFirebaseRequired, state: 'not-configured', checkedAt: nowIso() };
      if (firebaseStorageReady(firebase)) {
        try {
          await firebase.storage.file(firebasePath).save(packageData.archive, { resumable: false, contentType: 'application/zip', metadata: { metadata: { courseId: record.courseId, version: record.version, sha256: packageData.sha256, immutable: 'true' } } });
          firebaseReceipt = { verified: true, optional: !config.courseBackupFirebaseRequired, objectPath: firebasePath, sha256: packageData.sha256, verifiedAt: nowIso() };
        } catch {
          // Storage may be configured but not provisioned. The two independent
          // required stores below still protect the release in that case.
          firebaseReceipt = { verified: false, optional: !config.courseBackupFirebaseRequired, state: 'unavailable', checkedAt: nowIso() };
        }
      }
      const githubPrefix = `${basePath}/${packageData.sha256}`;
      const [githubMarkdown, githubLearner, githubPrivate, supabase] = await Promise.all([
        githubRequest({ config, path: `${githubPrefix}/course.md`, content: markdown, message: `backup(course): ${record.courseId}@${record.version} Markdown` }),
        githubRequest({ config, path: `${githubPrefix}/learner-manifest.json`, content: learner, message: `backup(course): ${record.courseId}@${record.version} learner manifest` }),
        githubRequest({ config, path: `${githubPrefix}/private-authoring-manifest.json`, content: privateManifest, message: `backup(course): ${record.courseId}@${record.version} private authoring manifest` }),
        supabaseRequest({ config, path: `${basePath}/course-package-${packageData.sha256}.zip`, content: packageData.archive, contentType: 'application/zip' })
      ]);
      if (config.courseBackupFirebaseRequired && !firebaseReceipt.verified) {
        throw apiError(503, 'FIREBASE_BACKUP_REQUIRED', 'Firebase backup is required by this deployment but the private bucket is unavailable.');
      }
      const backups = {
        firebase: firebaseReceipt,
        github: { verified: true, files: [githubMarkdown, githubLearner, githubPrivate], verifiedAt: nowIso() },
        supabase: { verified: true, ...supabase, verifiedAt: nowIso() },
        zip: { verified: true, provider: 'supabase', objectPath: supabase.path, sha256: packageData.sha256, checksums: packageData.checksums, downloadedAt: '' }
      };
      await reference.set({ backups, status: 'backups-verified', updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-backups-verified', courseId: record.courseId, version: record.version, archiveSha256: packageData.sha256 });
      return { backups, status: 'backups-verified', exportReady: true };
    },

    async downloadExport({ authorization, courseId, version }) {
      const admin = await requireAdmin(authorization);
      const { reference, record } = await loadCourse(courseId, version);
      const backups = backupShape(record.backups);
      if (!backups.zip?.verified || !backups.zip?.objectPath) throw apiError(409, 'EXPORT_NOT_READY', 'Verify backups before downloading the immutable course export.');
      const archive = await downloadPrivateObject({ firebase, config, provider: backups.zip.provider || 'firebase', objectPath: backups.zip.objectPath });
      backups.zip.downloadedAt = nowIso();
      backups.zip.downloadedBy = admin.uid;
      await reference.set({ backups, updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-export-downloaded', courseId: record.courseId, version: record.version, archiveSha256: backups.zip.sha256 });
      return { archive, filename: `${record.courseId}-${record.version}-${backups.zip.sha256.slice(0, 12)}.zip` };
    },

    async publish({ authorization, body }) {
      const admin = await requireAdmin(authorization);
      const { reference, record } = await loadCourse(body?.courseId, body?.version);
      const audience = body?.audience === 'platform' ? 'platform' : 'organisation';
      if (audience === 'organisation' && !record.ownerOrganisationId) throw apiError(400, 'ORGANISATION_REQUIRED', 'Organisation publication requires an owning organisation.');
      const backups = backupShape(record.backups);
      if (!backupsComplete(backups, { firebaseRequired: Boolean(config.courseBackupFirebaseRequired) })) throw apiError(409, 'BACKUPS_NOT_COMPLETE', config.courseBackupFirebaseRequired
        ? 'Firebase, private GitHub, Supabase, and a downloaded ZIP export must all verify before publication.'
        : 'Private GitHub, Supabase, and a downloaded ZIP export must all verify before publication.');
      if (!record.validation?.valid || !record.learnerManifest || !record.privateManifest) throw apiError(409, 'COURSE_NOT_APPROVED', 'A validated bilingual course is required before publication.');
      if (record.status !== 'approved') throw apiError(409, 'ADMIN_APPROVAL_REQUIRED', 'An administrator must explicitly approve this reviewed course after backups verify before it can publish.');
      await reference.set({ status: 'published', requestedAudience: audience, publishedAt: nowIso(), publishedBy: admin.uid, updatedAt: nowIso(), updatedBy: admin.uid }, { merge: true });
      await audit(firebase.firestore, { actorUid: admin.uid, action: 'course-published', courseId: record.courseId, version: record.version, audience });
      return { courseId: record.courseId, version: record.version, status: 'published', audience };
    }
  };
};
