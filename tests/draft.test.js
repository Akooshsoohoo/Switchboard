const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isBinary, draftName, unifiedDiff } = require('../draft');

test('identical text gives an empty diff', () => {
  assert.equal(unifiedDiff('a\nb\n', 'a\nb\n'), '');
  assert.equal(unifiedDiff('', ''), '');
});

test('added, removed and changed lines show with +, - and context', () => {
  const orig = 'one\ntwo\nthree\nfour\n';
  assert.match(unifiedDiff(orig, 'one\ntwo\nthree\nfour\nfive\n'), /^\+five$/m);
  assert.match(unifiedDiff(orig, 'one\nthree\nfour\n'), /^-two$/m);
  const changed = unifiedDiff(orig, 'one\nTWO\nthree\nfour\n');
  assert.match(changed, /^-two$/m);
  assert.match(changed, /^\+TWO$/m);
  assert.match(changed, /^ one$/m);
  assert.match(changed, /^@@ -1,4 \+1,4 @@$/m);
});

test('the diff header names the file and marks which side is the draft', () => {
  const diff = unifiedDiff('a\n', 'b\n', 'x.py');
  assert.match(diff, /^--- x\.py \(original\)\n\+\+\+ x\.py \(draft\)\n/);
});

test('distant changes become separate hunks', () => {
  const orig = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n') + '\n';
  const edited = orig.replace('line2\n', 'LINE2\n').replace('line27\n', 'LINE27\n');
  assert.equal((unifiedDiff(orig, edited).match(/^@@/gm) || []).length, 2);
});

test('writing to an empty original shows every line as added', () => {
  const diff = unifiedDiff('', 'a\nb\n');
  assert.match(diff, /@@ -1,0 \+1,2 @@/);
  assert.equal((diff.match(/^\+[ab]$/gm) || []).length, 2);
});

test('binary detection looks for NUL bytes', () => {
  assert.equal(isBinary('plain text'), false);
  assert.equal(isBinary('a\u0000b'), true);
});

test('draft names are stable, safe, and differ by path', () => {
  const a = draftName('C:\\proj\\src\\main.py');
  assert.equal(a, draftName('C:\\proj\\src\\main.py'));
  assert.notEqual(a, draftName('C:\\other\\main.py'));
  assert.match(a, /^[0-9a-f]{8}-main\.py$/);
  assert.match(draftName('C:\\x\\we ird:name?.txt'), /^[0-9a-f]{8}-we_ird_name_\.txt$/);
});
