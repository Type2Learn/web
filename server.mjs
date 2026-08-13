import { createServer as createHttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiService } from './server/ai-service.mjs';
import { createAdaptiveRecallService } from './server/adaptive-recall-service.mjs';
import { loadRuntimeConfig } from './server/config.mjs';
import { publicError, apiError } from './server/errors.mjs';
import { createFirebaseRuntime } from './server/firebase-runtime.mjs';
import { createSpeechService } from './server/speech-service.mjs';
import { createUsageLedger } from './server/usage-ledger.mjs';
import { createCourseProgressService } from './server/course-progress-service.mjs';
import { createModelProvider } from './server/model-provider.mjs';
import { createLearningAnalyticsService } from './server/learning-analytics-service.mjs';
import { createAdaptiveSupportService } from './server/adaptive-support-service.mjs';
import { createAssessmentService } from './server/assessment-service.mjs';
import { createBehaviouralPartnerService } from './server/behavioural-partner-service.mjs';
import { createAccessService } from './server/access-service.mjs';
import { createCourseAuthoringService } from './server/course-authoring-service.mjs';
import { createCourseBackupService } from './server/course-backup-service.mjs';
import { createCourseCatalogService } from './server/course-catalog-service.mjs';
import { createCourseContextResolver } from './server/course-context.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const redirects = new Map([
  ['/research', '/how-it-works/#evidence'],
  ['/research/', '/how-it-works/#evidence'],
  ['/pathways', '/how-it-works/#pathways'],
  ['/pathways/', '/how-it-works/#pathways'],
  ['/learners', '/learning-together/#learner'],
  ['/learners/', '/learning-together/#learner'],
  ['/families', '/learning-together/#family'],
  ['/families/', '/learning-together/#family'],
  ['/schools', '/learning-together/#educators'],
  ['/schools/', '/learning-together/#educators'],
  ['/co-design', '/participation-trust/#participation-record'],
  ['/co-design/', '/participation-trust/#participation-record'],
  ['/community', '/participation-trust/#video-conversations'],
  ['/community/', '/participation-trust/#video-conversations'],
  ['/trust', '/participation-trust/#accessibility'],
  ['/trust/', '/participation-trust/#accessibility'],
  ['/accessibility', '/participation-trust/#accessibility'],
  ['/accessibility/', '/participation-trust/#accessibility'],
  ['/security', '/participation-trust/#security'],
  ['/security/', '/participation-trust/#security'],
  ['/support', '/participation-trust/#support'],
  ['/support/', '/participation-trust/#support'],
  ['/ur/pathways', '/ur/how-it-works/#pathways'],
  ['/ur/pathways/', '/ur/how-it-works/#pathways'],
  ['/ur/learners', '/ur/learning-together/#learner'],
  ['/ur/learners/', '/ur/learning-together/#learner'],
  ['/ur/families', '/ur/learning-together/#family'],
  ['/ur/families/', '/ur/learning-together/#family'],
  ['/ur/schools', '/ur/learning-together/#educators'],
  ['/ur/schools/', '/ur/learning-together/#educators'],
  ['/ur/co-design', '/ur/participation-trust/#participation-record'],
  ['/ur/co-design/', '/ur/participation-trust/#participation-record'],
  ['/ur/community', '/ur/participation-trust/#video-conversations'],
  ['/ur/community/', '/ur/participation-trust/#video-conversations'],
  ['/ur/trust', '/ur/participation-trust/#accessibility'],
  ['/ur/trust/', '/ur/participation-trust/#accessibility']
]);
const blockedTopLevel = new Set(['.git', '.githooks', 'cloudflare', 'node_modules', 'scripts', 'security', 'server', 'tests']);
const blockedFiles = new Set(['.gitignore', 'package.json', 'package-lock.json', 'render.yaml', 'server.mjs']);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8']
]);

const securityHeaders = (pathname, { api = false } = {}) => ({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'microphone=(self)',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': api
    ? 'no-store'
    : pathname.startsWith('/assets/') || pathname.startsWith('/vendor/')
      ? 'public, max-age=604800'
      : /\.(?:css|js)$/i.test(pathname)
        ? 'public, max-age=0, must-revalidate'
        : 'public, max-age=0, must-revalidate'
});

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, headers);
  response.end(body);
};

