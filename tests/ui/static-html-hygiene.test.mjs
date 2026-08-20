import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// `tmp/` contains deliberately untracked investigation/check fixtures. It is
// never shipped by this repository, so release hygiene must scan the product
// tree rather than third-party research copies placed beside it locally.
const excludedDirectories = new Set(['.git', '.research', 'node_modules', 'tmp', 'vendor']);
const localAssetPattern = /\.(?:avif|css|glb|ico|jpe?g|js|mjs|mp3|ogg|pdf|png|svg|ttf|webp|woff2?)(?:$|[?#])/i;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) results.push(...await walk(path.join(directory, entry.name)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) results.push(path.join(directory, entry.name));
  }
  return results;
}

const htmlFiles = await walk(root);

async function walkSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) results.push(...await walkSources(path.join(directory, entry.name)));
      continue;
    }
    if (entry.isFile() && ['.js', '.mjs'].includes(path.extname(entry.name))) results.push(path.join(directory, entry.name));
  }
  return results;
}

const moduleFiles = await walkSources(root);

test('public HTML has one main landmark at most and avoids invalid body metadata', async () => {
  assert.ok(htmlFiles.length >= 30, 'the public-page scan should cover the complete routed site');
  for (const filename of htmlFiles) {
    const source = await readFile(filename, 'utf8');
    const label = path.relative(root, filename);
    assert.match(source, /^<!DOCTYPE html>/i, `${label} has a doctype`);
    assert.doesNotMatch(source, /<noscript>\s*<meta\b/i, `${label} keeps redirect metadata out of the body`);
    const mainCount = (source.match(/<main\b/gi) ?? []).length;
    assert.ok(mainCount <= 1, `${label} exposes no duplicate main landmark`);
  }
});

test('skip links have a focusable target in their static document', async () => {
  for (const filename of htmlFiles) {
    const source = await readFile(filename, 'utf8');
    const label = path.relative(root, filename);
    const skip = source.match(/<a class="skip-link" href="#([^"]+)"[^>]*>/i);
    if (!skip) continue;
    const targetId = skip[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(source, new RegExp(`id="${targetId}"`), `${label} skip link points to an existing target`);
  }
});

test('direct local HTML asset references resolve to committed files', async () => {
  for (const filename of htmlFiles) {
    const source = await readFile(filename, 'utf8');
    const label = path.relative(root, filename);
    const references = source.matchAll(/\b(?:href|src)="([^"]+)"/gi);
    for (const [, reference] of references) {
      if (!reference.startsWith('/') || reference.startsWith('//') || !localAssetPattern.test(reference)) continue;
      const pathname = reference.split(/[?#]/, 1)[0];
      const asset = path.resolve(root, `.${pathname}`);
      assert.ok(asset.startsWith(root + path.sep), `${label} does not escape the public root`);
      await assert.doesNotReject(access(asset), `${label} references a missing asset: ${reference}`);
    }
  }
});

test('first-party JavaScript and module imports resolve to a local source file', async () => {
  const importPattern = /\b(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g;
  for (const filename of moduleFiles) {
    const source = await readFile(filename, 'utf8');
    const label = path.relative(root, filename);
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1].replace(/[?#].*$/, '');
      const target = path.resolve(path.dirname(filename), specifier);
      await assert.doesNotReject(access(target), `${label} imports a missing local module: ${match[1]}`);
    }
  }
});

test('analytics markup is consistently module-based and legal tables do not create duplicate landmarks', async () => {
  for (const filename of htmlFiles) {
    const source = await readFile(filename, 'utf8');
    const label = path.relative(root, filename);
    if (source.includes('static.cloudflareinsights.com/beacon.min.js')) {
      assert.match(source, /<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"/, `${label} loads Cloudflare Analytics as a module`);
    }
    assert.doesNotMatch(source, /legal-table-scroll" role="region" aria-label="Policy table"/, `${label} does not repeat unnamed policy-table landmarks`);
  }
});
