import { buildProtocolTree, packetByteRange, protocolTitle } from './packetProtocolTree';

test('preserves nested, repeated, hidden and mixed protocol fields in order', () => {
  const protocols = [{ name: 'dns', children: [
    { name: 'dns.qry.name', show: 'example.test', hide: 'yes' },
    { name: 'Answers', children: [
      { name: 'dns.a', show: '192.0.2.1', pos: '42', size: '4' },
      { name: 'dns.a', show: '192.0.2.2', pos: '58', size: '4' },
      { element: 'proto', name: 'nested', children: [{ name: 'payload', value: 'abcd' }] },
    ] },
  ] }];
  const tree = buildProtocolTree(protocols);
  expect(tree[0].children[0]).toMatchObject({
    hide: 'yes', showname: 'dns.qry.name: example.test',
  });
  const answers = tree[0].children[1].children;
  expect(answers.map((node) => node.name)).toEqual(['dns.a', 'dns.a', 'nested']);
  expect(answers[0].id).not.toBe(answers[1].id);
  expect(answers[2].children[0].showname).toBe('payload: abcd');
  expect(protocols[0].children[0].id).toBeUndefined();
});

test('supports legacy field arrays and protocol label fallbacks', () => {
  const tree = buildProtocolTree([{ name: 'http', field: [{ name: 'http.host', show: 'example.test' }] }]);
  expect(tree[0].children[0].showname).toBe('http.host: example.test');
  expect(protocolTitle({ showname: 'Host: example.test', name: 'http.host' })).toBe('Host: example.test');
  expect(protocolTitle({ show: 'GET / HTTP/1.1' })).toBe('GET / HTTP/1.1');
  expect(protocolTitle({ name: 'answer', show: '0' })).toBe('answer: 0');
  expect(buildProtocolTree()).toEqual([]);
});

test('only maps valid, captured-frame byte ranges', () => {
  expect(packetByteRange({ pos: '14', size: '4' }, 64)).toEqual([14, 15, 16, 17]);
  [
    {}, { pos: '', size: '2' }, { pos: '-1', size: '2' },
    { pos: '1.5', size: '2' }, { pos: '60', size: '8' },
    { pos: '0', size: '0' }, { pos: '0', size: '4', generated: 'true' },
    { pos: '0', size: '4', byteSourceAvailable: false },
  ].forEach((node) => expect(packetByteRange(node, 64)).toEqual([]));
});

test('shows reassembled HTTP fields without mapping them onto current-frame bytes', () => {
  const tree = buildProtocolTree([
    { name: 'tcp', children: [
      { name: 'tcp.srcport', pos: '34', size: '2' },
      { name: 'tcp.segments', children: [{ name: 'tcp.reassembled.data', pos: '0', size: '10' }] },
    ] },
    { name: 'http', children: [{ name: 'http.host', show: 'example.test', pos: '0', size: '4' }] },
  ]);
  expect(packetByteRange(tree[0].children[0], 64)).toEqual([34, 35]);
  expect(packetByteRange(tree[0].children[1], 64)).toEqual([]);
  expect(tree[1].children[0].showname).toBe('http.host: example.test');
  expect(packetByteRange(tree[1].children[0], 64)).toEqual([]);
});
