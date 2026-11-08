const { app, BrowserWindow, ipcMain, clipboard, Menu, dialog, nativeTheme } = require('electron');
const fs = require('fs');
const { randomUUID } = require('crypto');
const path = require('path');
const pty = require('@lydell/node-pty');

// Shells start in the folder that contains Switchboard (The Mainframe).
const START_DIR = path.resolve(__dirname, '..');

// Must match the shortcut made by scripts/install-shortcut.js, so the taskbar pin launches Switchboard.
app.setAppUserModelId('Switchboard');

// Shells live here in the main process, not in a window. A window only displays the ones it owns,
// which is what lets a session move to another window without restarting.
const ptys = new Map(); // session id -> pty process
const ptyOwner = new Map(); // session id -> the window showing it
const ptyBuffers = new Map(); // session id -> recent output, replayed when a session moves window
const BUFFER_CHARS = 400000;
const windows = new Set();
let lastFocused = null;
let nextSessionId = 1; // ids come from here so two windows never hand out the same one
let activeDrag = null; // { id, kind, from } while a session is being dragged between windows

function sendTo(w, channel, ...args) {
  if (w && !w.isDestroyed()) w.webContents.send(channel, ...args);
}

function broadcast(channel, except, ...args) {
  for (const w of windows) if (w !== except) sendTo(w, channel, ...args);
}

// Ask a window something and wait for its answer (null if it does not answer in time).
function askWindow(w, channel, ...args) {
  return new Promise((resolve) => {
    const token = randomUUID();
    const timer = setTimeout(() => { ipcMain.removeAllListeners(`reply:${token}`); resolve(null); }, 3000);
    ipcMain.once(`reply:${token}`, (_e, value) => { clearTimeout(timer); resolve(value); });
    sendTo(w, channel, token, ...args);
  });
}

function dropSession(id) {
  ptys.get(id)?.kill();
  ptys.delete(id);
  ptyOwner.delete(id);
  ptyBuffers.delete(id);
}

function createWindow() {
  const bounds = { width: 1400, height: 900 };
  if (lastFocused && !lastFocused.isDestroyed()) {
    // Offset a new window from the one you were using, so it does not hide it exactly.
    const { x, y } = lastFocused.getBounds();
    Object.assign(bounds, { x: x + 32, y: y + 32 });
  }
  const w = new BrowserWindow({
    ...bounds,
    minWidth: 620,
    minHeight: 420,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'assets', 'switchboard-light.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#fafafa', symbolColor: '#77777b', height: 42 },
    title: 'Switchboard',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  windows.add(w);
  lastFocused = w;
  w.on('focus', () => { lastFocused = w; });
  w.on('closed', () => {
    windows.delete(w);
    if (lastFocused === w) lastFocused = [...windows].pop() || null;
    if (activeDrag?.from === w) activeDrag = null;
    // Sessions still in a window that closes end with it. Moved-out sessions already belong elsewhere.
    for (const [id, owner] of [...ptyOwner]) if (owner === w) dropSession(id);
  });
  // Handle window and zoom keys before xterm receives them, including while a shell has focus.
  w.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
    if (input.shift && input.key.toLowerCase() === 'n') {
      event.preventDefault();
      createWindow();
      return;
    }
    const key = input.key;
    const zoomIn = key === '+' || key === '=' || input.code === 'NumpadAdd';
    const zoomOut = key === '-' || input.code === 'NumpadSubtract';
    const reset = key === '0' || input.code === 'Numpad0';
    if (!zoomIn && !zoomOut && !reset) return;
    event.preventDefault();
    const level = w.webContents.getZoomLevel();
    w.webContents.setZoomLevel(reset ? 0 : Math.max(-3, Math.min(5, level + (zoomIn ? 0.5 : -0.5))));
  });
  w.loadFile(path.join(__dirname, 'index.html'));
  return w;
}

ipcMain.on('session:newId', (e) => { e.returnValue = nextSessionId++; });

// ---------- moving sessions between windows ----------
// The window where a drag starts reports it, the other windows learn a session is in flight, and the
// window it lands in asks main to take it over: the old window lets go, the new one picks up the shell.

ipcMain.on('drag:begin', (e, id, kind) => {
  const from = BrowserWindow.fromWebContents(e.sender);
  activeDrag = { id, kind, from };
  broadcast('drag:state', from, { id, kind });
});
ipcMain.on('drag:end', (e) => {
  if (!activeDrag || activeDrag.from !== BrowserWindow.fromWebContents(e.sender)) return;
  broadcast('drag:state', activeDrag.from, null);
  activeDrag = null;
});

