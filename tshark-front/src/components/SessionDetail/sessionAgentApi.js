let browserId;

async function request(action, body = {}) {
  if (!browserId) browserId = window.crypto.randomUUID();
  let response;
  try {
    response = await fetch(`/__session-agent/${action}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Agent': browserId }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '开发 Agent 服务不可用。');
    return result;
  } catch (error) {
    if (!response || response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('浏览器调试请使用 npm start 启动并重启前端开发服务，同时启动本地抓包后端。');
    }
    throw error;
  }
}

const browserApi = {
  agentSettings: (settings) => request('settings', { settings }),
  agentChat: (value) => request('chat', value),
  agentCancel: () => request('cancel'),
};

export function sessionAgentApi() {
  return window.electronAPI?.agentChat ? window.electronAPI : browserApi;
}
