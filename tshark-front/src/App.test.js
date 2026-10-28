import { render, screen } from '@testing-library/react';
import App from './App';
import { apiGet } from './Api.ts';

jest.mock('./Api.ts', () => ({ apiGet: jest.fn(), apiPost: jest.fn() }));
jest.mock('./components/HomePage', () => () => <div>Home screen</div>);
jest.mock('./PageLayout', () => () => <div>Data screen</div>);
jest.mock('./components/SessionDetail/SessionDetailPage', () => () => <div>Session details</div>);

test('requires path configuration before rendering application routes', async () => {
  apiGet.mockResolvedValue({ code: '200', data: { configured: false, values: {}, configPath: 'config/settings.json', errors: [] } });
  render(<App />);
  expect(await screen.findByRole('dialog')).toHaveTextContent('路径设置');
  expect(screen.queryByText('Home screen')).not.toBeInTheDocument();
});
