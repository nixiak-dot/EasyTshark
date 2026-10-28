import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Settings, { SettingsPanel, suggestedSettingsPath } from './Settings';
import { apiGet, apiPost } from '../Api.ts';

jest.mock('../Api.ts', () => ({ apiGet: jest.fn(), apiPost: jest.fn() }));

const values = {
  tsharkPath: 'D:\\Wireshark\\tshark.exe', editcapPath: 'D:\\Wireshark\\editcap.exe',
  pcapDirectory: 'D:\\captures', tlsKeyLogPath: '',
};
const settings = { values, configured: true, configPath: 'D:\\project\\config\\settings.json', errors: [] };
const success = (data) => ({ code: '200', data });

beforeEach(() => {
  apiGet.mockResolvedValue(success(settings));
  apiPost.mockResolvedValue(success(settings));
});

afterEach(() => {
  jest.resetAllMocks();
  delete window.electronAPI;
});

test('missing settings require configuration before mounting capture screens', async () => {
  apiGet.mockResolvedValue(success({ ...settings, configured: false }));
  render(<Settings><div>Capture screen</div></Settings>);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.queryByText('Capture screen')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: /抓包保存目录/ }), { target: { value: 'D:\\new captures' } });
  fireEvent.change(screen.getByRole('textbox', { name: /TLS 密钥日志文件/ }), { target: { value: 'D:\\keys\\tls.log' } });
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  expect(await screen.findByText('Capture screen')).toBeInTheDocument();
  expect(apiPost).toHaveBeenCalledWith('/api/settings', {
    ...values, pcapDirectory: 'D:\\new captures', tlsKeyLogPath: 'D:\\keys\\tls.log',
  });
});

test('valid persisted settings bypass the setup dialog', async () => {
  render(<Settings><div>Capture screen</div></Settings>);
  expect(await screen.findByText('Capture screen')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('opening settings stops preview monitoring but does not start decryption', async () => {
  apiGet.mockImplementation(async (path) => path === '/api/getWorkStatus'
    ? success({ status: 3 }) : path === '/api/stopMonitorAdapterFlowTrend'
      ? { code: '200' } : success(settings));
  render(<Settings><div>Capture screen</div></Settings>);
  await screen.findByText('Capture screen');
  fireEvent.click(screen.getByRole('button', { name: '路径设置' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/stopMonitorAdapterFlowTrend'));
  await waitFor(() => expect(screen.getByRole('button', { name: '保存设置' })).not.toBeDisabled());
  expect(screen.getByText(/不会设置 SSLKEYLOGFILE/)).toBeInTheDocument();
  expect(apiPost).not.toHaveBeenCalled();
});

test('validation or busy errors remain visible without closing the dialog', async () => {
  apiPost.mockResolvedValue({ code: '400', msg: '请先停止抓包' });
  const onSaved = jest.fn();
  render(<SettingsPanel settings={settings} required={false} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('请先停止抓包');
  expect(onSaved).not.toHaveBeenCalled();
});

test('native path selection updates only the selected field', async () => {
  window.electronAPI = { selectSettingsPath: jest.fn().mockResolvedValue('E:\\抓包目录') };
  render(<SettingsPanel settings={settings} required={true} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '浏览抓包保存目录' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: /抓包保存目录/ })).toHaveValue('E:\\抓包目录'));
  expect(screen.getByRole('textbox', { name: /TShark 可执行文件/ })).toHaveValue(values.tsharkPath);
});

test('backend connection errors block capture screens and can be retried', async () => {
  apiGet.mockRejectedValueOnce(new Error('无法连接后端'));
  render(<Settings><div>Capture screen</div></Settings>);
  expect(await screen.findByRole('alert')).toHaveTextContent('无法连接后端');
  expect(screen.queryByText('Capture screen')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('Capture screen')).toBeInTheDocument();
});

test('browser users can open the local system picker without an Electron bridge', async () => {
  apiPost.mockResolvedValue({ code: '200', data: { path: 'E:\\抓包 目录', canceled: false } });
  render(<SettingsPanel settings={settings} required={true} onSaved={jest.fn()} />);
  expect(screen.getAllByRole('button', { name: /^浏览/ })).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: '浏览抓包保存目录' }));
  expect(await screen.findByRole('status')).toHaveTextContent('正在等待系统窗口选择');
  await waitFor(() => expect(screen.getByRole('textbox', { name: /抓包保存目录/ })).toHaveValue('E:\\抓包 目录'));
  expect(apiPost).toHaveBeenCalledWith('/api/settings/selectPath', { field: 'pcapDirectory', currentPath: values.pcapDirectory });
});

test('canceling the system picker preserves existing paths', async () => {
  apiPost.mockResolvedValue({ code: '200', data: { path: '', canceled: true } });
  render(<SettingsPanel settings={settings} required={true} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '浏览抓包保存目录' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '保存设置' })).not.toBeDisabled());
  expect(screen.getByRole('textbox', { name: /抓包保存目录/ })).toHaveValue(values.pcapDirectory);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('picker errors leave paths editable and show a helpful message', async () => {
  apiPost.mockResolvedValue({ code: '400', msg: '已有路径选择窗口打开' });
  render(<SettingsPanel settings={settings} required={true} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '浏览抓包保存目录' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('已有路径选择窗口打开');
  expect(screen.getByRole('textbox', { name: /抓包保存目录/ })).not.toBeDisabled();
});

test('opening a picker blocks save until the selection completes', async () => {
  let resolveSelection;
  window.electronAPI = { selectSettingsPath: jest.fn().mockImplementation(() => new Promise((resolve) => { resolveSelection = resolve; })) };
  render(<SettingsPanel settings={settings} required={false} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '浏览抓包保存目录' }));
  expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '关闭设置' })).toBeDisabled();
  resolveSelection(null);
  await waitFor(() => expect(screen.getByRole('button', { name: '保存设置' })).not.toBeDisabled());
});

test('picker starting locations reuse the other tool directory and capture directory', () => {
  expect(suggestedSettingsPath('editcapPath', { tsharkPath: 'C:\\Program Files\\Wireshark\\tshark.exe' }))
    .toBe('C:\\Program Files\\Wireshark\\editcap.exe');
  expect(suggestedSettingsPath('tsharkPath', { editcapPath: 'D:/Wireshark/editcap.exe' })).toBe('D:/Wireshark/tshark.exe');
  expect(suggestedSettingsPath('tlsKeyLogPath', values)).toBe('D:\\captures/tls-keys.log');
  expect(suggestedSettingsPath('pcapDirectory', values)).toBe(values.pcapDirectory);
});
