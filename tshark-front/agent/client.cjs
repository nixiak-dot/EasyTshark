const { createSessionAgent, validateSettings } = require('./runtime.cjs');
const { requestJson, ServiceRequestError } = require('./request.cjs');

async function query(path, payload, signal) {
  const params = payload.pageSize ? `?pageSize=${payload.pageSize}&pageNum=${payload.pageNum}` : '';
  const result = await requestJson('本地抓包服务', `http://127.0.0.1:8080${path}${params}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
  });
  if (result.code !== undefined && String(result.code) !== '200') throw new ServiceRequestError('本地抓包服务：会话数据读取失败，请检查后端运行状态和当前会话是否有效。');
  return result;
}

function createAgentClient(store) {
  let settings = { baseUrl: '', model: '' };
  let apiKey = '';
  const agent = createSessionAgent(query);
  return {
    settings(value) {
      const persisted = store?.read();
      if (value) {
        const validated = validateSettings(value);
        let nextKey = persisted?.apiKey ?? apiKey;
        if (typeof value.apiKey === 'string') {
          if (value.apiKey.length > 4096 || /[\r\n]/.test(value.apiKey)) throw new Error('无效的 API Key。');
          nextKey = value.apiKey.trim();
        }
        store?.write({ ...validated, apiKey: nextKey });
        settings = validated;
        apiKey = nextKey;
      } else if (persisted) {
        settings = { baseUrl: persisted.baseUrl, model: persisted.model };
        apiKey = persisted.apiKey;
      }
      return { ...settings, hasKey: Boolean(apiKey) };
    },
    async chat(request) {
      try {
        if (request?.provider?.baseUrl !== settings.baseUrl || request?.provider?.model !== settings.model) {
          throw new Error('模型配置已变化，请重新加载配置并确认数据发送目标。');
        }
        return { ok: true, ...(await agent.chat({ sessionId: request?.sessionId, text: request?.text,
          reset: Boolean(request?.reset), settings, apiKey })) };
      } catch (error) {
        const message = String(error.message || '分析失败。');
        return { ok: false, error: apiKey ? message.split(apiKey).join('[已隐藏]') : message };
      }
    },
    cancel() { agent.cancel(); },
  };
}

module.exports = { createAgentClient };
