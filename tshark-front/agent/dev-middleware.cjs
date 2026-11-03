const express = require('express');
const { createAgentClient } = require('./client.cjs');
const { SettingsFileError } = require('./settings.cjs');

module.exports = function agentMiddleware(store) {
  const router = express.Router();
  const clients = new Map();
  router.use((request, response, next) => {
    const host = request.headers.host || '';
    const origin = request.headers.origin;
    const remote = request.socket.remoteAddress;
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ||
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) ||
        (origin && origin !== `http://${host}`) || request.headers['sec-fetch-site'] === 'cross-site') {
      return response.status(403).json({ error: '仅允许本机同源开发页面访问。' });
    }
    response.set('Cache-Control', 'no-store');
    const id = request.headers['x-session-agent'];
    if (typeof id !== 'string' || !/^[a-f\d-]{36}$/.test(id)) return response.status(400).json({ error: '无效的页面标识。' });
    const now = Date.now();
    for (const [key, entry] of clients) {
      if (!entry.active && now - entry.lastUsed > 3600000) { entry.client.cancel(); clients.delete(key); }
    }
    if (!clients.has(id)) {
      if (clients.size >= 32) return response.status(429).json({ error: '开发会话过多，请重启开发服务。' });
      clients.set(id, { client: createAgentClient(store), lastUsed: now, active: 0 });
    }
    request.agentEntry = clients.get(id);
    request.agentEntry.lastUsed = now;
    next();
  });
  router.use(express.json({ limit: '16kb' }));
  router.post('/:action', async (request, response) => {
    const entry = request.agentEntry;
    entry.active += 1;
    try {
      if (request.params.action === 'settings') return response.json(entry.client.settings(request.body?.settings));
      if (request.params.action === 'chat') return response.json(await entry.client.chat(request.body));
      if (request.params.action === 'cancel') { entry.client.cancel(); return response.json({ ok: true }); }
      response.status(404).json({ error: '未知的 Agent 操作。' });
    } catch (error) { response.status(400).json({ error: error instanceof SettingsFileError ? error.message : '配置无效，请检查服务地址、模型名称和密钥格式。' }); }
    finally { entry.active -= 1; entry.lastUsed = Date.now(); }
  });
  router.use((error, request, response, next) => {
    response.status(400).json({ error: '请求内容无效或过大。' });
  });
  return router;
};