ipcMain.handle('session:take', async (e, id) => {
  const to = BrowserWindow.fromWebContents(e.sender);
  const drag = activeDrag;
  if (!drag || drag.id !== id || drag.from === to || drag.from.isDestroyed()) return { error: 'That session is no longer being moved.' };
  activeDrag = null;
  broadcast('drag:state', null, null);
  const snapshot = await askWindow(drag.from, 'session:release', id);
  if (!snapshot) return { error: 'The other window did not let go of that session.' };
  const reply = { snapshot };
  if (snapshot.kind === 'terminal') {
    ptyOwner.set(id, to);
    reply.buffer = ptyBuffers.get(id) || '';
  }
  return reply;
});

ipcMain.on('pty:create', (e, id, cols, rows, cwd) => {
  const owner = BrowserWindow.fromWebContents(e.sender);
  ptyOwner.set(id, owner);
  ptyBuffers.set(id, '');
  // Drop the markers Claude Code sets, so `claude` runs normally if this app was launched from inside it.
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_CHILD_SESSION;

  let p;
  try {
    const startDir = cwd || START_DIR;
    // Profiles can change location. Apply the requested folder after they run.
    const locationCommand = `Set-Location -LiteralPath '${startDir.replace(/'/g, "''")}'`;
    p = pty.spawn('powershell.exe', ['-NoLogo', '-NoExit', '-Command', locationCommand], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: startDir,
    env,
    });
  } catch (error) {
    sendTo(owner, 'pty:data', id, `\r\nCould not start terminal: ${error.message}\r\n`);
    sendTo(owner, 'pty:exit', id);
    return;
  }
  p.onData((data) => {
    let buffer = (ptyBuffers.get(id) ?? '') + data;
    // Trim in bigger steps than one chunk, so a busy shell is not re-sliced on every write.
    if (buffer.length > BUFFER_CHARS * 1.5) buffer = buffer.slice(-BUFFER_CHARS);
    if (ptyBuffers.has(id)) ptyBuffers.set(id, buffer);
    sendTo(ptyOwner.get(id), 'pty:data', id, data);
  });
  p.onExit(() => {
    ptys.delete(id);
    sendTo(ptyOwner.get(id), 'pty:exit', id);
  });
  ptys.set(id, p);
});

ipcMain.on('pty:write', (_e, id, data) => ptys.get(id)?.write(data));
ipcMain.on('pty:resize', (_e, id, cols, rows) => {
  try {
    ptys.get(id)?.resize(cols, rows);
  } catch {
    // The process may have exited between the fit and the resize.
  }
});
ipcMain.on('pty:kill', (_e, id) => dropSession(id));

ipcMain.handle('clip:read', () => clipboard.readText());
ipcMain.on('preferences:appearance', (_e, mode) => {
  if (!['light', 'dark'].includes(mode)) return;
  nativeTheme.themeSource = mode;
  for (const w of windows) {
    if (w.isDestroyed()) continue;
    w.setTitleBarOverlay({ color: mode === 'dark' ? '#242527' : '#fafafa', symbolColor: mode === 'dark' ? '#8f9097' : '#77777b', height: 42 });
    w.setBackgroundColor(mode === 'dark' ? '#202123' : '#ffffff');
    w.setIcon(path.join(__dirname, 'assets', mode === 'dark' ? 'switchboard.ico' : 'switchboard-light.ico'));
  }
});
ipcMain.on('clip:write', (_e, text) => clipboard.writeText(text));

function readProjects() {
  try {
    const projects = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'projects.json'), 'utf8'));
    return Array.isArray(projects) ? projects.filter(p => typeof p.id === 'string' && typeof p.name === 'string' && typeof p.cwd === 'string') : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function saveProjects(projects) {
  const file = path.join(app.getPath('userData'), 'projects.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(projects, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return projects;
}

ipcMain.handle('projects:list', () => readProjects());
ipcMain.handle('projects:add', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Choose a project folder', defaultPath: START_DIR, properties: ['openDirectory'],
  });
  const projects = readProjects();
  if (canceled || !filePaths.length) return projects;
  const cwd = filePaths[0];
  if (!projects.some(p => p.cwd.toLowerCase() === cwd.toLowerCase())) {
    projects.push({ id: randomUUID(), name: path.basename(cwd) || cwd, cwd });
    return saveProjects(projects);
  }
  return projects;
});
ipcMain.handle('projects:remove', (_e, id) => saveProjects(readProjects().filter(p => p.id !== id)));
ipcMain.handle('projects:reorder', (_e, ids) => {
  const projects = readProjects();
  if (!Array.isArray(ids)) return projects;
  const byId = new Map(projects.map(p => [p.id, p]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean);
  // Keep anything the renderer did not mention, so a stale list never deletes a project.
  for (const p of projects) if (!ordered.includes(p)) ordered.push(p);
  return saveProjects(ordered);
});
ipcMain.handle('projects:color', (_e, id, color) => {
  const projects = readProjects();
  const project = projects.find(p => p.id === id);
  if (!project) return projects;
  if (typeof color === 'string' && color !== 'Default') project.color = color;
  else delete project.color;
  return saveProjects(projects);
});

// ---------- file pane (pseudoedit) ----------
// The original file is only ever read. Edits live in a draft copy under userData, so agents can
// read the draft by path while the real file stays untouched.

const draftHelpers = require('./draft');
const draftsDir = () => path.join(app.getPath('userData'), 'drafts');

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, text);
  fs.renameSync(`${file}.tmp`, file);
}

