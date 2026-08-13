import { readFileSync } from 'node:fs';
import { compileTheoryCourse, parseTheoryMarkdown, validateTheoryCourse } from './theory-course-markdown.mjs';

// The existing Neurodivergent Conditions course now has a real reviewed
// Markdown source artifact. This server-only module compiles that source
// deterministically and maintains the learner-safe/private-manifest boundary.
// The legacy browser implementation may remain available for old deep links,
// but it is no longer the publishing pipeline's curriculum source.
const sourceUrl = new URL('../course/authoring/neurodivergent-conditions.v1.md', import.meta.url);
const reviewedMarkdown = readFileSync(sourceUrl, 'utf8');

export const legacyNeurodivergentMarkdown = () => reviewedMarkdown;

export const migratedLegacyTheoryCourse = () => {
  const parsed = parseTheoryMarkdown(legacyNeurodivergentMarkdown());
  const validation = validateTheoryCourse(parsed);
  if (!validation.valid) throw new Error(`Legacy course Markdown is invalid: ${validation.errors.join(' ')}`);
  return { markdown: legacyNeurodivergentMarkdown(), validation, ...compileTheoryCourse(validation) };
};
