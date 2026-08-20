/**
 * Release quality gate.
 *
 * A passing process exit code is not enough for a deployment: this guard also
 * rejects an accidental large loss of test coverage. Keep the baseline in one
 * place so local pre-push checks and Render use identical release criteria.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const minimumPassingTests = 748;

const listTests = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTests(path);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  }));
  return nested.flat();
};

const testFiles = (await listTests('tests')).sort();
if (!testFiles.length) throw new Error('Release gate found no test files.');

const child = spawn(process.execPath, ['--test', ...testFiles], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

const exitCode = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});

const tests = Number(output.match(/# tests\s+(\d+)/)?.[1] || 0);
const passed = Number(output.match(/# pass\s+(\d+)/)?.[1] || 0);

if (exitCode !== 0) {
  throw new Error(`Release gate blocked: automated tests exited with ${exitCode}.`);
}
if (tests < minimumPassingTests) {
  throw new Error(`Release gate blocked: found ${tests} tests; at least ${minimumPassingTests} are required.`);
}
if (passed !== tests) {
  throw new Error(`Release gate blocked: ${passed}/${tests} tests passed.`);
}

console.log(`\nRelease gate passed: ${passed}/${tests} automated tests passed (baseline ${minimumPassingTests}).`);
