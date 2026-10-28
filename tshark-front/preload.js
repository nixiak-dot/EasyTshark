const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  showSavePath: (directory) => ipcRenderer.invoke('show-save-dialog', directory),
  selectSettingsPath: (field, currentPath) => ipcRenderer.invoke('select-settings-path', field, currentPath)
});
