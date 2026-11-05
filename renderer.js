// Output within this long counts as "working"; quieter than this means "waiting for you".
const WORKING_WINDOW_MS = 1500;
// Output right after a keystroke or resize is just echo/redraw, not the agent doing work.
const KEY_QUIET_MS = 300;
const RESIZE_QUIET_MS = 600;

const sessions = new Map(); // id -> session
let panes = []; // visible session ids in layout order
let layout = null; // session leaf, or { axis, ratio, first, second }
let focused = 0; // index into panes
let nextId = 1;
let draggedId = null;
let dropTarget = null;

const listEl = document.getElementById('session-list');
const mainEl = document.getElementById('main');
let appearance = 'light';
try { appearance = localStorage.getItem('appearance') === 'dark' ? 'dark' : 'light'; } catch { /* Use light when storage is unavailable. */ }

function terminalTheme(tint) {
  return window.SwitchboardAppearance.terminalTheme(appearance, tint);
}

function statusClass(s) { return window.SwitchboardStatus.statusClass(s); }
function statusText(s) { return window.SwitchboardStatus.statusText(s); }

function updateSessionIndicators(s) {
  const row = listEl.querySelector(`.row[data-id="${s.id}"]`);
  if (!row) return;
  row.classList.remove('working', 'waiting', 'approval', 'exited');
  row.classList.add(statusClass(s));
  row.classList.toggle('unseen', s.unseen);
  row.setAttribute('aria-label', `${s.name}, ${statusText(s)}`);
  row.querySelector('.status').textContent = statusText(s);
  const dot = row.querySelector('.dot');
  dot.title = statusText(s);
  dot.setAttribute('aria-label', statusText(s));
}

const TINTS = [
  { name: 'Default', accent: null, background: '#1a1b1e' },
  { name: 'Blue', accent: '#6ba5ed', background: '#1d2d47' },
  { name: 'Green', accent: '#70bb93', background: '#1b3529' },
  { name: 'Purple', accent: '#b399e5', background: '#2e2649' },
  { name: 'Rose', accent: '#df93ac', background: '#40232f' },
  { name: 'Amber', accent: '#d9b36c', background: '#40341c' },
];
let sessionMenu = null;

function applyTint(element, s) {
  const tint = TINTS.find((t) => t.name === s.tint) || TINTS[0];
  if (tint.accent) {
    element.style.setProperty('--session-accent', tint.accent);
    element.style.setProperty('--session-tint', terminalTheme(tint.name).background);
  }
}

function setSessionTint(id, tint) {
  const s = sessions.get(id);
  if (!s) return;
  s.tint = tint.name;
  s.term.options.theme = terminalTheme(tint.name);
  s.host.style.background = s.term.options.theme.background;
  renderSidebar();
  const pane = mainEl.querySelector(`.pane[data-id="${id}"]`);
  if (pane) {
    pane.style.removeProperty('--session-accent');
    pane.style.removeProperty('--session-tint');
    applyTint(pane, s);
  }
}

function closeSessionMenu(restoreFocus = false) {
  if (!sessionMenu) return;
  sessionMenu.remove();
  sessionMenu = null;
  if (restoreFocus) sessions.get(panes[focused])?.term.focus();
}

