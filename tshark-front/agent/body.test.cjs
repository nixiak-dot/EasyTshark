const { test } = require('node:test');
const assert = require('node:assert/strict');
const { packetBody, protocolFields } = require('./evidence.cjs');
const { createSessionAgent } = require('./runtime.cjs');

function body(text, name = 'http.file_data') {
  return { name, value: Buffer.from(text).toString('hex') };
}

test('UTF-8 body pagination, HTTP versions and redaction before slicing', () => {
  const protocols = [{ name: 'http', field: [body('{"password":"secret-value","message":"业务错误"}'), body('second', 'http2.data.data')] }];
  const first = packetBody(protocols, { limit: 12 });
  const rest = packetBody(protocols, { offset: first.next_offset });
  assert.equal(first.status, 'available');
  assert.equal(first.body_count, 2);
  assert.equal(first.text + rest.text, '{"password":[REDACTED],"message":"业务错误"}');
  assert.equal(rest.has_more, false);
  assert.equal(packetBody(protocols, { body_index: 1 }).text, 'second');
  assert.equal(packetBody([body('third', 'http3.data')]).text, 'third');
  assert.throws(() => packetBody(protocols, { limit: 4001 }));
  assert.throws(() => packetBody(protocols, { offset: -1 }));
});

test('TLS bytes, binary and generic raw payload are not returned; limits are explicit', () => {
  assert.equal(packetBody([{ name: 'tls.app_data', value: 'deadbeef' }, { name: 'data.data', value: 'abcd' }]).status, 'unavailable');
  assert.equal(packetBody([{ name: 'http.file_data', value: 'ff00' }]).status, 'non_text');
  assert.equal(packetBody([body('a\u0000b')]).status, 'non_text');
  assert.equal(packetBody([{ name: 'http.file_data', showname: 'File Data: 42 bytes' }]).status, 'unavailable');
  assert.equal(packetBody([body('abc')], { body_index: 1 }).status, 'unavailable');
  assert.equal(packetBody([body('abc')], { offset: 10 }).text, '');
  assert.equal(packetBody([body('a'.repeat(262145))]).limited, true);
  assert.equal(packetBody(Array.from({ length: 20 }, () => body('a'))).limited, true);
});

test('HTTP/2 and HTTP/3 metadata excludes bodies and credentials', () => {
  const fields = protocolFields([{ name: 'http2.headers.status', show: '500' }, { name: 'http3.headers.method', show: 'POST' },
    { name: 'http2.headers.authorization', show: 'secret' }, body('hidden', 'http2.data.data')]);
  assert.deepEqual(fields.fields, [['http2.headers.status', '500'], ['http3.headers.method', 'POST']]);
});

test('PDML children, show-only bodies and header redaction', () => {
  const output = packetBody([{ name: 'http', children: [body('Authorization: Bearer top-secret\r\nCookie: a=secret; b=secret\r\nmessage=ok')] }]);
  assert.ok(!output.text.includes('secret'));
  assert.ok(output.text.includes('message=ok'));
  assert.equal(packetBody([{ name: 'http.file_data', show: 'parsed text' }]).text, 'parsed text');
  const large = packetBody([body('a'.repeat(262143) + '中')], { offset: 262140 });
  assert.equal(large.status, 'available');
  assert.equal(large.limited, true);
  assert.equal(large.text, 'aaa');
});

test('body tool is opt-in and session scoped and provides frame evidence', async () => {
  let detailReads = 0;
  let round = 0;
  const agent = createSessionAgent(async (path) => {
    if (path === '/api/getSessionList') return { data: [{ session_id: 7 }] };
    if (path === '/api/queryPacket') return { data: [{ session_id: 7, frame_number: 11 }], total: 1 };
    detailReads += 1;
    return { data: { proto: [body('business error')] } };
  }, async (config, key, messages) => {
    round += 1;
    if (round === 1) {
      assert.equal(detailReads, 0);
      assert.ok(!JSON.stringify(messages).includes('business error'));
      return { message: { tool_calls: [{ id: 'bad', type: 'function', function: { name: 'packet_body', arguments: '{"frame":999}' } }] } };
    }
    if (round === 2) {
      assert.equal(detailReads, 0);
      return { message: { tool_calls: [{ id: 'good', type: 'function', function: { name: 'packet_body', arguments: '{"frame":11}' } }] } };
    }
    const result = JSON.parse(messages.at(-1).content);
    assert.equal(result.frame, 11);
    assert.equal(result.text, 'business error');
    return { message: { content: '帧 11 返回业务错误。' } };
  });
  await agent.chat({ sessionId: 7, text: '读取错误正文', settings: { baseUrl: 'https://example.com/v1', model: 'fixture' } });
  assert.equal(detailReads, 1);
});
