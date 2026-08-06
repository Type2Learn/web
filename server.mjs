import { createServer as createHttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiService } from './server/ai-service.mjs';
import { loadRuntimeConfig } from './server/config.mjs';
import { publicError, apiError } from './server/errors.mjs';
import { createFirebaseRuntime } from './server/firebase-runtime.mjs';
import { createSpeechService } from './server/speech-service.mjs';
import { createUsageLedger } from './server/usage-ledger.mjs';
import { createCourseProgressService } from './server/course-progress-service.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const redirects = new Map([
  ['/research', '/how-it-works/#evidence'],
  ['/accessibility', '/trust/#accessibility'],
  ['/security', '/trust/#security'],
  ['/support', '/community/#support']
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
const isAllowedOrigin = (request, config) => {
  const origin = asOrigin(request);
  return !origin || config.allowedOrigins.has(origin);
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

const readJson = async (request) => {
  const body = await readBody(request, 48 * 1024);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw apiError(400, 'INVALID_JSON', 'The AI request could not be read.');
  }
};

const readForm = async (request) => {
  const body = await readBody(request, 7 * 1024 * 1024);
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
  let target = safePathname(pathname);
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
  return {
    config,
    ai: createAiService({ config, firebase, ledger }),
    speech: createSpeechService({ config, firebase, ledger }),
    courseProgress: createCourseProgressService({ firebase })
  };
};

const handleApi = async (request, response, pathname, runtime) => {
  const { config, ai, speech, courseProgress } = runtime;
  if (!isAllowedOrigin(request, config)) {
    return sendJson(response, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This website is not allowed to use the AI service.' } });
  }
  if (request.method === 'GET' && pathname === '/api/v1/health') {
    return sendJson(response, 200, {
      ai: ai.status(),
      speechToText: speech.status(),
      courseProgress: courseProgress.status(),
      model: config.openAiModel
    });
  }
  try {
    if (request.method === 'POST' && pathname === '/api/v1/ai/chat') {
      return sendJson(response, 200, await ai.chat({ authorization: request.headers.authorization, body: await readJson(request) }));
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
      const redirect = redirects.get(pathname);
      if (redirect) return send(response, 302, '', { ...securityHeaders(pathname), Location: redirect });
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
