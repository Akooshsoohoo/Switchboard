const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the renderer's actual layout functions without starting terminal processes.
const source = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
function setup() {
  const context = vm.createContext({
    document: { getElementById: () => ({}), addEventListener() {} },
    window: { SwitchboardStatus: require('../session-status'), pty: { onData(handler) { this.receive = handler; }, onExit() {} }, addEventListener() {} },
    ResizeObserver: class { observe() {} },
    render() {},
  });
  vm.runInContext(source.split('// ---------- drag to split ----------')[0], context);
  vm.runInContext('for (let id = 1; id <= 5; id++) sessions.set(id, { id, unseen: true });', context);
  return (code) => {
    const value = vm.runInContext(code, context);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  };
}

test('all four edges split in the intended direction and focus the dragged session', () => {
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const run = setup();
    run(`showInFocused(1); placeSession(2, 1, '${edge}');`);
    const before = edge === 'left' || edge === 'top';
    assert.deepEqual(run('layout'), {
      axis: ['left', 'right'].includes(edge) ? 'x' : 'y', ratio: 0.5,
      first: { id: before ? 2 : 1 }, second: { id: before ? 1 : 2 },
    });
    assert.equal(run('panes[focused]'), 2);
    assert.equal(run('sessions.get(2).unseen'), false);
  }
});

test('nested splits move existing sessions once and collapse their old branch', () => {
  const run = setup();
  run("showInFocused(1); placeSession(2, 1, 'right'); placeSession(3, 2, 'bottom');");
  assert.equal(run('layout.second.axis'), 'y');
  run("placeSession(1, 3, 'left');");
  assert.deepEqual(run('panes'), [2, 1, 3]);
  assert.equal(run('layout.axis'), 'y');
  assert.equal(run('layout.second.axis'), 'x');
});

test('center drops swap visible sessions or replace with a hidden session', () => {
  const run = setup();
  run("showInFocused(1); addPane(2); placeSession(1, 2, 'center');");
  assert.deepEqual(run('panes'), [2, 1]);
  run("placeSession(3, 2, 'center');");
  assert.deepEqual(run('panes'), [3, 1]);
  assert.equal(run('sessions.has(2)'), true);
});

test('closing panes preserves focus and collapses splits down to an empty layout', () => {
  const run = setup();
  run("showInFocused(1); addPane(2); placeSession(3, 2, 'bottom'); removePane(0);");
  assert.equal(run('panes[focused]'), 3);
  run('removePane(1);');
  assert.deepEqual(run('layout'), { id: 2 });
  run('removePane(0);');
  assert.equal(run('layout'), null);
  run("placeSession(4, null, 'center');");
  assert.deepEqual(run('panes'), [4]);
});

test('self drops and stale targets leave the layout intact', () => {
  const run = setup();
  run('showInFocused(1); addPane(2);');
  const before = run('layout');
  run("placeSession(1, 1, 'left'); placeSession(3, 5, 'right'); placeSession(99, 1, 'top');");
  assert.deepEqual(run('layout'), before);
});

test('sidebar reorder moves sessions before or after a row without changing panes or session state', () => {
  const run = setup();
  run('showInFocused(1); addPane(2); const original = sessions.get(1);');
  const layout = run('layout');
  run('reorderSession(1, 3, true);');
  assert.deepEqual(run('[...sessions.keys()]'), [2, 3, 1, 4, 5]);
  run('reorderSession(5, 2);');
  assert.deepEqual(run('[...sessions.keys()]'), [5, 2, 3, 1, 4]);
  run('reorderSession(2, 4, true);');
  assert.deepEqual(run('[...sessions.keys()]'), [5, 3, 1, 4, 2]);
  assert.equal(run('sessions.get(1) === original'), true);
  assert.deepEqual(run('layout'), layout);
  assert.deepEqual(run('panes'), [1, 2]);
  assert.equal(run('panes[focused]'), 2);
});

test('sidebar reorder ignores self drops and missing sessions', () => {
  const run = setup();
  run('reorderSession(2, 2); reorderSession(99, 1); reorderSession(1, 99);');
  assert.deepEqual(run('[...sessions.keys()]'), [1, 2, 3, 4, 5]);
});

test('busy terminal output preserves sidebar click targets while updating metadata', () => {
  const run = setup();
  run(`
    const metadata = { textContent: '', title: '', hidden: true };
    listEl.querySelector = () => metadata;
    renderSidebar = () => { throw new Error('Output must not rebuild click targets'); };
    Object.assign(sessions.get(1), {
      term: { write() {} }, metadataOutput: '', agent: null, model: null, quietUntil: 0,
    });
    window.pty.receive(1, 'OpenAI Codex model: gpt-5');
  `);
  assert.equal(run('metadata.textContent'), 'Codex · gpt-5');
  assert.equal(run('metadata.hidden'), false);
  run("for (let i = 0; i < 100; i++) window.pty.receive(1, 'working...');");
  assert.equal(run('sessions.get(1).lastOutputAt > 0'), true);
});
