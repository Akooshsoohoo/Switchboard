// Real main process + two windows + a real shell: moves a running session between windows.
// Run with `npm run test:move`.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-move-')));
require('../main.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (w, code) => w.webContents.executeJavaScript(code).catch((e) => { console.error("FAILED:", code.slice(0, 80)); throw e; });
// Everything xterm has on screen and in scrollback, as one string.
const screenText = (w, id) => run(w, `(() => {
  const b = sessions.get(${id}).term.buffer.active;
  let text = '';
  for (let i = 0; i < b.length; i++) text += b.getLine(i).translateToString(true) + '\\n';
  return text;
})()`);
async function until(check, what) {
  for (let i = 0; i < 60; i++) { if (await check()) return; await wait(250); }
  throw new Error(`Timed out waiting for ${what}`);
}

app.whenReady().then(async () => {
  try {
    await wait(1500);
    const [w1] = BrowserWindow.getAllWindows();
    assert.ok(w1, 'first window opens');
    await until(async () => (await run(w1, 'sessions.size')) === 1, 'first window to start a terminal');
    const id = await run(w1, '[...sessions.keys()][0]');

    // Ctrl+Shift+N opens a second window.
    w1.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'N', modifiers: ['control', 'shift'] });
    await until(() => BrowserWindow.getAllWindows().length === 2, 'second window');
    const w2 = BrowserWindow.getAllWindows().find((w) => w !== w1);
    await until(async () => (await run(w2, 'sessions.size')) === 1, 'second window to start a terminal');
    const id2 = await run(w2, '[...sessions.keys()][0]');
    assert.notEqual(id, id2, 'two windows never share a session id');

    // Output typed before the move must still be there after it.
    await run(w1, `window.pty.write(${id}, 'echo BEFORE_MOVE_123\\r')`);
    await until(async () => (await screenText(w1, id)).includes('BEFORE_MOVE_123'), 'shell output in window 1');

    // Drag from window 1, drop in window 2.
    await run(w1, `window.sessionMove.dragBegin(${id}, 'terminal')`);
    await until(async () => (await run(w2, 'externalDrag && externalDrag.id')) === id, 'window 2 to learn about the drag');
    await run(w2, 'adoptSession(externalDrag, (sid) => showInFocused(sid))');
    await until(async () => (await run(w2, `sessions.has(${id})`)), 'session to arrive in window 2');
    assert.equal(await run(w1, `sessions.has(${id})`), false, 'window 1 let go of it');
    assert.ok((await screenText(w2, id)).includes('BEFORE_MOVE_123'), 'earlier output was replayed');

    // The same shell keeps running, and its output now goes to window 2 only.
    await run(w2, `window.pty.write(${id}, 'echo AFTER_MOVE_456\\r')`);
    await until(async () => (await screenText(w2, id)).includes('AFTER_MOVE_456'), 'shell output in window 2');
    assert.equal(await run(w1, 'externalDrag'), null, 'drag state cleared');

    // A closed window takes its remaining sessions with it, and the other window carries on.
    w1.destroy();
    await wait(300);
    assert.equal(await run(w2, `sessions.has(${id})`), true);
    console.log('move-test passed');
    app.exit(0);
  } catch (error) {
    console.error(error && error.stack || error);
    app.exit(1);
  }
});
