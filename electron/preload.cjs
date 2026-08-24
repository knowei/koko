const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  switchWindowMode: (mode) => ipcRenderer.send('window-mode-switch', mode),
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  captureScreenFrame: () => ipcRenderer.invoke('desktop-capture-frame'),
  onWindowModeChange: (callback) => {
    ipcRenderer.on('window-mode-change', (event, mode) => callback(mode));
  },
  onTrayAction: (callback) => {
    const listener = (event, action) => callback(action);
    ipcRenderer.on('tray-action', listener);
    return () => ipcRenderer.removeListener('tray-action', listener);
  },
});
