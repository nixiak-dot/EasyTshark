function plainText(value) {
  let fence = null;
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n');
  return lines.map((line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker && !fence) {
      fence = { character: marker[1][0], length: marker[1].length };
      return '';
    }
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = null;
        return '';
      }
      return line;
    }
    if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,}|={3,})$/.test(line)) return '';
    let text = line.replace(/^\s{0,3}(?:>\s*)+/, '')
      .replace(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/, '$1')
      .replace(/^\s*[-+*]\s+(?:\[[ xX]\]\s+)?/, '')
      .replace(/^\s*(\d+)[.)]\s+/, '$1、');
    if (/^\s*\|.*\|\s*$/.test(text)) {
      const cells = text.trim().slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return '';
      text = cells.join('；');
    }
    return text.replace(/!?\[([^\]\n]+)\]\(([^\s)]+)\)/g, (match, label, url) => label === url ? url : `${label}（${url}）`)
      .replace(/(`+)([^`\n]+)\1/g, '$2')
      .replace(/(\*\*|__)(?=\S)(.+?\S|\S)\1/g, '$2')
      .replace(/~~(?=\S)(.+?\S|\S)~~/g, '$1')
      .replace(/(^|[\s（(，。；：])([*_])(?=\S)([^*_\n]*?\S)\2(?=$|[\s）)，。；：！？])/g, '$1$3');
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { plainText };
