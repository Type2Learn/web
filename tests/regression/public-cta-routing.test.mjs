import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../app.js', import.meta.url), 'utf8');

test('the reusable public CTA helper preserves its explicit destination', () => {
  assert.match(source, /const button = \(label, href, kind\) => \{[\s\S]*?let destination =/);
  assert.match(source, /href="' \+ destination \+ '"/);
  assert.doesNotMatch(source, /const button = \(label, href, kind\) =>[^;]*href="\/login\//);
});

test('public preview, pathway, team, and support CTAs name their real destinations', () => {
  const expectedCtas = [
    ["Try the learning demo", '#demo'],
    ['Explore pathways', '/pathways/'],
    ['Meet the team', '/team/'],
    ['Try the local demo', '/#demo'],
    ['راستے دریافت کریں', '/ur/pathways/'],
    ['یہ پیش منظر آزمائیں', '/ur/#demo']
  ];

  for (const [label, destination] of expectedCtas) {
    assert.ok(
      source.includes(`button('${label}', '${destination}'`) || source.includes(`'${label}', '${destination}'`),
      `${label} should point to ${destination}`
    );
  }
});

test('legacy direct anchors are normalised to public preview and support routes', () => {
  assert.match(source, /\.story-action\[href="\/login\/"\]/);
  assert.match(source, /link\.href = previewDestination/);
  assert.match(source, /Try the learning preview/);
  assert.match(source, /Find support options/);
  assert.match(source, /\/community\/#support/);
  assert.match(source, /a\.button\[href="\/ur\/#demo"\]/);
  assert.match(source, /یہ پیش منظر آزمائیں/);
});

test('only the explicitly remapped Urdu preview and labelled start controls retain a legacy sign-in literal', () => {
  const loginAnchors = [...source.matchAll(/<a class="button button-primary(?: is-small)?" href="\/login\/">([^<]+)/g)]
    .map((match) => match[1].trim());
  assert.deepEqual(loginAnchors, ["' + getStarted + icon('arrow', true) + '", "' + getStarted + icon('arrow', true) + '"]);
  assert.match(source, /label === 'اب آزمائیں'\) destination = '\/ur\/#demo'/);
});
