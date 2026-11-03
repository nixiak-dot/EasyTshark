const { createAgentClient } = require('./client.cjs');

module.exports = function registerAgent(ipcMain, isTrusted, store) {
  const clients = new Map();
  function client(event) {
    if (event.senderFrame !== event.sender.mainFrame || !isTrusted(event.sender)) throw new Error('不受信任的 Agent 请求。');
    if (!clients.has(event.sender.id)) {
      const instance = createAgentClient(store);
      clients.set(event.sender.id, instance);
      event.sender.once('destroyed', () => { instance.cancel(); clients.delete(event.sender.id); });
    }
    return clients.get(event.sender.id);
  }
  ipcMain.handle('session-agent-settings', (event, value) => client(event).settings(value));
  ipcMain.handle('session-agent-chat', (event, request) => client(event).chat(request));
  ipcMain.handle('session-agent-cancel', (event) => client(event).cancel());
};
