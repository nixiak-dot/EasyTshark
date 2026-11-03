import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DataPacketPage from './DataPacketPage';
import { apiPost } from '../Api.ts';

jest.mock('../Api.ts', () => ({ apiGet: jest.fn(), apiPost: jest.fn() }));
jest.mock('./useContentColumnWidths', () => ({
  __esModule: true,
  default: () => require('react').useRef(null),
}));
jest.mock('react-resizable', () => ({ Resizable: ({ children }) => children }));

const detail = {
  data: { proto: [{ name: 'frame', showname: 'Frame bytes 1 through 3', pos: '1', size: '3' }], hexdata: '00414243ff' },
};
const props = { match: { params: { type: 'detail', sessionId: '7' } } };

beforeEach(() => {
  jest.clearAllMocks();
  apiPost.mockImplementation(async (path) => path === '/api/queryPacket'
    ? { data: [{ frame_number: 1, timestamp: 1 }, { frame_number: 2, timestamp: 2 }], total: 2 }
    : detail);
});

test('both detail panes use Arco loading indicators until the response arrives', async () => {
  let resolveDetail;
  const original = apiPost.getMockImplementation();
  apiPost.mockImplementation((path, payload) => path === '/api/getPacketDetail'
    ? new Promise((resolve) => { resolveDetail = resolve; }) : original(path, payload));
  const { container } = render(<DataPacketPage {...props} />);
  await waitFor(() => expect(screen.getByLabelText('协议树')).toHaveAttribute('aria-busy', 'true'));
  expect(screen.getByLabelText('十六进制与 ASCII')).toHaveAttribute('aria-busy', 'true');
  expect(container.querySelectorAll('.packet-detail-spin.arco-spin-loading')).toHaveLength(2);
  expect(screen.getByText('正在加载协议树…')).toBeInTheDocument();
  expect(screen.getByText('正在加载字节数据…')).toBeInTheDocument();
  await act(async () => resolveDetail(detail));
  expect(screen.getByLabelText('协议树')).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByLabelText('十六进制与 ASCII')).toHaveAttribute('aria-busy', 'false');
  expect(container.querySelectorAll('.packet-detail-spin.arco-spin-loading')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'HEX 字节 1: 41' })).toBeInTheDocument();
});

test('protocol field ranges highlight both byte representations and manual selection replaces the range', async () => {
  const { container } = render(<DataPacketPage {...props} />);
  fireEvent.click(await screen.findByText('Frame bytes 1 through 3'));
  expect(container.querySelectorAll('.packet-byte.is-selected')).toHaveLength(6);
  expect(screen.getByRole('button', { name: 'HEX 字节 1: 41' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'ASCII 字节 3: 43' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'ASCII 字节 4: FF' }));
  expect(container.querySelectorAll('.packet-byte.is-selected')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'HEX 字节 4: FF' })).toHaveAttribute('aria-pressed', 'true');
});

test('detail failures stop both indicators and leave no stale byte data', async () => {
  const original = apiPost.getMockImplementation();
  apiPost.mockImplementation((path, payload) => path === '/api/getPacketDetail'
    ? Promise.reject(new Error('Unavailable')) : original(path, payload));
  const { container } = render(<DataPacketPage {...props} />);
  await screen.findByRole('alert');
  expect(screen.getByLabelText('协议树')).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByLabelText('十六进制与 ASCII')).toHaveAttribute('aria-busy', 'false');
  expect(container.querySelectorAll('.packet-byte')).toHaveLength(0);
});

test('a stale response cannot end loading or populate bytes for a newer packet', async () => {
  const packetRef = React.createRef();
  const resolvers = {};
  const original = apiPost.getMockImplementation();
  apiPost.mockImplementation((path, payload) => path === '/api/getPacketDetail'
    ? new Promise((resolve) => { resolvers[payload.frameNumber] = resolve; }) : original(path, payload));
  const { container } = render(<DataPacketPage {...props} ref={packetRef} />);
  await waitFor(() => expect(resolvers[1]).toBeDefined());
  const bytePane = screen.getByLabelText('十六进制与 ASCII');
  bytePane.scrollLeft = 400;
  bytePane.scrollTop = 200;
  act(() => packetRef.current.setCurrentRowId(2, 1));
  expect(bytePane.scrollLeft).toBe(0);
  expect(bytePane.scrollTop).toBe(0);
  await waitFor(() => expect(resolvers[2]).toBeDefined());
  await act(async () => resolvers[1](detail));
  expect(screen.getByLabelText('十六进制与 ASCII')).toHaveAttribute('aria-busy', 'true');
  expect(container.querySelectorAll('.packet-byte')).toHaveLength(0);
  await act(async () => resolvers[2]({ data: { proto: [], hexdata: 'ff' } }));
  expect(screen.getByLabelText('十六进制与 ASCII')).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('button', { name: 'HEX 字节 0: FF' })).toBeInTheDocument();
});
