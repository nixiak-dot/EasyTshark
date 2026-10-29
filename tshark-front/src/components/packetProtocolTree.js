export function protocolChildren(node) {
  return Array.isArray(node.children)
    ? node.children
    : [...(node.field || []), ...(node.proto || [])];
}

function hasReassembledData(node) {
  return /(^|\.)reassembled\.(data|length)$/.test(node.name || '')
    || protocolChildren(node).some(hasReassembledData);
}

export function protocolTitle(node) {
  if (node.showname) return node.showname;
  const value = node.show ?? node.value;
  return [node.name, value].filter((part) => part !== undefined && part !== '').join(': ')
    || node.element || 'Field';
}

export function buildProtocolTree(protocols = []) {
  let usesReassembledData = false;
  let usesDecryptedData = false;
  const visit = (node, path, byteSourceAvailable) => ({
    ...node,
    id: path,
    showname: protocolTitle(node),
    byteSourceAvailable,
    children: protocolChildren(node).map((child, index) =>
      visit(child, `${path}-${index}`, byteSourceAvailable && !hasReassembledData(child))),
  });
  return protocols.map((node, index) => {
    const tree = visit(node, `${index}`, !usesReassembledData && !usesDecryptedData);
    usesReassembledData = usesReassembledData || hasReassembledData(node);
    usesDecryptedData = usesDecryptedData || node.name === 'tls' || node.name === 'ssl';
    return tree;
  });
}

export function packetByteRange(node, byteLength) {
  if (!node || node.byteSourceAvailable === false || node.generated === 'true'
    || node.generated === 'yes' || node.pos === undefined || node.size === undefined
    || node.pos === '' || node.size === '') return [];
  const start = Number(node.pos);
  const size = Number(node.size);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size)
    || start < 0 || size <= 0 || start + size > byteLength) return [];
  return Array.from({ length: size }, (_, index) => start + index);
}
