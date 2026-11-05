const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('preferences', {
  setAppearance: (mode) => ipcRenderer.send('preferences:appearance', mode),
});

contextBridge.exposeInMainWorld('pty', {
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

contextBridge.exposeInMainWorld('clip', {
  read: () => ipcRenderer.invoke('clip:read'),
  write: (text) => ipcRenderer.send('clip:write', text),
});
