import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SessionAgent from './SessionAgent';

beforeEach(() => {
  window.electronAPI = {
    agentSettings: jest.fn().mockResolvedValue({ baseUrl: 'https://example.com/v1', model: 'test-model', hasKey: true }),
    agentChat: jest.fn().mockResolvedValue({ ok: true, answer: '当前证据不足以确认重传。',
      coverage: { loaded: 2, total: 2, partial: false }, actions: ['查看 #10 协议字段'], usageTokens: 120 }),
    agentCancel: jest.fn().mockResolvedValue(undefined),
  };
});
afterEach(() => { delete window.electronAPI; jest.restoreAllMocks(); });

async function ask(text = '是否发生重传？') {
  await waitFor(() => expect(window.electronAPI.agentSettings).toHaveBeenCalled());
  fireEvent.change(screen.getByRole('textbox', { name: '向会话助手提问' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
}

test('free-form questions trigger one-time confirmation without preset task buttons', async () => {
  render(<SessionAgent sessionId='7' />);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '排查故障' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '分析网络过程' })).not.toBeInTheDocument();
  await ask();
  await screen.findByText('确认发送网络证据');
  expect(window.electronAPI.agentChat).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '暂不发送' }));
  expect(window.electronAPI.agentChat).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: '向会话助手提问' })).toHaveValue('是否发生重传？');
  await waitFor(() => expect(screen.queryByText('确认发送网络证据')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  fireEvent.click(await screen.findByRole('button', { name: '同意并发送' }));
  await screen.findByText('当前证据不足以确认重传。');
  expect(window.electronAPI.agentChat).toHaveBeenCalledWith({ sessionId: 7, text: '是否发生重传？', reset: true,
    provider: { baseUrl: 'https://example.com/v1', model: 'test-model' } });
  fireEvent.change(screen.getByRole('textbox', { name: '向会话助手提问' }), { target: { value: '只解释重传的含义' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  await waitFor(() => expect(window.electronAPI.agentChat).toHaveBeenCalledTimes(2));
  expect(window.electronAPI.agentChat).toHaveBeenLastCalledWith(expect.objectContaining({ text: '只解释重传的含义', reset: false }));
});

test('pending analysis can be canceled and the failed question is restored', async () => {
  let finish;
  window.electronAPI.agentChat.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<SessionAgent sessionId='7' />);
  await ask();
  fireEvent.click(await screen.findByRole('button', { name: '同意并发送' }));
  fireEvent.click(await screen.findByRole('button', { name: '停止' }));
  expect(window.electronAPI.agentCancel).toHaveBeenCalled();
  await act(async () => finish({ ok: false, error: '分析已停止或超时，请重试。' }));
  expect(screen.getByRole('alert')).toHaveTextContent('分析已停止或超时');
  expect(screen.getByRole('textbox', { name: '向会话助手提问' })).toHaveValue('是否发生重传？');
});

test('configuration changes require renewed confirmation and never persist keys in browser storage', async () => {
  const storageSpy = jest.spyOn(Storage.prototype, 'setItem');
  render(<SessionAgent sessionId='7' />);
  await waitFor(() => expect(window.electronAPI.agentSettings).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: '模型配置' }));
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-secret' } });
  fireEvent.click(screen.getByRole('button', { name: '应用模型配置' }));
  await waitFor(() => expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument());
  expect(window.electronAPI.agentSettings).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: 'test-secret' }));
  await ask('解释当前连接状态');
  expect(await screen.findByText('确认发送网络证据')).toBeInTheDocument();
  expect(storageSpy).not.toHaveBeenCalled();
});

test('browser page uses local developer Agent service without an Electron requirement', async () => {
  delete window.electronAPI;
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ baseUrl: 'https://example.com/v1', model: 'test-model' }) });
  const originalCrypto = window.crypto;
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => '12345678-1234-1234-1234-123456789012' } });
  try {
    const view = render(<SessionAgent sessionId='7' />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/__session-agent/settings', expect.objectContaining({ method: 'POST' })));
    expect(screen.getByRole('textbox', { name: '向会话助手提问' })).toBeInTheDocument();
    expect(screen.queryByText(/请在 Electron 桌面版中使用/)).not.toBeInTheDocument();
    view.unmount();
    await act(async () => {});
  } finally {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'crypto', { configurable: true, value: originalCrypto });
  }
});