function showSessionMenu(e, id) {
  const s = sessions.get(id);
  if (!s) return;
  e.preventDefault();
  closeSessionMenu();
  const menu = document.createElement('div');
  sessionMenu = menu;
  menu.className = 'session-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', `${s.name} options`);
  const heading = document.createElement('div');
  heading.className = 'menu-heading';
  heading.textContent = 'Color tint';
  menu.append(heading);
  function item(label, action, tint) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', tint ? 'menuitemradio' : 'menuitem');
    if (tint) {
      button.setAttribute('aria-checked', String((s.tint || 'Default') === tint.name));
      const swatch = document.createElement('span');
      swatch.className = 'tint-swatch';
      swatch.style.background = tint.accent || '#8a8d96';
      button.append(swatch);
    }
    button.append(document.createTextNode(label));
    button.addEventListener('click', () => { closeSessionMenu(); action(); });
    menu.append(button);
  }
  for (const tint of TINTS) item(tint.name, () => {
    setSessionTint(id, tint);
    sessions.get(panes[focused])?.term.focus();
  }, tint);
  const divider = document.createElement('div');
  divider.className = 'menu-separator';
  menu.append(divider);
  item('Rename', () => {
    const name = listEl.querySelector(`.row[data-id="${id}"] .name`);
    if (name && sessions.has(id)) startRename(name, id);
  });
  if (!panes.includes(id)) item('Open beside', () => addPane(id));
  else item('Close pane', () => removePane(panes.indexOf(id)));
  item('Kill session', () => killSession(id));
  menu.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape' || event.key === 'Tab') { closeSessionMenu(true); return; }
    const buttons = [...menu.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(e.clientX, window.innerWidth - rect.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(e.clientY, window.innerHeight - rect.height - 4))}px`;
  menu.querySelector('button').focus();
}

document.addEventListener('pointerdown', (e) => {
  if (sessionMenu && !sessionMenu.contains(e.target)) closeSessionMenu();
}, true);
document.addEventListener('contextmenu', (e) => {
  const target = e.target.closest('.row, .pane-title');
  if (target && !e.target.closest('input')) {
    showSessionMenu(e, Number((target.closest('[data-id]')).dataset.id));
  } else closeSessionMenu();
});
document.addEventListener('scroll', () => closeSessionMenu(), true);
window.addEventListener('blur', () => closeSessionMenu());
window.addEventListener('resize', () => closeSessionMenu());

// ---------- sessions ----------

function createSession(project) {
  const id = nextId++;
  const term = new Terminal({
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: terminalTheme(),
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);

  const host = document.createElement('div');
  host.className = 'term-host';

  const s = {
    id,
    name: project?.name || `term-${id}`,
    term,
    fit,
    host,
    opened: false,
    lastOutputAt: 0,
    quietUntil: 0,
    working: false,
    unseen: false,
    exited: false,
    approval: false,
    approvalOutput: '',
    agent: null,
    model: null,
    metadataOutput: "",
  };
  sessions.set(id, s);

  term.onData((data) => {
    if (/[\r\n\x03\x1b]/.test(data) && !/^\x1b\[[A-D]$/.test(data)) {
      s.approval = false;
      s.approvalOutput = '';
      updateSessionIndicators(s);
    }
    s.quietUntil = Date.now() + KEY_QUIET_MS;
    window.pty.write(id, data);
  });
  term.attachCustomKeyEventHandler((e) => handleKey(e, s));

  window.pty.create(id, 80, 24, project?.cwd);
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

function reorderSession(id, targetId, after = false) {
  if (id === targetId || !sessions.has(id) || !sessions.has(targetId)) return;
  const ordered = [...sessions.values()].filter((s) => s.id !== id);
  const index = ordered.findIndex((s) => s.id === targetId);
  ordered.splice(index + (after ? 1 : 0), 0, sessions.get(id));
  sessions.clear();
  for (const s of ordered) sessions.set(s.id, s);
}

window.pty.onData((id, data) => {
  const s = sessions.get(id);
  if (!s) return;
  s.term.write(data);
  const previousMetadata = `${s.agent}|${s.model}`;
  // Keep a bounded tail so labels split across PTY chunks can still be detected.
  s.metadataOutput = (s.metadataOutput + data).slice(-8000);
  const output = s.metadataOutput.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');
  // The most recent mention wins, so switching agent or model updates the sidebar.
  const lastIndex = (re) => { let i = -1; for (const m of output.matchAll(re)) i = m.index; return i; };
  const agentPatterns = [
    ['Claude', /claude code/gi],
    ['Codex', /(?:openai\s+codex|codex\s+cli)/gi],
    // AGY: only a command being run (line start, optional prompt) or its banner, never a
    // mention in prose or a path such as ...\Local\agy\bin
    ['AGY', /^[ \t]*(?:PS [^\n>]*>[ \t]*|[>$%#][ \t]*)?(?:agy(?:\.exe)?(?=[ \t]*(?:$|-|\w+\s*$))|[^\w\n]{0,4}[ \t]*antigravity\b)/gim],
  ];
  let agent = null, agentAt = -1;
  for (const [name, re] of agentPatterns) {
    const at = lastIndex(re);
    if (at > agentAt) { agent = name; agentAt = at; }
  }
  let model = null, modelAt = -1;
  const modelPatterns = [
    [/\b(?:gpt-\d[\w.-]*|claude-(?:sonnet|opus|haiku)[\w.-]*|(?:sonnet|opus|haiku)\s+\d+(?:\.\d+)*|gemini-[\w.-]+)\b/gi, 0],
    [/\bmodel\s*:\s*([a-z0-9][a-z0-9._-]*)/gi, 1],
  ];
  for (const [re, group] of modelPatterns) {
    for (const m of output.matchAll(re)) {
      if (m.index >= modelAt) { modelAt = m.index; model = m[group]; }
    }
  }
  // Once Claude or Codex is identified, only a different banner or command replaces it,
  // and AGY never overrides them from stray text.
  const sticky = (s.agent === 'Claude' || s.agent === 'Codex') && agent === 'AGY' && !/^[ \t]*(?:PS [^\n>]*>[ \t]*|[>$%#][ \t]*)agy\b/im.test(output.slice(agentAt));
  if (agent && agent !== s.agent && !sticky) { s.agent = agent; s.model = null; }
  if (model) s.model = model;
  if (previousMetadata !== `${s.agent}|${s.model}`) {
    const metadata = listEl.querySelector(`.row[data-id="${id}"] .session-metadata`);
    if (metadata) {
      metadata.textContent = [s.agent, s.model].filter(Boolean).join(' · ');
      metadata.title = metadata.textContent;
      metadata.hidden = !s.agent && !s.model;
    }
  }
  if (Date.now() > s.quietUntil) s.lastOutputAt = Date.now();
  s.approvalOutput = ((s.approvalOutput || '') + data).slice(-4000);
  if (window.SwitchboardStatus.isApprovalPrompt(s.approvalOutput)) s.approval = true;
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
  // Shift+Enter: send ESC+CR, which Claude Code reads as "new line" instead of "submit".
  // Swallow keypress/keyup too, or xterm would still send a plain Enter.
  if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.altKey) {
    if (e.type === 'keydown') {
      s.quietUntil = Date.now() + KEY_QUIET_MS;
      window.pty.write(s.id, '\x1b\r');
    }
    e.preventDefault();
    return false;
  }
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
  // Ctrl+Shift+C and Ctrl+Insert always copy, since they never mean "interrupt".
  const copyKey = e.ctrlKey && (key === 'c' || key === 'insert');
  if (copyKey && s.term.hasSelection()) {
    e.preventDefault();
    copySelection(s);
    return false;
  }
  if (e.ctrlKey && e.shiftKey && key === 'c') return false;
  if (e.ctrlKey && key === 'v') {
    e.preventDefault();
    window.clip.read().then((text) => text && s.term.paste(text));
    return false;
  }
  return true;
}

function copySelection(s) {
  window.clip.write(s.term.getSelection());
  s.term.clearSelection();
}

// Right-click like Windows Terminal: copy if text is selected, otherwise paste.
// Works even when a TUI (Claude Code) has mouse reporting on and swallows left-drag selection.
document.addEventListener('contextmenu', (e) => {
  const host = e.target.closest('.term-host');
  if (!host) return;
  e.preventDefault();
  const s = [...sessions.values()].find((x) => x.host === host);
  if (!s) return;
  if (s.term.hasSelection()) copySelection(s);
  else window.clip.read().then((text) => text && s.term.paste(text));
});

document.addEventListener('keydown', (e) => {
  // Shortcuts still work when no terminal has focus (e.g. after closing the last pane).
  if (e.target.closest('.xterm') || e.target.classList.contains('rename')) return;
  const key = e.key.toLowerCase();
  if (e.ctrlKey && e.shiftKey && key === 't') showInFocused(createSession().id);
});

// ---------- panes ----------

function visibleIds(node = layout) {
  return !node ? [] : node.id !== undefined ? (node.id === null ? [] : [node.id]) : [...visibleIds(node.first), ...visibleIds(node.second)];
}

function mapLeaf(node, id, replace) {
  if (!node) return null;
  if (node.id !== undefined) return node.id === id ? replace(node) : node;
  node.first = mapLeaf(node.first, id, replace);
  node.second = mapLeaf(node.second, id, replace);
  return !node.first ? node.second : !node.second ? node.first : node;
}

function syncPanes(focusId) {
  panes = visibleIds();
  focused = Math.max(0, panes.indexOf(focusId));
}

function showInFocused(id) {
  const existing = panes.indexOf(id);
  if (existing !== -1) {
    focused = existing;
  } else if (panes.length === 0) {
    layout = { id };
    syncPanes(id);
  } else {
    layout = mapLeaf(layout, panes[focused], () => ({ id }));
    syncPanes(id);
  }
  sessions.get(id).unseen = false;
  render();
}

function addPane(id) {
  const existing = panes.indexOf(id);
  if (existing !== -1) {
    focused = existing;
  } else {
    layout = layout ? { axis: 'y', ratio: 0.65, first: layout, second: { id } } : { id };
    syncPanes(id);
  }
  sessions.get(id).unseen = false;
  render();
}

function removePane(i) {
  if (i < 0 || i >= panes.length) return;
  const focusId = panes[focused] === panes[i] ? panes[i + 1] ?? panes[i - 1] : panes[focused];
  layout = mapLeaf(layout, panes[i], () => null);
  syncPanes(focusId);
  render();
}

function placeSession(id, targetId, edge) {
  if (!sessions.has(id) || (targetId !== null && !panes.includes(targetId))) return;
  if (targetId === id && edge === 'center') return;
  if (!layout) {
    layout = { id };
  } else if (targetId === id) {
    // Keep the unused half as a real drop target when snapping onto ourselves.
    layout = mapLeaf(layout, id, () => {
      const before = edge === 'left' || edge === 'top';
      return {
        axis: edge === 'left' || edge === 'right' ? 'x' : 'y', ratio: 0.5,
        first: { id: before ? id : null }, second: { id: before ? null : id },
      };
    });
  } else if (edge === 'center') {
    // Moving a visible pane onto another swaps the two sessions.
    const alreadyVisible = panes.includes(id);
    function swap(node) {
      if (node.id !== undefined) {
        if (node.id === targetId) node.id = id;
        else if (alreadyVisible && node.id === id) node.id = targetId;
      } else { swap(node.first); swap(node.second); }
    }
    swap(layout);
  } else {
    layout = mapLeaf(layout, id, () => null);
    layout = mapLeaf(layout, targetId, (target) => {
      const before = edge === 'left' || edge === 'top';
      return {
        axis: edge === 'left' || edge === 'right' ? 'x' : 'y', ratio: 0.5,
        first: before ? { id } : target, second: before ? target : { id },
      };
    });
  }
  sessions.get(id).unseen = false;
  syncPanes(id);
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
// Each pane resizes on its own (divider drags, splits), so refit when any pane body changes size.
const paneObserver = new ResizeObserver(() => requestAnimationFrame(fitVisible));

function startDividerDrag(e, node, split, first, second) {
  if (e.button !== 0) return;
  e.preventDefault();
  const horizontal = node.axis === 'x';
  const rect = split.getBoundingClientRect();
  const size = (horizontal ? rect.width : rect.height) - 4;
  const minimum = Math.min(horizontal ? 120 : 80, size / 2);
  document.body.classList.add(horizontal ? 'resizing-x' : 'resizing-y');

  function move(ev) {
    const position = horizontal ? ev.clientX - rect.left : ev.clientY - rect.top;
    node.ratio = Math.max(minimum, Math.min(size - minimum, position)) / size;
    first.style.flexGrow = node.ratio;
    second.style.flexGrow = 1 - node.ratio;
    fitVisible();
  }
  function up() {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    window.removeEventListener('blur', up);
    document.body.classList.remove('resizing-x', 'resizing-y');
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  window.addEventListener('blur', up);
}

// ---------- drag to split ----------

const dropPreview = document.createElement('div');
dropPreview.className = 'drop-preview';

function clearDrop() {
  dropTarget = null;
  dropPreview.remove();
  listEl.querySelectorAll('.drop-before, .drop-after').forEach((row) => {
    row.classList.remove('drop-before', 'drop-after');
  });
}

function makeDraggable(element, id) {
  element.draggable = true;
  element.addEventListener('dragstart', (e) => {
    if (e.target.closest('button, input')) { e.preventDefault(); return; }
    draggedId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-switchboard-session', String(id));
    document.body.classList.add('dragging-session');
  });
  element.addEventListener('dragend', () => {
    draggedId = null;
    clearDrop();
    document.body.classList.remove('dragging-session');
    renderSidebar();
  });
}

listEl.addEventListener('dragover', (e) => {
  if (draggedId === null || !sessions.has(draggedId)) return;
  clearDrop();
  const row = e.target.closest('.row') || listEl.lastElementChild;
  if (!row) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const id = Number(row.dataset.id);
  if (id === draggedId) return;
  const rect = row.getBoundingClientRect();
  const after = e.clientY >= rect.top + rect.height / 2;
  dropTarget = { id, after, sidebar: true };
  row.classList.add(after ? 'drop-after' : 'drop-before');
});

listEl.addEventListener('dragleave', (e) => {
  if (!listEl.contains(e.relatedTarget)) clearDrop();
});

listEl.addEventListener('drop', (e) => {
  if (draggedId === null) return;
  e.preventDefault();
  if (dropTarget?.sidebar) reorderSession(draggedId, dropTarget.id, dropTarget.after);
  draggedId = null;
  clearDrop();
  document.body.classList.remove('dragging-session');
  renderSidebar();
});

mainEl.addEventListener('dragover', (e) => {
  if (draggedId === null || !sessions.has(draggedId)) return;
  const pane = e.target.closest('.pane, .empty-pane');
  if (!pane && panes.length) { clearDrop(); return; }
  const targetId = pane && pane.dataset.id !== undefined ? Number(pane.dataset.id) : null;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const rect = (pane || mainEl).getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const nearest = Math.min(x, 1 - x, y, 1 - y);
  const edge = !pane || nearest > 0.28 ? 'center'
    : nearest === x ? 'left' : nearest === 1 - x ? 'right' : nearest === y ? 'top' : 'bottom';
  if (targetId === draggedId && edge === 'center') { clearDrop(); return; }
  dropTarget = { id: targetId, edge };
  const mainRect = mainEl.getBoundingClientRect();
  const width = rect.width * (edge === 'left' || edge === 'right' ? 0.5 : 1);
  const height = rect.height * (edge === 'top' || edge === 'bottom' ? 0.5 : 1);
  Object.assign(dropPreview.style, {
    left: `${rect.left - mainRect.left + (edge === 'right' ? width : 0)}px`,
    top: `${rect.top - mainRect.top + (edge === 'bottom' ? height : 0)}px`,
    width: `${width}px`, height: `${height}px`,
  });
  dropPreview.textContent = edge === 'center' ? (panes.includes(draggedId) ? 'Swap panes' : 'Open here') : `Split ${edge}`;
  mainEl.append(dropPreview);
});

mainEl.addEventListener('dragleave', (e) => {
  if (!mainEl.contains(e.relatedTarget)) clearDrop();
});

mainEl.addEventListener('drop', (e) => {
  if (draggedId === null || !dropTarget) return;
  e.preventDefault();
  const { id, edge } = dropTarget;
  const sourceId = draggedId;
  draggedId = null;
  clearDrop();
  document.body.classList.remove('dragging-session');
  placeSession(sourceId, id, edge);
});

// ---------- rendering ----------

function startRename(nameEl, id) {
  const input = document.createElement('input');
  input.className = 'rename';
  input.value = sessions.get(id).name;
  // A draggable ancestor swallows text selection and caret clicks inside the input.
  const dragParent = nameEl.closest('[draggable="true"]');
  if (dragParent) dragParent.draggable = false;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (dragParent) dragParent.draggable = true;
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

function renderSidebar() {
  // Keep the native drag source attached while terminal output updates metadata.
  if (draggedId !== null) return;
  listEl.replaceChildren();
  for (const s of sessions.values()) {
    const row = document.createElement('div');
    row.className = `row ${statusClass(s)}`;
    row.dataset.id = s.id;
    applyTint(row, s);
    if (panes.includes(s.id)) row.classList.add('shown');
    if (s.unseen) row.classList.add('unseen');
    row.title = 'Drag to reorder or onto a pane edge to split · Click: show here · Ctrl+click: open beside · Double-click name: rename';
    makeDraggable(row, s.id);

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.title = statusText(s);
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', statusText(s));
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
    x.setAttribute('aria-label', `Kill ${s.name}`);

    const details = document.createElement('div');
    details.className = 'session-details';
    details.append(name);
    {
      const metadata = document.createElement('span');
      metadata.className = 'session-metadata';
      metadata.hidden = !s.agent && !s.model;
      metadata.textContent = [s.agent, s.model].filter(Boolean).join(' · ') || 'PowerShell';
      metadata.title = metadata.textContent;
      details.append(metadata);
    }
    row.append(details, status, dot, x);
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `${s.name}, ${statusText(s)}`);
    row.addEventListener('keydown', (e) => {
      if (e.target !== row || !['Enter', ' '].includes(e.key)) return;
      e.preventDefault();
      e.ctrlKey ? addPane(s.id) : showInFocused(s.id);
    });
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
  document.getElementById('session-count').textContent = `${sessions.size} ${sessions.size === 1 ? 'session' : 'sessions'}`;
}

function renderPanes() {
  clearDrop();
  mainEl.replaceChildren();
  if (panes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = sessions.size
      ? 'Click or drag a session from the sidebar to show it.'
      : 'Press + New (Ctrl+Shift+T) to start a session.';
    mainEl.append(empty);
    return;
  }

  function renderNode(node) {
    if (node.id === undefined) {
      const split = document.createElement('div');
      split.className = `split split-${node.axis}`;
      const first = renderNode(node.first);
      const second = renderNode(node.second);
      first.style.flexGrow = node.ratio;
      second.style.flexGrow = 1 - node.ratio;
      const divider = document.createElement('div');
      divider.className = `divider divider-${node.axis}`;
      divider.addEventListener('mousedown', (e) => startDividerDrag(e, node, split, first, second));
      split.append(first, divider, second);
      return split;
    }
    if (node.id === null) {
      const empty = document.createElement('div');
      empty.className = 'empty-pane';
      return empty;
    }
    const id = node.id;
    const i = panes.indexOf(id);
    const s = sessions.get(id);

    const pane = document.createElement('div');
    pane.className = 'pane';
    pane.dataset.id = id;
    applyTint(pane, s);
    if (i === focused) pane.classList.add('focused');

    const title = document.createElement('div');
    title.className = 'pane-title';
    title.title = 'Drag onto another pane edge to split, or its center to swap';
    makeDraggable(title, id);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = s.name;
    // Whole title bar is the double-click target (the name alone is a small, draggable target).
    title.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, input')) return;
      const current = title.querySelector('.name');
      if (current) startRename(current, id);
    });
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.title = 'Close pane (session keeps running) · Ctrl+Shift+W';
    x.setAttribute('aria-label', `Close ${s.name} pane`);
    x.addEventListener('click', () => removePane(panes.indexOf(id)));
    title.append(name, x);

    const body = document.createElement('div');
    body.className = 'pane-body';
    body.append(s.host);

    pane.append(title, body);
    pane.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, input')) return;
      if (focused !== panes.indexOf(id)) {
        focused = panes.indexOf(id);
        mainEl.querySelectorAll('.pane').forEach((p, j) => p.classList.toggle('focused', j === focused));
      }
      s.term.focus();
    }, true);
    return pane;
  }
  mainEl.append(renderNode(layout));
  document.body.classList.toggle('multi-pane', panes.length > 1);
  paneObserver.disconnect();
  mainEl.querySelectorAll('.pane-body').forEach((el) => paneObserver.observe(el));

  // xterm needs to be in the DOM to measure its font, so open on first show.
  for (const id of panes) {
    const s = sessions.get(id);
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
  }

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

    updateSessionIndicators(s);
  }
}, 500);

document.getElementById('new-session').addEventListener('click', () => showInFocused(createSession().id));

// Saved folders open fresh terminals with the shell's working directory already set.
const projectList = document.getElementById('project-list');
const projectError = document.getElementById('project-error');
const projectsSection = document.getElementById('projects');
const toggleProjects = document.getElementById('toggle-projects');
function setProjectsCollapsed(collapsed) {
  projectsSection.classList.toggle('collapsed', collapsed);
  toggleProjects.setAttribute('aria-expanded', String(!collapsed));
  toggleProjects.title = collapsed ? 'Expand projects' : 'Minimize projects';
  toggleProjects.setAttribute('aria-label', toggleProjects.title);
  try { localStorage.setItem('projectsCollapsed', String(collapsed)); } catch { /* Storage may be unavailable. */ }
}
let projectsCollapsed = false;
try { projectsCollapsed = localStorage.getItem('projectsCollapsed') === 'true'; } catch { /* Start expanded when storage is unavailable. */ }
setProjectsCollapsed(projectsCollapsed);
toggleProjects.addEventListener('click', () => setProjectsCollapsed(!projectsSection.classList.contains('collapsed')));
function renderProjects(projects) {
  projectList.replaceChildren();
  if (!projects.length) {
    const hint = document.createElement('div');
    hint.className = 'project-hint';
    hint.textContent = 'Save folders with +';
    projectList.append(hint);
  }
  currentProjects = projects;
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.projectId = project.id;
    const tint = TINTS.find((t) => t.name === project.color);
    if (tint?.accent) row.style.setProperty('--project-accent', tint.accent);
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      draggedProject = project.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-switchboard-project', project.id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => { draggedProject = null; clearProjectDrop(); row.classList.remove('dragging'); });
    const launch = document.createElement('button');
    launch.className = 'project-launch';
    launch.textContent = project.name;
    launch.title = `${project.cwd}\nClick: new terminal · Ctrl+click: open beside`;
    launch.addEventListener('click', (e) => {
      const session = createSession(project);
      if (e.ctrlKey) addPane(session.id);
      else showInFocused(session.id);
    });
    const remove = document.createElement('button');
    remove.className = 'project-remove';
    remove.textContent = '×';
    remove.title = `Remove ${project.name} preset`;
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => updateProjects(() => window.projects.remove(project.id)));
    row.append(launch, remove);
    projectList.append(row);
  }
}
let currentProjects = [];
let draggedProject = null;
let projectDrop = null;
function clearProjectDrop() {
  projectDrop = null;
  projectList.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
}
projectList.addEventListener('dragover', (e) => {
  if (draggedProject === null) return;
  const row = e.target.closest('.project-row') || projectList.querySelector('.project-row:last-child');
  if (!row) return;
  e.preventDefault();
  clearProjectDrop();
  if (row.dataset.projectId === draggedProject) return;
  const rect = row.getBoundingClientRect();
  const after = e.clientY >= rect.top + rect.height / 2;
  projectDrop = { id: row.dataset.projectId, after };
  row.classList.add(after ? 'drop-after' : 'drop-before');
});
projectList.addEventListener('dragleave', (e) => {
  if (!projectList.contains(e.relatedTarget)) clearProjectDrop();
});
projectList.addEventListener('drop', (e) => {
  if (draggedProject === null) return;
  e.preventDefault();
  const drop = projectDrop;
  const dragged = draggedProject;
  draggedProject = null;
  clearProjectDrop();
  if (!drop) return;
  const ids = currentProjects.map((p) => p.id).filter((id) => id !== dragged);
  ids.splice(ids.indexOf(drop.id) + (drop.after ? 1 : 0), 0, dragged);
  updateProjects(() => window.projects.reorder(ids));
});

function showProjectMenu(e, project) {
  e.preventDefault();
  closeSessionMenu();
  const menu = document.createElement('div');
  sessionMenu = menu;
  menu.className = 'session-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', `${project.name} options`);
  const heading = document.createElement('div');
  heading.className = 'menu-heading';
  heading.textContent = 'Project color';
  menu.append(heading);
  for (const tint of TINTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitemradio');
    button.setAttribute('aria-checked', String((project.color || 'Default') === tint.name));
    const swatch = document.createElement('span');
    swatch.className = 'tint-swatch';
    swatch.style.background = tint.accent || '#8a8d96';
    button.append(swatch, document.createTextNode(tint.name));
    button.addEventListener('click', () => {
      closeSessionMenu();
      updateProjects(() => window.projects.setColor(project.id, tint.name));
    });
    menu.append(button);
  }
  menu.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape' || event.key === 'Tab') { closeSessionMenu(); return; }
    const buttons = [...menu.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
  });
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(e.clientX, window.innerWidth - rect.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(e.clientY, window.innerHeight - rect.height - 4))}px`;
  menu.querySelector('button').focus();
}
projectList.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.project-row');
  const project = row && currentProjects.find((p) => p.id === row.dataset.projectId);
  if (!project) return;
  e.stopPropagation();
  showProjectMenu(e, project);
});

