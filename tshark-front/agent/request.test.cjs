const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { requestJson, ServiceRequestError, connectionReason } = require('./request.cjs');
const { createSessionAgent } = require('./runtime.cjs');
const { createAgentClient } = require('./client.cjs');

test('nested Node connection errors produce actionable reasons without raw messages', () => {
  const cases = [
    ['ENOTFOUND', '域名解析失败'], ['EAI_AGAIN', '域名解析失败'],
    ['ECONNREFUSED', '连接被拒绝'], ['UND_ERR_CONNECT_TIMEOUT', '超时'],
    ['CERT_HAS_EXPIRED', '证书验证失败'], ['ERR_TLS_CERT_ALTNAME_INVALID', '证书验证失败'],
    ['ECONNRESET', '连接被中断'], ['ENETUNREACH', '网络不可达'],
  ];
  for (const [code, expected] of cases) {
    const error = new TypeError('fetch failed SECRET', { cause: new AggregateError([
      Object.assign(new Error('Authorization: SECRET'), { code }),
    ]) });
    const message = connectionReason(error);
    assert.ok(message.includes(expected));
    assert.ok(message.includes(code));
    assert.ok(!message.includes('SECRET'));
  }
  assert.match(connectionReason(new Error('SECRET')), /网络连接失败/);
});

test('real HTTP failures and invalid JSON retain source and address but not response secrets', async () => {
  let status = 401;
  const server = http.createServer((request, response) => {
    request.resume();
    response.writeHead(status);
    response.end('<html>SECRET</html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [code, hint] of [[401, 'API Key'], [404, '路径前缀'], [429, '额度'], [503, '服务端异常'], [200, '有效 JSON']]) {
      status = code;
      await assert.rejects(requestJson('模型服务', `${base}/chat/completions?secret=SECRET`, { method: 'POST' }), (error) => {
        assert.ok(error instanceof ServiceRequestError);
        assert.ok(error.message.includes('模型服务'));
        assert.ok(error.message.includes(hint));
        assert.ok(error.message.includes(`${base}/chat/completions`));
        assert.ok(!error.message.includes('SECRET'));
        if (code !== 200) assert.ok(error.message.includes(`HTTP ${code}`));
        return true;
      });
    }
    status = 401;
    const client = createAgentClient();
    const provider = { baseUrl: base, model: 'fixture' };
    client.settings({ ...provider, apiKey: 'SECRET' });
    const result = await client.chat({ sessionId: 7, text: '解释重传', provider });
    assert.equal(result.ok, false);
    assert.match(result.error, /模型服务请求失败（HTTP 401）/);
    assert.ok(!result.error.includes('SECRET'));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await assert.rejects(requestJson('本地抓包服务', `${base}/api/queryPacket`, { method: 'POST' }), (error) => {
    assert.match(error.message, /本地抓包服务.*连接被(拒绝|中断)/);
    assert.ok(error.message.includes('/api/queryPacket'));
    return true;
  });
});

test('local service errors reach the caller instead of becoming a generic tool result', async () => {
  let requests = 0;
  const agent = createSessionAgent(async () => {
    throw new ServiceRequestError('本地抓包服务：连接被拒绝（ECONNREFUSED）');
  }, async () => {
    requests += 1;
    return { message: { tool_calls: [{ id: 'summary', type: 'function', function: { name: 'session_summary', arguments: '{}' } }] } };
  });
  await assert.rejects(agent.chat({ sessionId: 7, text: '分析会话', settings: { baseUrl: 'https://example.com', model: 'fixture' } }), /本地抓包服务.*ECONNREFUSED/);
  assert.equal(requests, 1);
});

test('canceled requests keep cancellation semantics', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestJson('模型服务', 'http://127.0.0.1:1/chat/completions', { signal: controller.signal }), (error) => {
    assert.equal(error.name, 'AbortError');
    assert.ok(!(error instanceof ServiceRequestError));
    return true;
  });
});
