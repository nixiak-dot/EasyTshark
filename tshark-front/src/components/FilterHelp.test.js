import { fireEvent, render, screen } from '@testing-library/react';
import FilterHelp from './FilterHelp';

test('hover displays packet syntax and explains its difference from Wireshark filters', () => {
  render(<FilterHelp />);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.mouseEnter(screen.getByRole('button', { name: '筛选语法帮助' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent('src.ip');
  expect(screen.getByRole('tooltip')).toHaveTextContent('proto=TCP 不包含标记为 HTTP 的包');
  expect(screen.getByRole('tooltip')).toHaveTextContent('不是 Wireshark 显示过滤器');
  fireEvent.mouseLeave(screen.getByRole('button').parentElement);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('click and keyboard expose session-specific endpoint semantics', () => {
  render(<FilterHelp scope='sessions' />);
  const button = screen.getByRole('button', { name: '筛选语法帮助' });
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('tooltip')).toHaveTextContent('端点一/端点二');
  expect(screen.getByRole('tooltip')).toHaveTextContent('proto 匹配传输层或应用协议');
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.focus(button);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
});
