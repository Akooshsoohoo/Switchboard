// Output within this long counts as "working"; quieter than this means "waiting for you".
const WORKING_WINDOW_MS = 1500;
// Output right after a keystroke or resize is just echo/redraw, not the agent doing work.
const KEY_QUIET_MS = 300;
const RESIZE_QUIET_MS = 600;

const sessions = new Map(); // id -> session
let panes = []; // ids of the sessions shown, left to right
let weights = []; // flex-grow for each pane, same order as panes
let focused = 0; // index into panes
let nextId = 1;

const listEl = document.getElementById('session-list');
const mainEl = document.getElementById('main');

// ---------- sessions ----------

function createSession() {
  const id = nextId++;
  const term = new Terminal({
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: { background: '#1a1b1e' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);

  const host = document.createElement('div');
  host.className = 'term-host';

  const s = {
    id,
    name: `term-${id}`,
    term,
    fit,
    host,
    opened: false,
    lastOutputAt: 0,
    quietUntil: 0,
    working: false,
    unseen: false,
    exited: false,
  };
  sessions.set(id, s);

  term.onData((data) => {
    s.quietUntil = Date.now() + KEY_QUIET_MS;
    window.pty.write(id, data);
  });
  term.attachCustomKeyEventHandler((e) => handleKey(e, s));

  window.pty.create(id, 80, 24);
  return s;
}

function killSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  window.pty.kill(id);
  s.term.dispose();
  sessions.delete(id);
  const i = panes.indexOf(id);
  if (i !== -1) removePane(i);
  else render();
}

function renameSession(id, name) {
  const s = sessions.get(id);
  if (s && name.trim()) s.name = name.trim();
  render();
}

window.pty.onData((id, data) => {
  const s = sessions.get(id);
  if (!s) return;
  s.term.write(data);
  if (Date.now() > s.quietUntil) s.lastOutputAt = Date.now();
});

window.pty.onExit((id) => {
  const s = sessions.get(id);
  if (!s) return;
  s.exited = true;
  s.term.write('\r\n[process exited]\r\n');
  render();
});

// ---------- keys & clipboard ----------

function handleKey(e, s) {
  if (e.type !== 'keydown') return true;
  const key = e.key.toLowerCase();

  if (e.ctrlKey && e.shiftKey && key === 't') {
    showInFocused(createSession().id);
    return false;
  }
  if (e.ctrlKey && e.shiftKey && key === 'w') {
    removePane(focused);
    return false;
  }
  // Ctrl+C copies when text is selected; otherwise it goes to the shell as an interrupt.
  if (e.ctrlKey && !e.shiftKey && key === 'c' && s.term.hasSelection()) {
    window.clip.write(s.term.getSelection());
    s.term.clearSelection();
    return false;
  }
  if (e.ctrlKey && key === 'v') {
    e.preventDefault();
    window.clip.read().then((text) => text && s.term.paste(text));
    return false;
  }
  return true;
}

document.addEventListener('keydown', (e) => {
  // Shortcuts still work when no terminal has focus (e.g. after closing the last pane).
  if (e.target.closest('.xterm') || e.target.classList.contains('rename')) return;
  const key = e.key.toLowerCase();
  if (e.ctrlKey && e.shiftKey && key === 't') showInFocused(createSession().id);
});

// ---------- panes ----------

function showInFocused(id) {
  const existing = panes.indexOf(id);
  if (existing !== -1) {
    focused = existing;
  } else if (panes.length === 0) {
    panes = [id];
    weights = [1];
    focused = 0;
  } else {
    panes[focused] = id;
  }
  sessions.get(id).unseen = false;
  render();
}

function addPane(id) {
  const existing = panes.indexOf(id);
  if (existing !== -1) {
    focused = existing;
  } else {
    panes.push(id);
    weights.push(1);
    focused = panes.length - 1;
  }
  sessions.get(id).unseen = false;
  render();
}

function removePane(i) {
  if (i < 0 || i >= panes.length) return;
  panes.splice(i, 1);
  weights.splice(i, 1);
  focused = Math.max(0, Math.min(focused, panes.length - 1));
  render();
}

function fitVisible() {
  for (const id of panes) {
    const s = sessions.get(id);
    if (!s || !s.opened) continue;
    const { cols, rows } = s.term;
    s.fit.fit();
    if (s.term.cols !== cols || s.term.rows !== rows) {
      s.quietUntil = Date.now() + RESIZE_QUIET_MS;
      window.pty.resize(id, s.term.cols, s.term.rows);
    }
  }
}

new ResizeObserver(() => fitVisible()).observe(mainEl);

function startDividerDrag(e, i) {
  e.preventDefault();
  const left = mainEl.querySelectorAll('.pane')[i];
  const right = mainEl.querySelectorAll('.pane')[i + 1];
  const startX = e.clientX;
  const leftW = left.getBoundingClientRect().width;
  const rightW = right.getBoundingClientRect().width;
  const total = weights[i] + weights[i + 1];

  function move(ev) {
    const newLeft = Math.max(120, Math.min(leftW + rightW - 120, leftW + ev.clientX - startX));
    weights[i] = (total * newLeft) / (leftW + rightW);
    weights[i + 1] = total - weights[i];
    left.style.flexGrow = weights[i];
    right.style.flexGrow = weights[i + 1];
    fitVisible();
  }
  function up() {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

// ---------- rendering ----------

function startRename(nameEl, id) {
  const input = document.createElement('input');
  input.className = 'rename';
  input.value = sessions.get(id).name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save) renameSession(id, input.value);
    else render();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

function statusClass(s) {
  if (s.exited) return 'exited';
  return s.working ? 'working' : 'waiting';
}

function statusText(s) {
  if (s.exited) return 'exited';
  return s.working ? 'working' : 'waiting';
}

function renderSidebar() {
  listEl.replaceChildren();
  for (const s of sessions.values()) {
    const row = document.createElement('div');
    row.className = `row ${statusClass(s)}`;
    row.dataset.id = s.id;
    if (panes.includes(s.id)) row.classList.add('shown');
    if (s.unseen) row.classList.add('unseen');
    row.title = 'Click: show here · Ctrl+click: open beside · Double-click name: rename';

    const dot = document.createElement('span');
    dot.className = 'dot';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = s.name;
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = statusText(s);
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.title = 'Kill session';

    row.append(dot, name, status, x);
    row.addEventListener('click', (e) => (e.ctrlKey ? addPane(s.id) : showInFocused(s.id)));
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(name, s.id);
    });
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      killSession(s.id);
    });
    listEl.append(row);
  }
}

