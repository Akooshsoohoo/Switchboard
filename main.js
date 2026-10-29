const { app, BrowserWindow, ipcMain, clipboard, Menu } = require('electron');
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
    backgroundColor: '#1a1b1e',
    title: 'Switchboard',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.on('pty:create', (_e, id, cols, rows) => {
  // Drop the markers Claude Code sets, so `claude` runs normally if this app was launched from inside it.
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_CHILD_SESSION;

  const p = pty.spawn('powershell.exe', ['-NoLogo'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: START_DIR,
    env,
  });
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
ipcMain.on('clip:write', (_e, text) => clipboard.writeText(text));

app.whenReady().then(() => {
  // No menu: its default shortcuts (Ctrl+R reload, Ctrl+W close) would steal keys from the shells.
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => {
  for (const p of ptys.values()) p.kill();
  app.quit();
});