async function updateProjects(action) {
  projectError.hidden = true;
  try { renderProjects(await action()); }
  catch (error) {
    projectError.textContent = `Could not update projects: ${error.message}`;
    projectError.hidden = false;
  }
}
const addProject = document.getElementById('add-project');
addProject.addEventListener('click', async () => {
  addProject.disabled = true;
  try { await updateProjects(() => window.projects.add()); }
  finally { addProject.disabled = false; }
});
updateProjects(() => window.projects.list());

// Leave the toggle available in a narrow rail when the sidebar is minimized.
const sidebarEl = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('toggle-sidebar');
function setSidebarCollapsed(collapsed) {
  closeSessionMenu();
  sidebarEl.classList.toggle('collapsed', collapsed);
  sidebarToggle.textContent = collapsed ? '\u203a' : '\u2039';
  sidebarToggle.title = collapsed ? 'Expand sidebar' : 'Minimize sidebar';
  sidebarToggle.setAttribute('aria-label', sidebarToggle.title);
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
}
try { setSidebarCollapsed(localStorage.getItem('sidebar-collapsed') === 'true'); }
catch { setSidebarCollapsed(false); }
sidebarToggle.addEventListener('click', () => {
  const collapsed = !sidebarEl.classList.contains('collapsed');
  setSidebarCollapsed(collapsed);
  try { localStorage.setItem('sidebar-collapsed', String(collapsed)); }
  catch { /* The toggle still works if preference storage is unavailable. */ }
});

