const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pty', {
  create: (id, cols, rows) => ipcRenderer.send('pty:create', id, cols, rows),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  onData: (cb) => ipcRenderer.on('pty:data', (_e, id, data) => cb(id, data)),
  onExit: (cb) => ipcRenderer.on('pty:exit', (_e, id) => cb(id)),
});

contextBridge.exposeInMainWorld('clip', {
  read: () => ipcRenderer.invoke('clip:read'),
  write: (text) => ipcRenderer.send('clip:write', text),
});