const sendJson = (response, status, payload) => send(response, status, JSON.stringify(payload), {
  ...securityHeaders('/api', { api: true }),
  'Content-Type': 'application/json; charset=utf-8'
});

const asOrigin = (request) => String(request.headers.origin || '').replace(/\/$/, '');
const localGuestFromRequest = (request, config) => {
  if (!config.allowLocalGuestAi) return null;
  const cookie = String(request.headers.cookie || '');
  const match = cookie.match(/(?:^|;\s*)type2learn_guest_id=([A-Za-z0-9_-]{20,96})(?:;|$)/);
  if (!match) return null;
  return { uid: 'guest-' + match[1], isGuest: true };
};
const isLoopbackOrigin = (origin) => {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
};
const isAllowedOrigin = (request, config) => {
  const origin = asOrigin(request);
  // Local previews routinely use a different available port. Keep that
  // developer workflow functional without widening the deployed service:
  // production still accepts only explicitly configured origins.
  return !origin
    || config.allowedOrigins.has(origin)
    || (!config.production && isLoopbackOrigin(origin));
};

const readBody = async (request, maximum) => {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maximum) throw apiError(413, 'REQUEST_TOO_LARGE', 'This request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const readJson = async (request, maximum = 48 * 1024) => {
  const body = await readBody(request, maximum);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw apiError(400, 'INVALID_JSON', 'The AI request could not be read.');
  }
};

const readForm = async (request, maximum = 7 * 1024 * 1024) => {
  const body = await readBody(request, maximum);
  const headers = new Headers();
  Object.entries(request.headers).forEach(([key, value]) => {
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value !== undefined) headers.set(key, String(value));
  });
  try {
    const formRequest = new Request(`http://localhost${request.url || '/'}`, {
      method: request.method,
      headers,
      body,
      duplex: 'half'
    });
    return await formRequest.formData();
  } catch {
    throw apiError(400, 'INVALID_AUDIO', 'The voice recording could not be read.');
  }
};

const safePathname = (pathname) => {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.includes('\0')) return null;
  const segments = decoded.split('/').filter(Boolean);
  if (!segments.length) return '/';
  if (blockedTopLevel.has(segments[0]) || segments.some((segment) => segment.startsWith('.'))) return null;
  const filename = segments.at(-1);
  if (blockedFiles.has(filename) || /(?:^|\.)env(?:\.|$)/i.test(filename) || /\.(?:pem|key|p12)$/i.test(filename)) return null;
  const resolved = path.resolve(root, '.' + decoded);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
};

