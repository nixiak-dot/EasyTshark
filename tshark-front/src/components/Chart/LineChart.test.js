import React from 'react';
import { render } from '@testing-library/react';
import EChartsReact from 'echarts-for-react';
import LineChart from './LineChart';

jest.mock('echarts-for-react', () => jest.fn(() => null));

test('renders trend samples immediately without animation and keeps flat lines inside the grid', () => {
  const { rerender } = render(<LineChart data={[]} />);
  rerender(<LineChart data={[{ time: '12:00:00', bytes: 0 }, { time: '12:00:01', bytes: 128 }]} />);

  const { option } = EChartsReact.mock.calls[EChartsReact.mock.calls.length - 1][0];
  expect(option.animation).toBe(false);
  expect(option.grid.top).toBeGreaterThan(0);
  expect(option.grid.bottom).toBeGreaterThan(0);
  expect(option.xAxis.data).toEqual(['12:00:00', '12:00:01']);
  expect(option.series[0].data).toEqual([0, 128]);
});
