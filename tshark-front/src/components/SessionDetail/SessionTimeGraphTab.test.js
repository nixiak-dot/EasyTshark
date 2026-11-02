import React from 'react';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SessionTimeGraphTab from './SessionTimeGraphTab';
import { apiPost } from '../../Api.ts';
import { MemoryRouter } from 'react-router-dom';
import SessionDetailPage from './SessionDetailPage';

const mockSelectPacket = jest.fn();
jest.mock('../../Api.ts', () => ({ apiPost: jest.fn() }));
jest.mock('../DataPacketPage', () => {
  const React = require('react');
  return React.forwardRef(({ filterExpression, match }, ref) => {
    React.useImperativeHandle(ref, () => ({ setCurrentRowId: mockSelectPacket }));
    return <div data-testid='packet-list' data-session={match.params.sessionId}>{filterExpression}</div>;
  });
});

const packets = [
  { frame_number: 41, timestamp: 1, src_ip: '192.0.2.1', src_port: 50000, dst_port: 443, protocol: 'TCP', len: 66, info: '[SYN] Seq=0' },
  { frame_number: 52, timestamp: 1.25, src_ip: '198.51.100.2', src_port: 443, dst_port: 50000, protocol: 'HTTPS', len: 1400, info: 'Application Data' },
];

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('row7', JSON.stringify({
    session_id: 7,
    ip1: '192.0.2.1', ip1_port: 50000, ip1_location: '端点一归属地',
    ip2: '198.51.100.2', ip2_port: 443, ip2_location: '端点二归属地',
    trans_proto: 'TCP', app_proto: 'HTTPS',
  }));
  apiPost.mockResolvedValue({ code: '200', data: packets, total: 2 });
});

afterEach(() => localStorage.clear());

test('compact Arco cards preserve packet fields, actual protocols and directional borders without flow decorations', async () => {
  render(<SessionTimeGraphTab sessionId='7' />);
  const tcp = await screen.findByRole('button', { name: '数据包 41，TCP，66 字节' });
  const https = screen.getByRole('button', { name: '数据包 52，HTTPS，1400 字节' });
  expect(tcp).toHaveClass('arco-card', 'is-forward', 'is-selected');
  expect(tcp).toHaveTextContent('[SYN] Seq=0');
  expect(tcp.querySelector('.session-packet-flow')).not.toBeInTheDocument();
  expect(tcp).not.toHaveTextContent('端点一 → 端点二');
  expect(tcp).not.toHaveTextContent('50000 → 443');
  expect(tcp.querySelector('svg')).not.toBeInTheDocument();
  expect(within(tcp).queryByText('HTTPS')).not.toBeInTheDocument();
  expect(https).toHaveClass('is-backward');
  expect(https).toHaveTextContent('应用层协议');
  expect(https.querySelector('.session-time-offset')).not.toBeInTheDocument();
  expect(https).not.toHaveTextContent('+0.250000 s');
  expect(https).toHaveTextContent('Application Data');
  expect(screen.getAllByText('192.0.2.1:50000')[0]).toBeInTheDocument();
  expect(screen.getAllByText('198.51.100.2:443')[0]).toBeInTheDocument();

  fireEvent.click(https);
  expect(mockSelectPacket).toHaveBeenLastCalledWith(52, 1);
  expect(https).toHaveAttribute('aria-pressed', 'true');
  expect(tcp).not.toHaveClass('is-selected');
  expect(https).toHaveClass('is-selected', 'is-backward');
  fireEvent.keyDown(tcp, { key: 'Enter' });
  expect(mockSelectPacket).toHaveBeenLastCalledWith(41, 0);
});

test('compact timeline retains full long info text in a shared intrinsic-width row container', async () => {
  const longInfo = 'Application Data ' + 'encrypted-payload '.repeat(40);
  apiPost.mockResolvedValue({ code: '200', data: [packets[0], { ...packets[1], info: longInfo }], total: 2 });
  const { container } = render(<SessionTimeGraphTab sessionId='7' />);
  const https = await screen.findByRole('button', { name: '数据包 52，HTTPS，1400 字节' });
  const rows = container.querySelector('.session-timeline-packets');
  expect(rows.children).toHaveLength(3);
  expect(rows.firstElementChild).toHaveClass('session-summary');
  expect(https.parentElement).toBe(rows);
  expect(https.querySelector('.session-packet-info').textContent).toBe(longInfo);
  expect(https.querySelector('.arco-ellipsis')).not.toBeInTheDocument();
  expect(container.querySelector('.session-time-offset')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '会话概览' })).not.toBeInTheDocument();
  expect(screen.getByText('SESSION / 7')).toBeInTheDocument();
});