const serveStatic = async (request, response, pathname) => {
  // Make the public origin unambiguous. Some reverse proxies preserve `/` as a
  // special request, while `/index.html` is a normal static-file request.
  // Serving this file explicitly keeps the custom domain's homepage reliable.
  let target = pathname === '/' ? path.join(root, 'index.html') : safePathname(pathname);
  if (!target) return send(response, 404, 'Not found', { ...securityHeaders(pathname), 'Content-Type': 'text/plain; charset=utf-8' });
  try {
    const details = await stat(target);
    if (details.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    return send(response, 404, 'Not found', { ...securityHeaders(pathname), 'Content-Type': 'text/plain; charset=utf-8' });
  }
  try {
    const details = await stat(target);
    if (!details.isFile()) throw new Error('Not a file.');
    const extension = path.extname(target).toLowerCase();
    const headers = {
      ...securityHeaders(pathname),
      'Content-Type': mimeTypes.get(extension) || 'application/octet-stream',
      'Content-Length': details.size
    };
    response.writeHead(200, headers);
    if (request.method !== 'HEAD') response.end(await readFile(target));
    else response.end();
  } catch {
    send(response, 404, 'Not found', { ...securityHeaders(pathname), 'Content-Type': 'text/plain; charset=utf-8' });
  }
};

const buildRuntime = async () => {
  const config = await loadRuntimeConfig();
  const firebase = createFirebaseRuntime(config);
  const ledger = firebase.available ? createUsageLedger(firebase.firestore) : null;
  const modelProvider = createModelProvider(config);
  const access = createAccessService({ config, firebase });
  const courseCatalog = createCourseCatalogService({ config, firebase, access });
  const courseContextResolver = createCourseContextResolver({ courseCatalog });
  return {
    config,
    modelProvider,
    ai: createAiService({ config, firebase, ledger, provider: modelProvider, contextResolver: courseContextResolver }),
    adaptiveRecall: createAdaptiveRecallService({ config, firebase, ledger, provider: modelProvider, contextResolver: courseContextResolver }),
    speech: createSpeechService({ config, firebase, ledger }),
    courseProgress: createCourseProgressService({ firebase, assertCourseAccess: courseCatalog.assertProgressAccess }),
    // ADAPTIVE LEARNING: all three services independently enforce feature
    // flags, bearer authentication, consent/reviewer checks, and Firestore
    // availability. They are present even while disabled for a staged rollout.
    learningAnalytics: createLearningAnalyticsService({ config, firebase }),
    adaptiveSupport: createAdaptiveSupportService({ config, firebase, ledger, provider: modelProvider }),
    assessments: createAssessmentService({ config, firebase, ledger, provider: modelProvider }),
    behaviouralPartner: createBehaviouralPartnerService({ config, firebase, ledger, provider: modelProvider }),
    access,
    courseAuthoring: createCourseAuthoringService({ config, firebase, access, provider: modelProvider }),
    courseBackups: createCourseBackupService({ config, firebase, access }),
    courseCatalog
  };
};

const handleApi = async (request, response, pathname, runtime) => {
  const { config, ai, adaptiveRecall, speech, courseProgress, modelProvider, learningAnalytics, adaptiveSupport, assessments, behaviouralPartner, access, courseAuthoring, courseBackups, courseCatalog } = runtime;
  if (!isAllowedOrigin(request, config)) {
    return sendJson(response, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This website is not allowed to use the AI service.' } });
  }
  if (request.method === 'GET' && pathname === '/api/v1/health') {
    return sendJson(response, 200, {
      ai: ai.status(),
      adaptiveRecall: { ...adaptiveRecall.status(), localGuestPreview: config.allowLocalGuestAi },
      adaptiveLearning: learningAnalytics.status(),
      adaptiveSupport: adaptiveSupport.status(),
      behaviouralPartner: behaviouralPartner.status(),
      assessments: assessments.status(),
      modelRouting: modelProvider.status(),
      speechToText: speech.status(),
      courseProgress: courseProgress.status(),
      educatorWorkspace: access.status(),
      courseAuthoring: courseAuthoring.status(),
      courseBackups: courseBackups.status(),
      courseCatalogue: courseCatalog.status(),
      model: config.openAiModel
    });
  }
  try {
    if (request.method === 'GET' && pathname === '/api/v1/access/me') {
      return sendJson(response, 200, await access.me({ authorization: request.headers.authorization }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/access/bootstrap') {
      return sendJson(response, 200, await access.bootstrap({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/access/codes') {
      return sendJson(response, 200, await access.createCode({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/access/codes') {
      return sendJson(response, 200, await access.listCodes({ authorization: request.headers.authorization }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/access/redeem') {
      return sendJson(response, 200, await access.redeemCode({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    const codeRevoke = pathname.match(/^\/api\/v1\/access\/codes\/([A-Za-z0-9_-]{8,96})\/revoke$/);
    if (request.method === 'POST' && codeRevoke) {
      return sendJson(response, 200, await access.revokeCode({ authorization: request.headers.authorization, codeId: codeRevoke[1] }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/access/roster') {
      const organisationId = new URL(request.url || '/', 'http://localhost').searchParams.get('organisationId') || '';
      return sendJson(response, 200, await access.roster({ authorization: request.headers.authorization, organisationId }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/access/memberships/revoke') {
      return sendJson(response, 200, await access.revokeMembership({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-authoring/source') {
      return sendJson(response, 200, await courseAuthoring.submitSource({ authorization: request.headers.authorization, form: await readForm(request, 25 * 1024 * 1024) }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/course-authoring/submissions') {
      return sendJson(response, 200, await courseAuthoring.listSubmissions({ authorization: request.headers.authorization }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/course-authoring/submission-review') {
      const url = new URL(request.url || '/', 'http://localhost');
      return sendJson(response, 200, await courseAuthoring.submissionReview({ authorization: request.headers.authorization, submissionId: url.searchParams.get('submissionId') }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/course-authoring/courses') {
      return sendJson(response, 200, await courseAuthoring.listCourses({ authorization: request.headers.authorization }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-authoring/markdown') {
      return sendJson(response, 200, await courseAuthoring.saveMarkdown({ authorization: request.headers.authorization, body: await readJson(request, 256 * 1024) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-authoring/ai-draft') {
      return sendJson(response, 200, await courseAuthoring.generateAiDraft({ authorization: request.headers.authorization, body: await readJson(request, 32 * 1024) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-authoring/deterministic-mcq') {
      return sendJson(response, 200, await courseAuthoring.createDeterministicMcqDraft({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-authoring/transition') {
      return sendJson(response, 200, await courseAuthoring.transition({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/course-authoring/course') {
      const url = new URL(request.url || '/', 'http://localhost');
      return sendJson(response, 200, await courseAuthoring.courseSummary({ authorization: request.headers.authorization, courseId: url.searchParams.get('courseId'), version: url.searchParams.get('version') }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-authoring/narration') {
      return sendJson(response, 200, await courseAuthoring.uploadNarration({ authorization: request.headers.authorization, form: await readForm(request, 25 * 1024 * 1024) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-authoring/backups') {
      return sendJson(response, 200, await courseBackups.verifyBackups({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/course-authoring/export') {
      const url = new URL(request.url || '/', 'http://localhost');
      const result = await courseBackups.downloadExport({ authorization: request.headers.authorization, courseId: url.searchParams.get('courseId'), version: url.searchParams.get('version') });
      return send(response, 200, result.archive, {
        ...securityHeaders('/api', { api: true }),
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': result.archive.length
      });
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-authoring/publish') {
      return sendJson(response, 200, await courseBackups.publish({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/courses') {
      return sendJson(response, 200, await courseCatalog.catalogue({ authorization: request.headers.authorization }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/course-manifest') {
      const url = new URL(request.url || '/', 'http://localhost');
      return sendJson(response, 200, await courseCatalog.manifest({ authorization: request.headers.authorization, courseId: url.searchParams.get('courseId'), version: url.searchParams.get('version') }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/courses/check-answer') {
      return sendJson(response, 200, await courseCatalog.checkAnswer({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/courses/distribution') {
      return sendJson(response, 200, await courseCatalog.setDistribution({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/courses/request-platform-release') {
      return sendJson(response, 200, await courseCatalog.requestPlatformRelease({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/ai/chat') {
      return sendJson(response, 200, await ai.chat({
        authorization: request.headers.authorization,
        body: await readJson(request),
        localGuest: localGuestFromRequest(request, config)
      }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/adaptive-recall') {
      return sendJson(response, 200, await adaptiveRecall.analyse({
        authorization: request.headers.authorization,
        body: await readJson(request),
        localGuest: localGuestFromRequest(request, config)
      }));
    }
    // ADAPTIVE LEARNING: these routes only accept the compact, validated
    // summaries/decisions described in AI_ADAPTIVE_LEARNING_README.md. They
    // never receive raw keystrokes, recordings, chat history, or answer keys.
    if (request.method === 'POST' && pathname === '/api/v1/adaptive/consent') {
      return sendJson(response, 200, await learningAnalytics.setConsent({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'GET' && pathname === '/api/v1/adaptive/consent') {
      return sendJson(response, 200, await learningAnalytics.getConsent({ authorization: request.headers.authorization }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/learning-summary') {
      return sendJson(response, 200, await learningAnalytics.saveSummary({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/behaviour/directive') {
      return sendJson(response, 200, await behaviouralPartner.directive({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/adaptive/proposal') {
      return sendJson(response, 200, await adaptiveSupport.proposal({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    const proposalDecision = pathname.match(/^\/api\/v1\/adaptive\/proposal\/([A-Za-z0-9_-]{1,100})\/decision$/);
    if (request.method === 'POST' && proposalDecision) {
      return sendJson(response, 200, await adaptiveSupport.decide({ authorization: request.headers.authorization, proposalId: proposalDecision[1], body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/privacy/adaptive-data-export') {
      return sendJson(response, 200, await learningAnalytics.exportData({ authorization: request.headers.authorization }));
    }
    if (request.method === 'DELETE' && pathname === '/api/v1/privacy/adaptive-data') {
      return sendJson(response, 200, await learningAnalytics.clear({ authorization: request.headers.authorization }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/assessment/drafts') {
      return sendJson(response, 200, await assessments.createDraft({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/assessment/publish') {
      return sendJson(response, 200, await assessments.publishDraft({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/assessment/start') {
      return sendJson(response, 200, await assessments.start({ authorization: request.headers.authorization, body: await readJson(request) }));
    }
    const assessmentRun = pathname.match(/^\/api\/v1\/assessment\/([A-Za-z0-9_-]{1,100})$/);
    if (assessmentRun && request.method === 'GET') {
      return sendJson(response, 200, await assessments.getRun({ authorization: request.headers.authorization, runId: assessmentRun[1] }));
    }
    if (assessmentRun && request.method === 'POST') {
      return sendJson(response, 200, await assessments.answer({ authorization: request.headers.authorization, runId: assessmentRun[1], body: await readJson(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/speech/transcribe') {
      return sendJson(response, 200, await speech.transcribe({ authorization: request.headers.authorization, form: await readForm(request) }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/speech/synthesise') {
      const result = await speech.synthesise({ authorization: request.headers.authorization, body: await readJson(request) });
      return send(response, 200, result.audio, {
        ...securityHeaders('/api', { api: true }),
        'Content-Type': result.contentType,
        'Content-Length': result.audio.length
      });
    }
    if (request.method === 'GET' && pathname === '/api/v1/course-progress') {
      const courseId = new URL(request.url || '/', 'http://localhost').searchParams.get('courseId') || '';
      return sendJson(response, 200, await courseProgress.load({ authorization: request.headers.authorization, courseId }));
    }
    if (request.method === 'POST' && pathname === '/api/v1/course-progress') {
      const body = await readJson(request);
      return sendJson(response, 200, await courseProgress.save({ authorization: request.headers.authorization, courseId: String(body?.courseId || ''), body }));
    }
    return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'This API route does not exist.' } });
  } catch (error) {
    const publicFailure = publicError(error);
    if (publicFailure.status >= 500) console.error('[ai-service]', publicFailure.code);
    return sendJson(response, publicFailure.status, { error: { code: publicFailure.code, message: publicFailure.message } });
  }
};

export const startServer = async () => {
  const runtime = await buildRuntime();
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const pathname = url.pathname;
    try {
      if (pathname.startsWith('/api/')) return await handleApi(request, response, pathname, runtime);
      const redirectPath = pathname.replace(/\/index\.html$/, '/');
      const redirect = redirects.get(pathname) || redirects.get(redirectPath);
      if (redirect) return send(response, 301, '', { ...securityHeaders(pathname), Location: redirect });
      if (!['GET', 'HEAD'].includes(request.method || 'GET')) return send(response, 405, 'Method not allowed', { ...securityHeaders(pathname), Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return await serveStatic(request, response, pathname);
    } catch {
      if (!response.headersSent) send(response, 500, 'Unable to load this page.', { ...securityHeaders(pathname), 'Content-Type': 'text/plain; charset=utf-8' });
      else response.end();
    }
  });
  server.listen(runtime.config.port, runtime.config.host, () => {
    console.info(`Type2Learn is running at http://127.0.0.1:${runtime.config.port}`);
  });
  return server;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((error) => {
    console.error('Type2Learn could not start.', error?.message || error);
    process.exitCode = 1;
  });
}
