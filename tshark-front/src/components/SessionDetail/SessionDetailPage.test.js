import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionDetailPage from './SessionDetailPage';

jest.mock('./SessionTimeGraphTab', () => () => <div>时序图内容</div>);
jest.mock('./SessionDataStreamTab', () => () => <div>数据流内容</div>);
jest.mock('./SessionAgent', () => {
  const React = require('react');
  return function MockAgent() {
    const [question, setQuestion] = React.useState('');
    return <input aria-label='助手问题' value={question} onChange={(event) => setQuestion(event.target.value)} />;
  };
});

test.each(['会话时序图', '会话数据流'])('assistant opens from %s without switching tabs and retains its draft', async (tabName) => {
  render(<MemoryRouter initialEntries={['/detail?sessionId=7']}><SessionDetailPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: tabName }));
  const activeTab = screen.getByRole('tab', { name: tabName });
  expect(screen.queryByLabelText('助手问题')).not.toBeInTheDocument();
  const content = screen.getByText(tabName === '会话时序图' ? '时序图内容' : '数据流内容');
  fireEvent.click(screen.getByRole('tab', { name: '会话分析助手' }));
  expect(await screen.findByRole('dialog', { name: '会话分析助手' })).toBeVisible();
  expect(activeTab).toHaveAttribute('aria-selected', 'true');
  expect(content).toBeVisible();
  expect(document.querySelector('.session-agent-drawer')).toHaveStyle({ right: '0px' });
  fireEvent.change(screen.getByLabelText('助手问题'), { target: { value: '分析这次连接' } });
  fireEvent.click(document.querySelector('.arco-drawer-close-icon'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('tab', { name: '会话分析助手' }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(screen.getByLabelText('助手问题')).toHaveValue('分析这次连接');
  expect(activeTab).toHaveAttribute('aria-selected', 'true');
  expect(content).toBeVisible();
});
