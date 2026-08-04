import { execFileSync } from 'node:child_process';

const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8'
}).split(/\r?\n/).filter(Boolean);

const forbiddenPaths = [
  /^security\/api\.env$/i,
  /(^|\/)\.env(?:\.[^/]+)?$/i,
  /(^|\/)(?:service[-_]?account|credentials|secrets?)[^/]*\.json$/i,
  /\.(?:pem|key|p12)$/i
];

const allowedExample = /(?:^|\/)[^/]+\.env\.example$/i;
const blockedPaths = stagedFiles.filter((file) => !allowedExample.test(file) && forbiddenPaths.some((pattern) => pattern.test(file)));

const secretPatterns = [
  { label: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'private_key credential field', pattern: /["']private_key["']\s*:\s*["']/ },
  // These only match a literal assignment at the beginning of a line. That
  // catches a pasted env-style credential without mistaking runtime lookup
  // code such as value('OPENAI_API_KEY', 'key') for a secret.
  { label: 'Speechmatics API key assignment', pattern: /(?:^|\r?\n)\s*(?:SPEECHMATICS_API_KEY|speech)\s*=\s*["']?[A-Za-z0-9_-]{20,}["']?\s*(?:;)?(?:$|\r?\n)/im },
  { label: 'OpenAI API key assignment', pattern: /(?:^|\r?\n)\s*(?:OPENAI_API_KEY|openai)\s*=\s*["']?[A-Za-z0-9_-]{20,}["']?\s*(?:;)?(?:$|\r?\n)/im }
];

const matchedSecrets = [];
for (const file of stagedFiles) {
  if (allowedExample.test(file)) continue;
  if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|toml|ini|env|txt|md)$/i.test(file)) continue;
  let stagedText = '';
  try {
    stagedText = execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    continue;
  }
  for (const { label, pattern } of secretPatterns) {
    if (pattern.test(stagedText)) matchedSecrets.push(`${file} (${label})`);
  }
}

if (blockedPaths.length || matchedSecrets.length) {
  console.error('\nCommit blocked: a possible secret was staged.');
  if (blockedPaths.length) console.error('Forbidden files:\n' + blockedPaths.map((file) => `  - ${file}`).join('\n'));
  if (matchedSecrets.length) console.error('Secret matches:\n' + matchedSecrets.map((match) => `  - ${match}`).join('\n'));
  console.error('\nUse an ignored local secret file or a deployment secret instead.');
  process.exit(1);
}
