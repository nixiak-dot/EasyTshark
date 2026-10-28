import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Capture from './Capture';
import { apiGet, apiPost } from '../../Api.ts';

jest.mock('../../Api.ts', () => ({ apiGet: jest.fn(), apiPost: jest.fn() }));
jest.mock('./LineChart.js', () => () => null);

const adapters = [
  { name: 'Wi-Fi', remark: 'Wireless', selected: false },
  { name: 'Ethernet', remark: 'Wired', selected: true },
];

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
});

test('starts only persisted adapters, saves added adapters, and refreshes selected trends', async () => {
  apiGet.mockImplementation(async (path) => {
    if (path === '/api/getNetworkAdapters') return { code: '200', data: { adapters } };
    if (path.startsWith('/api/startMonitorAdapterFlowTrend')) return { code: '200' };
    if (path === '/api/stopMonitorAdapterFlowTrend') return { code: '200' };
    if (path === '/api/getAdapterFlowTrendData') return { code: '200', data: { Ethernet: [] } };
    throw new Error(`Unexpected GET ${path}`);
  });
  apiPost.mockResolvedValue({ code: '200' });

  const { unmount, container } = render(<Capture />);
  expect(await screen.findByRole('button', { name: '\u6293\u5305' })).toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/startMonitorAdapterFlowTrend?adapterName=Ethernet'));
  expect(apiGet).not.toHaveBeenCalledWith('/api/startMonitorAdapterFlowTrend?adapterName=Wi-Fi');

  const adapterNames = Array.from(container.querySelectorAll('[data-adapter-name]')).map((row) => row.dataset.adapterName);
  expect(adapterNames).toEqual(['Ethernet', 'Wi-Fi']);
  const selectedRow = container.querySelector('[data-adapter-name="Ethernet"]');
  const unselectedRow = container.querySelector('[data-adapter-name="Wi-Fi"]');
  expect(selectedRow).toHaveClass('adapter-trend-row', 'adapter-trend-row-selected');
  expect(unselectedRow).toHaveClass('adapter-trend-row');
  expect(unselectedRow).not.toHaveClass('adapter-trend-row-selected');
  expect(selectedRow.querySelector('button')).toHaveAttribute('title', '在 Ethernet 上抓包');
  expect(unselectedRow.querySelector('button')).toHaveAttribute('title', '将 Wi-Fi 加入趋势监听');

  fireEvent.click(screen.getByRole('button', { name: 'Add Wi-Fi to trend monitoring' }));
  await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/settings/trendAdapters', { adapterNames: ['Ethernet', 'Wi-Fi'] }));
  await screen.findByRole('button', { name: '\u6293\u5305' });
  expect(apiGet).not.toHaveBeenCalledWith('/api/startMonitorAdapterFlowTrend?adapterName=Wi-Fi');

  fireEvent.click(screen.getByRole('button', { name: 'Refresh trends' }));
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/startMonitorAdapterFlowTrend?adapterName=Wi-Fi'));
  expect(apiGet).toHaveBeenCalledWith('/api/stopMonitorAdapterFlowTrend');
  expect(apiGet).toHaveBeenCalledWith('/api/getAdapterFlowTrendData');

  const stopCallsBeforeUnmount = apiGet.mock.calls.filter(([path]) => path === '/api/stopMonitorAdapterFlowTrend').length;
  unmount();
  await waitFor(() => expect(apiGet.mock.calls.filter(([path]) => path === '/api/stopMonitorAdapterFlowTrend').length)
    .toBe(stopCallsBeforeUnmount + 1));
});

test('does not poll for trends when no adapters are selected', async () => {
  jest.useFakeTimers();
  apiGet.mockImplementation(async (path) => {
    if (path === '/api/getNetworkAdapters') return { code: '200', data: { adapters: [{ name: 'Wi-Fi', selected: false }] } };
    if (path === '/api/getAdapterFlowTrendData') return { code: '200', data: {} };
    return { code: '200' };
  });
  const { unmount } = render(<Capture />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  const callsBeforeTimers = apiGet.mock.calls.filter(([path]) => path === '/api/getAdapterFlowTrendData').length;
  act(() => jest.advanceTimersByTime(3000));
  expect(apiGet.mock.calls.filter(([path]) => path === '/api/getAdapterFlowTrendData')).toHaveLength(callsBeforeTimers);
  unmount();
});

test('ignores stale StrictMode cleanup after trend monitoring remounts', async () => {
  apiGet.mockImplementation(async (path) => {
    if (path === '/api/getNetworkAdapters') return { code: '200', data: { adapters } };
    if (path.startsWith('/api/startMonitorAdapterFlowTrend')) return { code: '200' };
    if (path === '/api/stopMonitorAdapterFlowTrend') return { code: '200' };
    if (path === '/api/getAdapterFlowTrendData') return { code: '200', data: { Ethernet: [] } };
    throw new Error(`Unexpected GET ${path}`);
  });

  const { unmount } = render(<React.StrictMode><Capture /></React.StrictMode>);
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/startMonitorAdapterFlowTrend?adapterName=Ethernet'));
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/getAdapterFlowTrendData'));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

  expect(apiGet).not.toHaveBeenCalledWith('/api/stopMonitorAdapterFlowTrend');
  unmount();
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/stopMonitorAdapterFlowTrend'));
});
