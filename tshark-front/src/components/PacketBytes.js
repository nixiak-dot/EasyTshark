import { useLayoutEffect, useRef, useState } from 'react';
import { ASCII_BYTE_GAP, ASCII_BYTE_WIDTH, BYTE_GROUP_GAP, BYTE_OFFSET_WIDTH, BYTE_VIEW_PADDING,
  bytesPerRowForWidth, HEX_BYTE_GAP, HEX_BYTE_WIDTH, MIN_PACKET_BYTES_WIDTH } from './packetByteLayout';
import '../style/packet-bytes.css';

export function parsePacketBytes(hex) {
  const normalized = hex.replace(/\s/g, '');
  if (!/^(?:[\da-f]{2})*$/i.test(normalized)) throw new Error('Invalid packet bytes');
  return (normalized.match(/.{2}/g) || []).map((value, index) => {
    const code = parseInt(value, 16);
    const printable = code >= 32 && code <= 126;
    return { index, hex: value.toUpperCase(), ascii: printable ? String.fromCharCode(code) : '.', printable };
  });
}

export default function PacketBytes({ bytes, selectedBytes, onSelect }) {
  const anchorRef = useRef(null);
  const viewRef = useRef(null);
  const [bytesPerRow, setBytesPerRow] = useState(16);
  useLayoutEffect(() => {
    const view = viewRef.current;
    const measure = () => {
      if (view.clientWidth > 0) setBytesPerRow(bytesPerRowForWidth(view.clientWidth));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(view);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const selected = new Set(selectedBytes);
  const selectByte = (event, index) => {
    const anchor = event.shiftKey && anchorRef.current !== null ? anchorRef.current : index;
    if (!event.shiftKey || anchorRef.current === null) anchorRef.current = index;
    const start = Math.min(anchor, index);
    onSelect(Array.from({ length: Math.abs(index - anchor) + 1 }, (_, offset) => start + offset));
  };
  const rows = [];
  for (let start = 0; start < bytes.length; start += bytesPerRow) rows.push(bytes.slice(start, start + bytesPerRow));

  return (
    <div ref={viewRef} className='packet-bytes' aria-label='数据包字节视图' data-bytes-per-row={bytesPerRow}
      style={{ '--byte-columns': bytesPerRow, '--hex-byte-width': `${HEX_BYTE_WIDTH}px`, '--hex-byte-gap': `${HEX_BYTE_GAP}px`,
        '--ascii-byte-width': `${ASCII_BYTE_WIDTH}px`, '--ascii-byte-gap': `${ASCII_BYTE_GAP}px`,
        '--byte-offset-width': `${BYTE_OFFSET_WIDTH}px`, '--byte-group-gap': `${BYTE_GROUP_GAP}px`,
        '--byte-view-padding': `${BYTE_VIEW_PADDING}px`, minWidth: MIN_PACKET_BYTES_WIDTH }}>
      <div className='packet-bytes-heading' aria-hidden='true'>
        <span>偏移</span><span>十六进制</span><span>ASCII</span>
      </div>
      {rows.map((row) => (
        <div className='packet-bytes-row' key={row[0].index}>
          <span className={`packet-byte-offset${row.some((byte) => selected.has(byte.index)) ? ' is-selected' : ''}`}>
            {row[0].index.toString(16).padStart(4, '0')}
          </span>
          {['hex', 'ascii'].map((format) => (
            <div className={`packet-byte-group packet-byte-${format}`} key={format}>
              {row.map((byte) => (
                <button type='button' key={byte.index} data-byte-index={byte.index}
                  className={`packet-byte${selected.has(byte.index) ? ' is-selected' : ''}${format === 'ascii' && !byte.printable ? ' is-nonprintable' : ''}`}
                  aria-label={`${format.toUpperCase()} 字节 ${byte.index}: ${byte.hex}`}
                  aria-pressed={selected.has(byte.index)}
                  title={`偏移 0x${byte.index.toString(16).padStart(4, '0')} · 0x${byte.hex}${byte.printable ? ` · ${byte.ascii}` : ' · 不可打印字符'}`}
                  onClick={(event) => selectByte(event, byte.index)}>
                  {byte[format]}
                </button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