function renderPanes() {
  mainEl.replaceChildren();
  if (panes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = sessions.size
      ? 'Click a session in the sidebar to show it.'
      : 'Press + New (Ctrl+Shift+T) to start a session.';
    mainEl.append(empty);
    return;
  }

  panes.forEach((id, i) => {
    const s = sessions.get(id);
    if (i > 0) {
      const divider = document.createElement('div');
      divider.className = 'divider';
      divider.addEventListener('mousedown', (e) => startDividerDrag(e, i - 1));
      mainEl.append(divider);
    }

    const pane = document.createElement('div');
    pane.className = 'pane';
    if (i === focused) pane.classList.add('focused');
    pane.style.flexGrow = weights[i];

    const title = document.createElement('div');
    title.className = 'pane-title';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = s.name;
    name.addEventListener('dblclick', () => startRename(name, id));
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.title = 'Close pane (session keeps running) · Ctrl+Shift+W';
    x.addEventListener('click', () => removePane(panes.indexOf(id)));
    title.append(name, x);

    const body = document.createElement('div');
    body.className = 'pane-body';
    body.append(s.host);

    pane.append(title, body);
    pane.addEventListener('mousedown', () => {
      if (focused !== panes.indexOf(id)) {
        focused = panes.indexOf(id);
        mainEl.querySelectorAll('.pane').forEach((p, j) => p.classList.toggle('focused', j === focused));
      }
    });
    mainEl.append(pane);

    // xterm needs to be in the DOM to measure its font, so open on first show.
    if (!s.opened) {
      s.term.open(s.host);
      s.opened = true;
      s.term.textarea.addEventListener('focus', () => {
        const j = panes.indexOf(id);
        if (j !== -1 && j !== focused) {
          focused = j;
          mainEl.querySelectorAll('.pane').forEach((p, k) => p.classList.toggle('focused', k === focused));
        }
      });
    }
  });

  requestAnimationFrame(() => {
    fitVisible();
    for (const id of panes) sessions.get(id).term.refresh(0, sessions.get(id).term.rows - 1);
    sessions.get(panes[focused])?.term.focus();
  });
}

function render() {
  renderSidebar();
  renderPanes();
}

// ---------- status ----------

setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) {
    const working = !s.exited && now - s.lastOutputAt < WORKING_WINDOW_MS;
    // Finished while you weren't looking: highlight it until you show it.
    if (s.working && !working && !panes.includes(s.id)) s.unseen = true;
    s.working = working;

    const row = listEl.querySelector(`.row[data-id="${s.id}"]`);
    if (!row) continue;
    row.classList.remove('working', 'waiting', 'exited');
    row.classList.add(statusClass(s));
    row.classList.toggle('unseen', s.unseen);
    row.querySelector('.status').textContent = statusText(s);
  }
}, 500);

document.getElementById('new-session').addEventListener('click', () => showInFocused(createSession().id));

showInFocused(createSession().id);
