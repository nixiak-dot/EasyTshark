import React, { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DataPacketPage from './DataPacketPage';
import SessionPage from './SessionPage';
import { apiGet, apiPost } from '../Api.ts';

jest.mock('../Api.ts', () => ({ apiGet: jest.fn(), apiPost: jest.fn() }));
jest.mock('./useContentColumnWidths', () => ({
  __esModule: true,
  default: () => ({ current: null }),
}));
jest.mock('react-resizable', () => ({ Resizable: ({ children }) => children }));
jest.mock('@arco-design/web-react', () => ({
  Table: ({ data, rowKey, rowClassName, onRow }) => (
    <div>{data.map((record) => (
      <button
        key={record[rowKey]}
        data-testid={`row-${record[rowKey]}`}
        className={rowClassName(record)}
        onClick={onRow(record).onClick}
      >{record[rowKey]}</button>
    ))}</div>
  ),
  Pagination: ({ current, onChange }) => (
    <button onClick={() => onChange(current + 1)}>Next page</button>
  ),
  Tree: () => null,
  Button: ({ children }) => <button>{children}</button>,
}));

const packetProps = { match: { params: { type: 'all' } } };
const packets = (identifiers) => identifiers.map((frame_number) => ({ frame_number }));
let packetRows;
let sessionRows;

beforeEach(() => {
  packetRows = packets([1, 2, 3]);
  sessionRows = [{ session_id: 1 }, { session_id: 2 }];
  apiGet.mockResolvedValue({ code: '200', data: { status: 0 } });
  apiPost.mockImplementation(async (path) => {
    if (path === '/api/getPacketDetail') {
      return { data: { proto: [], hexdata: '' } };
    }
    const data = path === '/api/queryPacket' ? packetRows : sessionRows;
    return { data, total: data.length };
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('active capture polling retains the selected packet across multiple ticks', async () => {
  jest.useFakeTimers();
  apiGet.mockResolvedValue({ code: '200', data: { status: 2 } });
  await act(async () => { render(<DataPacketPage {...packetProps} />); });
  fireEvent.click(screen.getByTestId('row-2'));
  packetRows = packets([1, 2, 3, 4]);
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByTestId('row-2')).toHaveClass('selected-row');
  expect(screen.getByTestId('row-4')).toBeInTheDocument();
  packetRows = packets([1, 2, 3, 4, 5]);
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByTestId('row-2')).toHaveClass('selected-row');
  expect(screen.getByTestId('row-5')).toBeInTheDocument();
});

test('packet refresh keeps the clicked row and its detail instead of selecting the first row', async () => {
  const ref = createRef();
  render(<DataPacketPage {...packetProps} ref={ref} />);
  await screen.findByTestId('row-2');
  fireEvent.click(screen.getByTestId('row-2'));
  await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/getPacketDetail', { frameNumber: 2 }));
  const detailCalls = apiPost.mock.calls.filter(([path]) => path === '/api/getPacketDetail').length;
  packetRows = packets([3, 1, 2, 4]);
  await act(async () => { await ref.current.loadData(); });
  expect(screen.getByTestId('row-2')).toHaveClass('selected-row');
  expect(screen.getByTestId('row-3')).not.toHaveClass('selected-row');
  expect(apiPost.mock.calls.filter(([path]) => path === '/api/getPacketDetail')).toHaveLength(detailCalls);
});

test('a click while a packet refresh is pending remains selected when the response arrives', async () => {
  const ref = createRef();
  render(<DataPacketPage {...packetProps} ref={ref} />);
  await screen.findByTestId('row-2');
  let finishRefresh;
  apiPost.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
  let refresh;
  act(() => { refresh = ref.current.loadData(); });
  fireEvent.click(screen.getByTestId('row-2'));
  await act(async () => {
    finishRefresh({ data: packets([1, 2, 3, 4]), total: 4 });
    await refresh;
  });
  expect(screen.getByTestId('row-2')).toHaveClass('selected-row');
});

test('packet refresh falls back to the first available row only when the selection disappears', async () => {
  const ref = createRef();
  render(<DataPacketPage {...packetProps} ref={ref} />);
  await screen.findByTestId('row-2');
  fireEvent.click(screen.getByTestId('row-2'));
  packetRows = packets([4, 5]);
  await act(async () => { await ref.current.loadData(); });
  expect(screen.getByTestId('row-4')).toHaveClass('selected-row');
});

test('session list preserves the selected session when its data is replaced', async () => {
  render(<SessionPage match={{ params: { type: 'tcp' } }} />);
  await screen.findByTestId('row-2');
  fireEvent.click(screen.getByTestId('row-2'));
  sessionRows = [{ session_id: 3 }, { session_id: 2 }];
  fireEvent.click(screen.getByText('Next page'));
  await screen.findByTestId('row-3');
  expect(screen.getByTestId('row-2')).toHaveClass('selected-row');
  expect(screen.getByTestId('row-3')).not.toHaveClass('selected-row');
});
