import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { companionBubbleMarkup } from '../../course/learning-partner.js';

const css = await readFile(new URL('../../course/course.css', import.meta.url), 'utf8');
const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('mascot bubble retains every name in a long reviewed team answer', () => {
  const message = 'Type2Learn was founded by six CEME students: Muhammad Taha Bin Zaeem (Development Lead), Muhammad Hamiz Bin Kashif (Engineering Lead), Muhammad Fahad Younus (AI Lead), Idrees Babar (Research Lead), Alizay Hassan (Product Lead), and Lameea Mubashir Khan (UI/UX Design Lead).';
  const markup = companionBubbleMarkup({
    directive: { source: 'companion-chat', message },
    language: 'en',
    escapeHtml
  });

  for (const person of ['Muhammad Taha Bin Zaeem', 'Muhammad Hamiz Bin Kashif', 'Muhammad Fahad Younus', 'Idrees Babar', 'Alizay Hassan', 'Lameea Mubashir Khan']) {
    assert.match(markup, new RegExp(person));
  }
  assert.match(markup, /UI\/UX Design Lead/);
});

test('desktop companion bubbles grow for complete answers rather than clipping them', () => {
  const bubbleCss = css.slice(css.indexOf('.course-companion-bubble {'), css.indexOf('.course-companion-bubble::after'));
  assert.match(bubbleCss, /max-height:\s*none/);
  assert.match(bubbleCss, /overflow:\s*visible/);
  assert.match(bubbleCss, /overflow-wrap:\s*anywhere/);
});

test('the ordinary mascot dialogue also wraps a full factual answer instead of cropping it', () => {
  const dialogueCss = css.slice(css.indexOf('.course-mascot-dialogue {'), css.indexOf('.course-mascot-listen'));
  assert.match(dialogueCss, /max-height:\s*none/);
  assert.match(dialogueCss, /overflow:\s*visible/);
  assert.match(dialogueCss, /overflow-wrap:\s*anywhere/);
});
