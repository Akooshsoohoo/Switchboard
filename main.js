const { app, BrowserWindow, ipcMain, clipboard, Menu, dialog, nativeTheme } = require('electron');
const fs = require('fs');
const { randomUUID } = require('crypto');
const path = require('path');
const pty = require('@lydell/node-pty');

// Shells start in the folder that contains Switchboard (The Mainframe).
const START_DIR = path.resolve(__dirname, '..');

// Must match the shortcut made by scripts/install-shortcut.js, so the taskbar pin launches Switchboard.
app.setAppUserModelId('Switchboard');

const ptys = new Map(); // session id -> pty process
let win;

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 620,
    minHeight: 420,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'assets', 'switchboard-light.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#fafafa', symbolColor: '#77777b', height: 42 },
    title: 'Switchboard',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  // Handle zoom before xterm receives the keys, including while a shell has focus.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
    const key = input.key;
    const zoomIn = key === '+' || key === '=' || input.code === 'NumpadAdd';
    const zoomOut = key === '-' || input.code === 'NumpadSubtract';
    const reset = key === '0' || input.code === 'Numpad0';
    if (!zoomIn && !zoomOut && !reset) return;
    event.preventDefault();
    const level = win.webContents.getZoomLevel();
    win.webContents.setZoomLevel(reset ? 0 : Math.max(-3, Math.min(5, level + (zoomIn ? 0.5 : -0.5))));
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.on('pty:create', (_e, id, cols, rows, cwd) => {
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
    send('pty:data', id, `\r\nCould not start terminal: ${error.message}\r\n`);
    send('pty:exit', id);
    return;
  }
  p.onData((data) => send('pty:data', id, data));
  p.onExit(() => {
    ptys.delete(id);
    send('pty:exit', id);
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
ipcMain.on('pty:kill', (_e, id) => {
  ptys.get(id)?.kill();
  ptys.delete(id);
});

ipcMain.handle('clip:read', () => clipboard.readText());
ipcMain.on('preferences:appearance', (_e, mode) => {
  if (!['light', 'dark'].includes(mode)) return;
  nativeTheme.themeSource = mode;
  win?.setTitleBarOverlay({ color: mode === 'dark' ? '#242527' : '#fafafa', symbolColor: mode === 'dark' ? '#8f9097' : '#77777b', height: 42 });
  win?.setBackgroundColor(mode === 'dark' ? '#202123' : '#ffffff');
  win?.setIcon(path.join(__dirname, 'assets', mode === 'dark' ? 'switchboard.ico' : 'switchboard-light.ico'));
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
ipcMain.handle('projects:add', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
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

app.whenReady().then(() => {
  // No menu: its default shortcuts (Ctrl+R reload, Ctrl+W close) would steal keys from the shells.
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => {
  for (const p of ptys.values()) p.kill();
  app.quit();
});