test('visiting the data stream preserves session endpoints across packet selection and a page remount', async () => {
  const storedSession = localStorage.getItem('row7');
  apiPost.mockImplementation(async (path) => path === '/api/getSessionDataStream'
    ? { code: 200, data: [], count: { node0: '192.0.2.1:50000', node1: '198.51.100.2:443' } }
    : { code: '200', data: packets, total: 2 });
  const page = () => (
    <React.StrictMode>
      <MemoryRouter initialEntries={['/detail?sessionId=7']}><SessionDetailPage /></MemoryRouter>
    </React.StrictMode>
  );
  const view = render(page());
  await screen.findByRole('button', { name: '数据包 41，TCP，66 字节' });
  for (let visit = 0; visit < 2; visit += 1) {
    fireEvent.click(screen.getByRole('tab', { name: '会话数据流' }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/getSessionDataStream', { session_id: 7 }));
    fireEvent.click(screen.getByRole('tab', { name: '会话时序图' }));
    fireEvent.click(await screen.findByRole('button', { name: '数据包 52，HTTPS，1400 字节' }));
    expect(localStorage.getItem('row7')).toBe(storedSession);
    expect(screen.getAllByText('192.0.2.1:50000')[0]).toBeInTheDocument();
    expect(screen.getAllByText('198.51.100.2:443')[0]).toBeInTheDocument();
    expect(screen.queryByText('未知地址')).not.toBeInTheDocument();
  }
  view.unmount();
  expect(localStorage.getItem('row7')).toBe(storedSession);
  render(page());
  await screen.findByRole('button', { name: '数据包 41，TCP，66 字节' });
  expect(screen.getAllByText('192.0.2.1:50000')[0]).toBeInTheDocument();
  expect(screen.getAllByText('198.51.100.2:443')[0]).toBeInTheDocument();
});

test('the shared filter precedes both columns and the summary is the first row inside the session timeline', async () => {
  const { container } = render(<SessionTimeGraphTab sessionId='7' />);
  await screen.findByRole('button', { name: '数据包 41，TCP，66 字节' });
  const layout = container.querySelector('.session-detail-layout');
  const leftColumn = container.querySelector('.session-timeline-column');
  expect(layout.previousElementSibling).toHaveClass('traffic-filter-bar');
  expect(leftColumn.parentElement.parentElement).toBe(layout);
  expect(leftColumn.children).toHaveLength(1);
  expect(leftColumn.lastElementChild).toHaveClass('session-timeline-panel');
  const rows = leftColumn.querySelector('.session-timeline-packets');
  expect(rows.firstElementChild).toHaveClass('session-summary');
  expect(rows.children[1]).toHaveClass('session-packet-card');
  expect(rows.closest('.session-timeline-panel')).toBe(leftColumn.firstElementChild);
  expect(screen.getByRole('heading', { name: '会话时序' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '数据包时序' })).not.toBeInTheDocument();
  expect(layout.lastElementChild.firstElementChild).toHaveClass('session-packet-detail');
  const panels = layout.querySelectorAll('.session-panel');
  expect(panels).toHaveLength(2);
  panels.forEach((panel) => {
    expect(panel).toHaveClass('arco-card');
    expect(panel.firstElementChild).toHaveClass('arco-card-body');
    expect(panel.firstElementChild.firstElementChild).toHaveClass('session-panel-heading');
  });
  expect(within(panels[0].firstElementChild.firstElementChild).getByRole('heading', { name: '会话时序' })).toBeInTheDocument();
  expect(within(panels[1].firstElementChild.firstElementChild).getByRole('heading', { name: '数据包列表与解析' })).toBeInTheDocument();
  expect(panels[1]).toContainElement(screen.getByTestId('packet-list'));
  const arrows = screen.getByRole('img', { name: '蓝色：端点一到端点二；绿色：端点二到端点一' });
  expect(arrows.children[0]).toHaveClass('is-forward');
  expect(arrows.children[1]).toHaveClass('is-backward');
  expect(screen.queryByText('同一筛选条件同时作用于时序图与数据包列表 · 点击时序卡片定位原始数据包')).not.toBeInTheDocument();
  expect(screen.queryByText('按原始顺序展示 · 时间相对当前结果首包')).not.toBeInTheDocument();
});

test('the Arco split resizes both panes, clamps the ratio and resets without querying packets again', async () => {
  const { container } = render(<SessionTimeGraphTab sessionId='7' />);
  await screen.findByRole('button', { name: '数据包 41，TCP，66 字节' });
  const layout = container.querySelector('.session-detail-layout');
  Object.defineProperty(layout, 'offsetWidth', { configurable: true, value: 1000 });
  const separator = screen.getByRole('separator', { name: '调整会话时序与数据包列表宽度' });
  const drag = (start, end) => {
    const down = createEvent.mouseDown(separator, { clientX: start });
    Object.defineProperty(down, 'pageX', { value: start });
    fireEvent(separator, down);
    const move = createEvent.mouseMove(window, { clientX: end });
    Object.defineProperty(move, 'pageX', { value: end });
    fireEvent(window, move);
    fireEvent.mouseUp(window);
  };
  const requests = apiPost.mock.calls.length;
  expect(separator).toHaveAttribute('aria-valuenow', '50');
  drag(500, 300);
  expect(separator).toHaveAttribute('aria-valuenow', '30');
  expect(layout.firstElementChild.style.flexBasis).toContain('30%');
  drag(300, 0);
  expect(separator).toHaveAttribute('aria-valuenow', '25');
  drag(0, 2000);
  expect(separator).toHaveAttribute('aria-valuenow', '75');
  fireEvent.doubleClick(separator);
  expect(separator).toHaveAttribute('aria-valuenow', '50');
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(separator).toHaveAttribute('aria-valuenow', '48');
  fireEvent.keyDown(separator, { key: 'Home' });
  expect(separator).toHaveAttribute('aria-valuenow', '50');
  expect(apiPost.mock.calls).toHaveLength(requests);
});

test('one shared filter submits existing syntax to both views and clears it', async () => {
  render(<SessionTimeGraphTab sessionId='7' />);
  await screen.findByRole('button', { name: '数据包 41，TCP，66 字节' });
  const expression = '(proto=TCP || proto=HTTPS) && dst.port=443';
  fireEvent.change(screen.getByRole('textbox'), { target: { value: ` ${expression} ` } });
  expect(apiPost).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', keyCode: 13 });
  await waitFor(() => expect(apiPost).toHaveBeenLastCalledWith('/api/queryPacket', {
    pageSize: 100, pageNum: 1, session_id: 7, filterExpression: expression,
  }));
  expect(screen.getByTestId('packet-list')).toHaveTextContent(expression);
  fireEvent.click(screen.getByRole('button', { name: '清除' }));
  await waitFor(() => expect(apiPost).toHaveBeenLastCalledWith('/api/queryPacket', {
    pageSize: 100, pageNum: 1, session_id: 7, filterExpression: '',
  }));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByTestId('packet-list')).toBeEmptyDOMElement();
});

test('late unfiltered responses cannot replace filtered results', async () => {
  let resolveOriginal;
  apiPost.mockImplementationOnce(() => new Promise((resolve) => { resolveOriginal = resolve; }));
  apiPost.mockResolvedValue({ data: [packets[1]], total: 1 });
  render(<SessionTimeGraphTab sessionId='7' />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'HTTPS' } });
  fireEvent.click(screen.getByRole('button', { name: '筛选' }));
  await screen.findByRole('button', { name: '数据包 52，HTTPS，1400 字节' });
  await act(async () => resolveOriginal({ data: packets, total: 2 }));
  expect(screen.queryByRole('button', { name: '数据包 41，TCP，66 字节' })).not.toBeInTheDocument();
});

test('empty results and API errors have explicit states', async () => {
  apiPost.mockResolvedValueOnce({ data: [], total: 0 });
  render(<SessionTimeGraphTab sessionId='7' />);
  await screen.findByText('没有符合条件的数据包');
  expect(screen.getByLabelText('会话时序').querySelector('.session-timeline-packets').firstElementChild).toHaveClass('session-summary');
  apiPost.mockResolvedValueOnce({ code: '400', msg: '筛选表达式无效' });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad=filter' } });
  fireEvent.click(screen.getByRole('button', { name: '筛选' }));
  await screen.findByText('筛选表达式无效');
});

test('missing session metadata does not crash the detail view', async () => {
  localStorage.setItem('row7', 'invalid json');
  render(<SessionTimeGraphTab sessionId='7' />);
  await screen.findByRole('button', { name: '数据包 41，TCP，66 字节' });
  expect(new Set(screen.getAllByText('未知地址').map((element) => element.closest('.session-endpoint'))).size).toBe(2);
});
