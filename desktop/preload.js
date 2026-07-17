const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omranVPN', {
  getStatus: () => ipcRenderer.invoke('vpn:status'),
  toggle: (server) => ipcRenderer.invoke('vpn:toggle', server)
});
