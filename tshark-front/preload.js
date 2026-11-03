const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  showSavePath: (directory) => ipcRenderer.invoke('show-save-dialog', directory),
  selectSettingsPath: (field, currentPath) => ipcRenderer.invoke('select-settings-path', field, currentPath),
  agentSettings: (settings) => ipcRenderer.invoke('session-agent-settings', settings),
  agentChat: (request) => ipcRenderer.invoke('session-agent-chat', request),
  agentCancel: () => ipcRenderer.invoke('session-agent-cancel')
});
