const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isApprovalPrompt, statusClass, statusText } = require('../session-status');
const { terminalTheme } = require('../appearance');

test('recognizes CLI permission prompts, including framed ANSI output', () => {
  for (const prompt of [
    'Do you want to proceed?\n❯ 1. Yes\n  2. No',
    'Would you like to run the following command?\n npm run build',
    '\x1b[31m│ Allow this command?\x1b[0m\r\n│ Yes / No',
    'Approval required', 'Waiting for your approval',
  ]) assert.equal(isApprovalPrompt(prompt), true, prompt);
});
test('ordinary output, user questions and inactivity do not imply approval', () => {
  for (const text of ['', 'Working...', 'What would you like to do next?',
    'Approval detection is implemented.', 'The user asked: Do you want to proceed?',
    'Build completed\nPS C:\\project>', 'Do you want to change the color?']) {
    assert.equal(isApprovalPrompt(text), false, text);
  }
});
test('historical permission prompts outside the recent tail are ignored', () => {
  assert.equal(isApprovalPrompt('Do you want to proceed?\n' + 'working\n'.repeat(500)), false);
});
test('approval outranks output activity and process exit outranks approval', () => {
  assert.equal(statusClass({ working: true, approval: true }), 'approval');
  assert.equal(statusClass({ exited: true, approval: true }), 'exited');
  assert.equal(statusText({ approval: true }), 'Approval needed');
  assert.equal(statusText({}), 'Waiting for you');
});
test('appearance changes keep tint identity and readable terminal foregrounds', () => {
  for (const tint of ['Default', 'Blue', 'Green', 'Purple', 'Rose', 'Amber']) {
    const light = terminalTheme('light', tint), dark = terminalTheme('dark', tint);
    assert.notEqual(light.background, dark.background);
    assert.notEqual(light.foreground, dark.foreground);
    assert.notEqual(light.foreground, light.background);
  }
  const changed = terminalTheme('light'); changed.background = '#000';
  assert.equal(terminalTheme('light').background, '#ffffff');
});
