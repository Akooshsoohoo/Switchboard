const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('preferences', {
  setAppearance: (mode) => ipcRenderer.send('preferences:appearance', mode),
});

// Moving a session between windows. Main coordinates; each window only reports and reacts.
let releaseHandler = null;
ipcRenderer.on('session:release', async (_e, token, id) => {
  let snapshot = null;
  try { snapshot = releaseHandler ? await releaseHandler(id) : null; } catch { /* Answer null so the move is refused. */ }
  ipcRenderer.send(`reply:${token}`, snapshot);
});
contextBridge.exposeInMainWorld('sessionMove', {
  dragBegin: (id, kind) => ipcRenderer.send('drag:begin', id, kind),
  dragEnd: () => ipcRenderer.send('drag:end'),
  onDragState: (cb) => ipcRenderer.on('drag:state', (_e, drag) => cb(drag)),
  take: (id) => ipcRenderer.invoke('session:take', id),
  onRelease: (cb) => { releaseHandler = cb; },
});

contextBridge.exposeInMainWorld('pty', {
  newId: () => ipcRenderer.sendSync('session:newId'),
  create: (id, cols, rows, cwd) => ipcRenderer.send('pty:create', id, cols, rows, cwd),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  onData: (cb) => ipcRenderer.on('pty:data', (_e, id, data) => cb(id, data)),
  onExit: (cb) => ipcRenderer.on('pty:exit', (_e, id) => cb(id)),
});

contextBridge.exposeInMainWorld('projects', {
  list: () => ipcRenderer.invoke('projects:list'),
  add: () => ipcRenderer.invoke('projects:add'),
  remove: (id) => ipcRenderer.invoke('projects:remove', id),
  reorder: (ids) => ipcRenderer.invoke('projects:reorder', ids),
  setColor: (id, color) => ipcRenderer.invoke('projects:color', id, color),
});

contextBridge.exposeInMainWorld('files', {
  open: () => ipcRenderer.invoke('files:open'),
  openPath: (file) => ipcRenderer.invoke('files:openPath', file),
  read: (file) => ipcRenderer.invoke('files:read', file),
  stat: (file) => ipcRenderer.invoke('files:stat', file),
  saveDraft: (file, text, origText) => ipcRenderer.invoke('files:saveDraft', file, text, origText),
  discardDraft: (file) => ipcRenderer.invoke('files:discardDraft', file),
});

contextBridge.exposeInMainWorld('shellOpen', {
  // Paths sent from Explorer's "Open with". Call once the handler is set up.
  onOpen: (cb) => { ipcRenderer.on('external:open', (_e, item) => cb(item)); ipcRenderer.send('external:ready'); },
});

contextBridge.exposeInMainWorld('clip', {
  read: () => ipcRenderer.invoke('clip:read'),
  write: (text) => ipcRenderer.send('clip:write', text),
});
