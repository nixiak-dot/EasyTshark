const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applicationEvidence, applicationCandidates, protocolFields } = require('./evidence.cjs');
const { createSessionAgent } = require('./runtime.cjs');

test('application fields survive large lower-layer trees and reveal body locations without body text', () => {
  const protocols = [{ name: 'tls', children: Array.from({ length: 90 }, () => ({ name: 'tls.handshake.type', show: '1' })) },
    { name: 'http2', children: [{ name: 'http2.headers.method', show: 'GET' }, { name: 'http2.headers.path', show: '/api/search' },
      { name: 'http2.headers.status', show: '200' }, { name: 'http2.data.data', value: Buffer.from('private-body').toString('hex') }] }];
  const fields = protocolFields(protocols);
  assert.equal(fields.fields.length, 60);
  assert.equal(fields.fields[0][0], 'http2.headers.method');
  assert.equal(fields.limited, true);
  const evidence = applicationEvidence(protocols);
  assert.equal(evidence.status, 'application_observed');
  assert.deepEqual(evidence.bodies, [{ body_index: 0, source: 'http2.data.data' }]);
  assert.ok(evidence.fields.some(([name, value]) => name === 'http2.headers.path' && value === '/api/search'));
  assert.ok(!JSON.stringify(evidence).includes('private-body'));
  assert.ok(!JSON.stringify(evidence).includes(Buffer.from('private-body').toString('hex')));
});

test('encrypted-only frames remain locally unknown, not a claim that the session cannot decrypt', () => {
  const evidence = applicationEvidence([{ name: 'tls', children: [{ name: 'tls.app_data', value: 'secret-ciphertext' }] }]);
  assert.equal(evidence.status, 'not_observed_in_checked_frame');
  assert.deepEqual(evidence.bodies, []);
  assert.ok(!JSON.stringify(evidence).includes('secret-ciphertext'));
});

test('candidate frames favor application traffic and spread the sample beyond the handshake', () => {
  const packets = Array.from({ length: 12 }, (_, index) => ({ frame_number: index + 1, protocol: 'TLSv1.3', info: index < 4 ? 'Client Hello' : 'Application Data' }));
  const candidates = applicationCandidates(packets);
  assert.deepEqual(candidates.slice(0, 4).map((packet) => packet.frame_number), [5, 6, 12, 9]);
  assert.equal(new Set(candidates.map((packet) => packet.frame_number)).size, candidates.length);
  assert.deepEqual(applicationCandidates([]), []);
});

test('TLS-labelled browser session can discover HTTP/2 headers then read body on demand', async () => {
  let round = 0;
  const detailFrames = [];
  const packets = Array.from({ length: 8 }, (_, index) => ({ frame_number: index + 1, session_id: 7, protocol: 'TLSv1.3', info: index < 4 ? 'Server Hello' : 'Application Data' }));
  const secretBody = Buffer.from('{"result":"search-result"}').toString('hex');
  const query = async (path, args) => {
    if (path === '/api/getSessionList') return { data: [{ session_id: 7, app_proto: 'TLSv1.3' }] };
    if (path === '/api/queryPacket') return { data: packets, total: packets.length };
    detailFrames.push(args.frameNumber);
    return { data: { proto: args.frameNumber === 8 ? [{ name: 'http2', children: [
      { name: 'http2.headers.path', show: '/search?q=test' }, { name: 'http2.headers.status', show: '200' },
      { name: 'http2.data.data', value: secretBody }] }] : [{ name: 'tls' }] } };
  };
  const call = (name, args) => ({ message: { tool_calls: [{ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } });
  const agent = createSessionAgent(query, async (config, key, messages) => {
    round += 1;
    if (round === 1) return call('session_summary', {});
    if (round === 2) {
      assert.equal(detailFrames.length, 0);
      assert.equal(JSON.parse(messages.at(-1).content).application_visibility.status, 'not_checked');
      assert.match(messages[0].content, /必须先调用 session_application/);
      return call('session_application', {});
    }
    if (round === 3) {
      const result = JSON.parse(messages.at(-1).content);
      assert.equal(result.checked.length, 4);
      const readable = result.checked.find((item) => item.status === 'application_observed');
      assert.equal(readable.frame, 8);
      assert.ok(!JSON.stringify(result).includes(secretBody));
      assert.ok(!JSON.stringify(result).includes('search-result'));
      return call('packet_body', { frame: readable.frame });
    }
    assert.match(JSON.parse(messages.findLast((message) => message.role === 'tool').content).text, /search-result/);
    return { message: { content: '帧 8 可读到搜索接口响应，状态 200。' } };
  });
  const result = await agent.chat({ sessionId: 7, text: '分析浏览器请求的网络过程', settings: { baseUrl: 'https://example.com/v1', model: 'fixture' } });
  assert.equal(result.actions.length, 3);
  assert.equal(detailFrames.length, 5);
  assert.ok(detailFrames.every((frame) => packets.some((packet) => packet.frame_number === frame)));
});
