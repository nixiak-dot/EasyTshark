import React, { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DataPacketPage from './DataPacketPage';
import SessionPage from './SessionPage';
import { apiGet, apiPost } from '../Api.ts';
import useContentColumnWidths from './useContentColumnWidths';

jest.mock('../Api.ts', () => ({ apiGet: jest.fn(), apiPost: jest.fn() }));
jest.mock('./useContentColumnWidths', () => ({
  __esModule: true,
  default: jest.fn(() => ({ current: null })),
}));
jest.mock('react-resizable', () => ({ Resizable: ({ children }) => children }));
jest.mock('@arco-design/web-react', () => ({
  Table: ({ data, rowKey, rowClassName, onRow, loading }) => (
    <div data-testid='traffic-table' data-loading={String(Boolean(loading))}>{data.map((record) => (
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
  Tree: ({ treeData }) => <div data-testid='protocol-tree'>{JSON.stringify(treeData)}</div>,
  Input: ({ value, onChange, onPressEnter, placeholder }) => (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => event.key === 'Enter' && onPressEnter()}
    />
  ),
  Button: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
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

test('packet details display nested application-layer fields and repeated answers', async () => {
  const originalImplementation = apiPost.getMockImplementation();
  apiPost.mockImplementation(async (path, ...args) => path === '/api/getPacketDetail'
    ? { data: { proto: [{ name: 'dns', children: [{ name: 'Answers', children: [
      { name: 'dns.a', show: '192.0.2.1', hide: 'yes' },
      { name: 'dns.a', show: '192.0.2.2' },
    ] }] }], hexdata: '00010203' } }
    : originalImplementation(path, ...args));
  render(<DataPacketPage {...packetProps} />);
  await waitFor(() => expect(screen.getByTestId('protocol-tree')).toHaveTextContent('dns.a: 192.0.2.2'));
  const tree = JSON.parse(screen.getByTestId('protocol-tree').textContent);
  expect(tree[0].children[0].children).toHaveLength(2);
  expect(tree[0].children[0].children[0].hide).toBe('yes');
});

test('packet detail failures clear the old tree and display an error', async () => {
  const originalImplementation = apiPost.getMockImplementation();
  apiPost.mockImplementation(async (path, ...args) => path === '/api/getPacketDetail'
    ? { code: '400', msg: 'packet detail analysis failed' }
    : originalImplementation(path, ...args));
  render(<DataPacketPage {...packetProps} />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('无法解析数据包详情'));
  expect(screen.getByTestId('protocol-tree')).toHaveTextContent('[]');
});

test('late detail responses cannot replace the currently selected packet tree', async () => {
  let resolveFirst;
  const originalImplementation = apiPost.getMockImplementation();
  apiPost.mockImplementation((path, payload, ...args) => {
    if (path !== '/api/getPacketDetail') return originalImplementation(path, payload, ...args);
    if (payload.frameNumber === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    return Promise.resolve({ data: { proto: [{ name: 'http', showname: 'Selected HTTP packet' }], hexdata: '' } });
  });
  render(<DataPacketPage {...packetProps} />);
  fireEvent.click(await screen.findByTestId('row-2'));
  await waitFor(() => expect(screen.getByTestId('protocol-tree')).toHaveTextContent('Selected HTTP packet'));
  await act(async () => resolveFirst({ data: { proto: [{ name: 'dns', showname: 'Old DNS packet' }], hexdata: '' } }));
  expect(screen.getByTestId('protocol-tree')).toHaveTextContent('Selected HTTP packet');
  expect(screen.getByTestId('protocol-tree')).not.toHaveTextContent('Old DNS packet');
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

test('packet background polling stays silent, reuses unchanged rows, and waits for pending requests', async () => {
  jest.useFakeTimers();
  apiGet.mockResolvedValue({ code: 200, data: { status: 2 } });
  render(<DataPacketPage {...packetProps} />);
  await act(async () => {});
  const initialRows = useContentColumnWidths.mock.calls.at(-1)[0];
  let finishRefresh;
  apiPost.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByTestId('traffic-table')).toHaveAttribute('data-loading', 'false');
  const requestCount = apiPost.mock.calls.filter(([path]) => path === '/api/queryPacket').length;
  await act(async () => { jest.advanceTimersByTime(9000); });
  expect(apiPost.mock.calls.filter(([path]) => path === '/api/queryPacket')).toHaveLength(requestCount);
  await act(async () => { finishRefresh({ data: packets([1, 2, 3]), total: 3 }); });
  expect(useContentColumnWidths.mock.calls.at(-1)[0]).toBe(initialRows);
});

test('packet polling uses the current page after pagination changes', async () => {
  jest.useFakeTimers();
  apiGet.mockResolvedValue({ code: '200', data: { status: 2 } });
  render(<DataPacketPage {...packetProps} />);
  await act(async () => {});
  fireEvent.click(screen.getByText('Next page'));
  await act(async () => {});
  const requestCount = apiPost.mock.calls.filter(([path]) => path === '/api/queryPacket').length;
  await act(async () => { jest.advanceTimersByTime(3000); });
  const queries = apiPost.mock.calls.filter(([path]) => path === '/api/queryPacket');
  expect(queries).toHaveLength(requestCount + 1);
  expect(queries.at(-1)[1].pageNum).toBe(2);
});

test('late packet page responses cannot replace the latest page', async () => {
  let finishFirstPage;
  const originalImplementation = apiPost.getMockImplementation();
  apiPost.mockImplementation((path, payload) => {
    if (path !== '/api/queryPacket') return originalImplementation(path, payload);
    if (payload.pageNum === 1) return new Promise((resolve) => { finishFirstPage = resolve; });
    return Promise.resolve({ data: packets([31, 32]), total: 32 });
  });
  render(<DataPacketPage {...packetProps} />);
  fireEvent.click(screen.getByText('Next page'));
  await screen.findByTestId('row-31');
  await act(async () => { finishFirstPage({ data: packets([1, 2]), total: 32 }); });
  expect(screen.getByTestId('row-31')).toBeInTheDocument();
  expect(screen.queryByTestId('row-1')).not.toBeInTheDocument();
});

test('duplicate packet queries share a request and failures release loading for retry', async () => {
  const ref = createRef();
  const logError = jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<DataPacketPage {...packetProps} ref={ref} />);
  await screen.findByTestId('row-1');
  let failRefresh;
  apiPost.mockImplementationOnce(() => new Promise((resolve, reject) => { failRefresh = reject; }));
  const requestCount = apiPost.mock.calls.filter(([path]) => path === '/api/queryPacket').length;
  let firstRefresh;
  let secondRefresh;
  act(() => {
    firstRefresh = ref.current.loadData();
    secondRefresh = ref.current.loadData();
  });
  expect(firstRefresh).toBe(secondRefresh);
  expect(apiPost.mock.calls.filter(([path]) => path === '/api/queryPacket')).toHaveLength(requestCount + 1);
  await act(async () => { failRefresh(new Error('network error')); await firstRefresh; });
  expect(screen.getByTestId('traffic-table')).toHaveAttribute('data-loading', 'false');
  expect(screen.getByRole('alert')).toHaveTextContent('数据包列表加载失败');
  await act(async () => { await ref.current.loadData(); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(logError).toHaveBeenCalled();
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

test('session polling updates rows without resetting selection and stops after unmount', async () => {
  jest.useFakeTimers();
  let view;
  await act(async () => { view = render(<SessionPage match={{ params: { type: 'all' } }} />); });
  fireEvent.click(screen.getByTestId('row-2'));
  sessionRows = [{ session_id: 2 }, { session_id: 3 }];
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(screen.getByTestId('row-3')).toBeInTheDocument();
  expect(screen.getByTestId('row-2')).toHaveClass('selected-row');
  expect(screen.getByTestId('traffic-table')).toHaveAttribute('data-loading', 'false');
  const requests = apiPost.mock.calls.length;
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(apiPost).toHaveBeenCalledTimes(requests);
});

test('session polling waits for a slow request before scheduling another', async () => {
  jest.useFakeTimers();
  let finishRequest;
  apiPost.mockImplementationOnce(() => new Promise((resolve) => { finishRequest = resolve; }));
  await act(async () => { render(<SessionPage match={{ params: { type: 'all' } }} />); });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(apiPost).toHaveBeenCalledTimes(1);
  await act(async () => { finishRequest({ data: sessionRows, total: 2 }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apiPost).toHaveBeenCalledTimes(2);
});

test('session polling retries after a failed request', async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  apiPost.mockRejectedValueOnce(new Error('Network error'));
  await act(async () => { render(<SessionPage match={{ params: { type: 'all' } }} />); });
  expect(screen.getByTestId('traffic-table')).toHaveAttribute('data-loading', 'false');
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apiPost).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('row-2')).toBeInTheDocument();
});

test('session polling retains the current page and submitted filter', async () => {
  jest.useFakeTimers();
  await act(async () => { render(<SessionPage match={{ params: { type: 'all' } }} />); });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'proto=TCP' } });
  await act(async () => { fireEvent.click(screen.getByText('筛选')); });
  await act(async () => { fireEvent.click(screen.getByText('Next page')); });
  apiPost.mockClear();
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apiPost).toHaveBeenCalledTimes(1);
  expect(apiPost).toHaveBeenCalledWith('/api/getSessionList', {
    pageSize: 30, pageNum: 2, filterExpression: 'proto=TCP',
  });
});

test('session polling ignores a stale response after the filter changes', async () => {
  jest.useFakeTimers();
  let finishOldRequest;
  apiPost.mockImplementationOnce(() => new Promise((resolve) => { finishOldRequest = resolve; }));
  await act(async () => { render(<SessionPage match={{ params: { type: 'all' } }} />); });
  sessionRows = [{ session_id: 3 }];
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'proto=TCP' } });
  await act(async () => { fireEvent.click(screen.getByText('筛选')); });
  await act(async () => { finishOldRequest({ data: [{ session_id: 9 }], total: 1 }); });
  expect(screen.getByTestId('row-3')).toBeInTheDocument();
  expect(screen.queryByTestId('row-9')).not.toBeInTheDocument();
  apiPost.mockClear();
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apiPost).toHaveBeenCalledTimes(1);
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

test('all packets submit a protocol and endpoint filter expression', async () => {
  render(<DataPacketPage {...packetProps} />);
  await screen.findByTestId('row-1');

  const expression = 'src.ip=192.0.2.1 && dst.port=443 && proto=TCP';
  fireEvent.change(screen.getByRole('textbox'), { target: { value: expression } });
  fireEvent.click(screen.getByText('筛选'));

  await waitFor(() => {
    const requests = apiPost.mock.calls.filter(([path]) => path === '/api/queryPacket');
    expect(requests[requests.length - 1]).toEqual([
      '/api/queryPacket',
      { pageSize: 30, pageNum: 1, session_id: 0, filterExpression: expression },
    ]);
  });
});

test('all sessions accept simple protocol or IP keywords', async () => {
  render(<SessionPage match={{ params: { type: 'all' } }} />);
  await screen.findByTestId('row-1');

  fireEvent.change(screen.getByRole('textbox'), { target: { value: '192.0.2.1' } });
  fireEvent.click(screen.getByText('筛选'));

  await waitFor(() => {
    const requests = apiPost.mock.calls.filter(([path]) => path === '/api/getSessionList');
    expect(requests[requests.length - 1]).toEqual([
      '/api/getSessionList',
      { pageSize: 30, pageNum: 1, filterExpression: '192.0.2.1' },
    ]);
  });
});

test('all sessions submit grouped AND/OR filter expressions unchanged', async () => {
  render(<SessionPage match={{ params: {} }} />);
  await screen.findByTestId('row-1');

  expect(screen.getByRole('textbox')).toBeInTheDocument();
  const expression = '(src.ip=192.0.2.1 && src.port=53) || (dst.ip=198.51.100.2 && proto=DNS)';
  fireEvent.change(screen.getByRole('textbox'), { target: { value: expression } });
  fireEvent.click(screen.getByText('筛选'));

  await waitFor(() => {
    const requests = apiPost.mock.calls.filter(([path]) => path === '/api/getSessionList');
    expect(requests[requests.length - 1]).toEqual([
      '/api/getSessionList',
      { pageSize: 30, pageNum: 1, filterExpression: expression },
    ]);
  });
});
