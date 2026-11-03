import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PacketBytes, { parsePacketBytes } from './PacketBytes';
import { bytesPerRowForWidth, MIN_PACKET_BYTES_WIDTH, MIN_PACKET_DETAIL_WIDTH } from './packetByteLayout';

test('bytes preserve spaces and printable ASCII and replace only nonprintable bytes', () => {
  expect(parsePacketBytes('00 20 41 7e 7f ff')).toEqual([
    { index: 0, hex: '00', ascii: '.', printable: false },
    { index: 1, hex: '20', ascii: ' ', printable: true },
    { index: 2, hex: '41', ascii: 'A', printable: true },
    { index: 3, hex: '7E', ascii: '~', printable: true },
    { index: 4, hex: '7F', ascii: '.', printable: false },
    { index: 5, hex: 'FF', ascii: '.', printable: false },
  ]);
  expect(parsePacketBytes('')).toEqual([]);
  expect(() => parsePacketBytes('123')).toThrow();
  expect(() => parsePacketBytes('gg')).toThrow();
});

test('each row aligns up to 16 HEX and ASCII byte cells with a shared offset', () => {
  const bytes = parsePacketBytes('41'.repeat(19));
  const { container } = render(<PacketBytes bytes={bytes} selectedBytes={[15, 16]} onSelect={jest.fn()} />);
  const rows = container.querySelectorAll('.packet-bytes-row');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelectorAll('.packet-byte-hex button')).toHaveLength(16);
  expect(rows[0].querySelectorAll('.packet-byte-ascii button')).toHaveLength(16);
  expect(rows[1].querySelectorAll('.packet-byte-hex button')).toHaveLength(3);
  expect(rows[1].querySelectorAll('.packet-byte-ascii button')).toHaveLength(3);
  expect(rows[0].querySelector('.packet-byte-offset')).toHaveTextContent('0000');
  expect(rows[1].querySelector('.packet-byte-offset')).toHaveTextContent('0010');
  expect(container.querySelectorAll('.packet-byte.is-selected')).toHaveLength(4);
  expect(container.querySelectorAll('.packet-byte-offset.is-selected')).toHaveLength(2);
});

test('clicks and shift-click ranges synchronize selection in both directions across rows', () => {
  function View() {
    const [selected, setSelected] = useState([]);
    return <PacketBytes bytes={parsePacketBytes('41'.repeat(19))} selectedBytes={selected} onSelect={setSelected} />;
  }
  const { container } = render(<View />);
  fireEvent.click(screen.getByRole('button', { name: 'HEX 字节 15: 41' }));
  expect(screen.getByRole('button', { name: 'ASCII 字节 15: 41' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'ASCII 字节 18: 41' }), { shiftKey: true });
  expect(container.querySelectorAll('.packet-byte.is-selected')).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: 'ASCII 字节 2: 41' }));
  expect(screen.getByRole('button', { name: 'HEX 字节 2: 41' })).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelectorAll('.packet-byte.is-selected')).toHaveLength(2);
});

test('byte counts fit the available width and never fall below eight', () => {
  expect(bytesPerRowForWidth(MIN_PACKET_BYTES_WIDTH - 1)).toBe(8);
  expect(bytesPerRowForWidth(MIN_PACKET_BYTES_WIDTH)).toBe(8);
  expect(bytesPerRowForWidth(378)).toBe(9);
  expect(bytesPerRowForWidth(609)).toBe(16);
  expect(bytesPerRowForWidth(873)).toBe(24);
  expect((MIN_PACKET_DETAIL_WIDTH - 26) / 2 - 20).toBe(MIN_PACKET_BYTES_WIDTH);
});

test('container resize reflows both byte columns and offsets without losing selection', () => {
  const originalObserver = global.ResizeObserver;
  let notifyResize;
  const disconnect = jest.fn();
  global.ResizeObserver = jest.fn((callback) => {
    notifyResize = callback;
    return { observe: jest.fn(), disconnect };
  });
  try {
    const { container, unmount } = render(<PacketBytes bytes={parsePacketBytes('41'.repeat(35))}
      selectedBytes={[15, 16]} onSelect={jest.fn()} />);
    const view = screen.getByLabelText('数据包字节视图');
    Object.defineProperty(view, 'clientWidth', { configurable: true, value: 345 });
    act(() => notifyResize());
    expect(view).toHaveAttribute('data-bytes-per-row', '8');
    let rows = container.querySelectorAll('.packet-bytes-row');
    expect(rows).toHaveLength(5);
    expect(rows[1].querySelector('.packet-byte-offset')).toHaveTextContent('0008');
    rows.forEach((row) => expect(row.querySelectorAll('.packet-byte-hex button')).toHaveLength(row.querySelectorAll('.packet-byte-ascii button').length));
    expect(container.querySelectorAll('.packet-byte.is-selected')).toHaveLength(4);
    Object.defineProperty(view, 'clientWidth', { configurable: true, value: 873 });
    act(() => notifyResize());
    expect(view).toHaveAttribute('data-bytes-per-row', '24');
    rows = container.querySelectorAll('.packet-bytes-row');
    expect(rows).toHaveLength(2);
    expect(rows[1].querySelector('.packet-byte-offset')).toHaveTextContent('0018');
    expect(container.querySelectorAll('.packet-byte.is-selected')).toHaveLength(4);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  } finally {
    global.ResizeObserver = originalObserver;
  }
});