function readTextFile(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('That is not a file.');
  if (stat.size > draftHelpers.MAX_BYTES) throw new Error('That file is over 2 MB, which is too large to open here.');
  const text = fs.readFileSync(file, 'utf8');
  if (draftHelpers.isBinary(text)) throw new Error('That looks like a binary file, so it cannot be shown as text.');
  return { text, mtimeMs: stat.mtimeMs };
}

ipcMain.handle('files:open', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Open a file (your edits stay in a draft)', defaultPath: START_DIR, properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  return openedFromPath(filePaths[0]);
});

// Read a file (never writes it) plus any existing draft, in the shape the file pane expects.
function openedFromPath(file) {
  try {
    const opened = { path: file, ...readTextFile(file) };
    const draftPath = path.join(draftsDir(), draftHelpers.draftName(file));
    try {
      opened.draft = fs.readFileSync(draftPath, 'utf8');
      opened.draftMtimeMs = fs.statSync(draftPath).mtimeMs;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return opened;
  } catch (error) {
    return { error: error.message };
  }
}

// ---------- "Open with" from Windows ----------
// `npm run shortcut` registers Switchboard so Explorer runs: electron.exe <app folder> <clicked path>.

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit(); // Another Switchboard is running; it receives our arguments instead.

function pathFromArgs(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2).filter(a => !a.startsWith('--'));
  return args.find(a => path.resolve(a).toLowerCase() !== __dirname.toLowerCase() && fs.existsSync(a)) || null;
}

// Each window says when it can receive; opens that arrive before any window is ready wait here.
const readyWindows = new Set();
const pendingOpens = [];

function handleExternalPath(target) {
  let item;
  try {
    if (fs.statSync(target).isDirectory()) {
      const projects = readProjects();
      let project = projects.find(p => p.cwd.toLowerCase() === target.toLowerCase());
      if (!project) {
        project = { id: randomUUID(), name: path.basename(target) || target, cwd: target };
        saveProjects([...projects, project]);
      }
      item = { kind: 'folder', project };
    } else {
      item = { kind: 'file', opened: openedFromPath(target) };
    }
  } catch (error) {
    item = { kind: 'file', opened: { error: error.message } };
  }
  // The window you used last gets it.
  if (lastFocused && readyWindows.has(lastFocused)) sendTo(lastFocused, 'external:open', item);
  else pendingOpens.push(item);
}

ipcMain.on('external:ready', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  readyWindows.add(w);
  w.on('closed', () => readyWindows.delete(w));
  for (const item of pendingOpens.splice(0)) sendTo(w, 'external:open', item);
});

app.on('second-instance', (_e, argv) => {
  if (lastFocused && !lastFocused.isDestroyed()) {
    if (lastFocused.isMinimized()) lastFocused.restore();
    lastFocused.focus();
  }
  const target = pathFromArgs(argv);
  if (target) handleExternalPath(target);
});

// Used when a file pane moves to another window: its draft is reloaded from disk.
ipcMain.handle('files:openPath', (_e, file) => openedFromPath(file));

ipcMain.handle('files:read', (_e, file) => {
  try { return { path: file, ...readTextFile(file) }; } catch (error) { return { error: error.message }; }
});

ipcMain.handle('files:stat', (_e, file) => {
  try { return fs.statSync(file).mtimeMs; } catch { return null; }
});

ipcMain.handle('files:saveDraft', (_e, file, text, origText) => {
  try {
    const name = draftHelpers.draftName(file);
    const draftPath = path.join(draftsDir(), name);
    const diffPath = `${draftPath}.diff`;
    const diff = draftHelpers.unifiedDiff(origText, text, path.basename(file));
    writeAtomic(draftPath, text);
    writeAtomic(diffPath, diff || '(no changes from the original)\n');
    return { draftPath, diffPath, diff };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('files:discardDraft', (_e, file) => {
  const draftPath = path.join(draftsDir(), draftHelpers.draftName(file));
  for (const target of [draftPath, `${draftPath}.diff`]) {
    try { fs.unlinkSync(target); } catch (error) { if (error.code !== 'ENOENT') return { error: error.message }; }
  }
  return {};
});

app.whenReady().then(() => {
  // No menu: its default shortcuts (Ctrl+R reload, Ctrl+W close) would steal keys from the shells.
  Menu.setApplicationMenu(null);
  createWindow();
  const target = pathFromArgs(process.argv);
  if (target) handleExternalPath(target);
});

app.on('window-all-closed', () => {
  for (const p of ptys.values()) p.kill();
  app.quit();
});
