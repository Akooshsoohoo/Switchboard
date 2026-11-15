const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPromptLine } = require('../prompt-ticks');

test('recognizes echoed prompts at column 0', () => {
  for (const l of ['> fix the bug', '❯ add a test']) assert.equal(isPromptLine(l), true, l);
});

test('ignores the framed input box, replies, shell prompts and empty prompts', () => {
  for (const l of ['│ > fix the bug', '● Sure, fixing it', 'PS C:\> dir', '> ', '>', '  > indented', ''])
    assert.equal(isPromptLine(l), false, JSON.stringify(l));
});