// Appearance changes update mounted and hidden terminals without recreating shells.
const settingsEl = document.getElementById('settings');
const settingsToggle = document.getElementById('settings-toggle');
function setAppearance(mode) {
  appearance = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.appearance = appearance;
  document.querySelectorAll('.appearance-options button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.appearance === appearance));
  });
  for (const s of sessions.values()) {
    s.term.options.theme = terminalTheme(s.tint);
    s.host.style.background = s.term.options.theme.background;
  }
  document.querySelectorAll('.row[data-id], .pane[data-id]').forEach((element) => {
    element.style.removeProperty('--session-tint');
    element.style.removeProperty('--session-accent');
    const s = sessions.get(Number(element.dataset.id));
    if (s) applyTint(element, s);
  });
  window.preferences?.setAppearance(appearance);
  try { localStorage.setItem('appearance', appearance); } catch { /* Appearance still works without storage. */ }
}
function setSettingsOpen(open, restoreFocus = true) {
  settingsEl.hidden = !open;
  settingsToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    closeSessionMenu();
    settingsEl.querySelector('[aria-pressed="true"]').focus();
  } else if (restoreFocus) settingsToggle.focus();
}
settingsToggle.addEventListener('click', () => setSettingsOpen(settingsEl.hidden));
document.getElementById('settings-close').addEventListener('click', () => setSettingsOpen(false));
document.querySelectorAll('.appearance-options button').forEach((button) => {
  button.addEventListener('click', () => setAppearance(button.dataset.appearance));
});
document.addEventListener('pointerdown', (event) => {
  if (!settingsEl.hidden && !settingsEl.contains(event.target) && !settingsToggle.contains(event.target)) setSettingsOpen(false, false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settingsEl.hidden) { event.preventDefault(); setSettingsOpen(false); }
});
setAppearance(appearance);
showInFocused(createSession().id);
