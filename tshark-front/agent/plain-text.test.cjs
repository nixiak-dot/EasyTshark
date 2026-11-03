const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainText } = require('./plain-text.cjs');
const { createSessionAgent } = require('./runtime.cjs');

test('common Markdown becomes readable text without adding a renderer', () => {
  assert.equal(plainText('# 结论\n\n**握手完成**\n- `tcp.flags` 正常\n1. 检查响应\n> 引用\n\n| 帧 | 结果 |\n| --- | :---: |\n| 41 | 成功 |\n\n[文档](https://example.com/docs)'),
    '结论\n\n握手完成\ntcp.flags 正常\n1、检查响应\n引用\n\n帧；结果\n\n41；成功\n\n文档（https://example.com/docs）');
  assert.equal(plainText('**重点**，*说明*。~~旧结论~~'), '重点，说明。旧结论');
});

test('network values and fenced content are preserved', () => {
  const values = 'GET /api/user_info?a=1&b=2\n192.0.2.1:443 → 198.51.100.2:5000\ntcp.analysis_retransmission\n_seq_ _ack_\n帧 41 至 43';
  assert.equal(plainText(values), values.replace('_seq_ _ack_', 'seq ack'));
  assert.equal(plainText('```text\n# literal\n**literal**\n```'), '# literal\n**literal**');
});

test('shared runtime returns and remembers normalized assistant answers', async () => {
  let lastMessages;
  const agent = createSessionAgent(() => { throw new Error('No packet read expected'); }, async (settings, key, messages) => {
    lastMessages = messages;
    return { message: { content: '## 结论\n**连接正常**\n- `TCP` 握手完成' } };
  });
  const request = { sessionId: 7, text: '解释连接', settings: { baseUrl: 'https://example.com', model: 'fixture' } };
  const result = await agent.chat(request);
  assert.equal(result.answer, '结论\n连接正常\nTCP 握手完成');
  await agent.chat({ ...request, text: '继续' });
  assert.equal(lastMessages.find((message) => message.role === 'assistant').content, result.answer);
});
