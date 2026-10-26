import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { Table } from '@arco-design/web-react';
import useContentColumnWidths, { measureContentColumnWidths } from './useContentColumnWidths';

const createTableRoot = () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <table><thead><tr>
      <th width="80">Identifier</th><th width="80">Location</th><th width="80">Info</th>
    </tr></thead></table>
    <table><colgroup><col style="width: 80px"></colgroup><tbody>
      <tr><td>1</td><td>Short</td><td>Short info</td></tr>
      <tr><td>2</td><td>A much longer location</td><td>A much longer description</td></tr>
    </tbody></table>`;
  document.body.append(root);
  return root;
};

beforeEach(() => {
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const table = this.closest('table');
    const columnIndex = this.cellIndex;
    if (!table || columnIndex === undefined) {
      return { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 };
    }
    const textLengths = Array.from(table.rows, (row) => {
      const cell = row.cells[columnIndex];
      return cell?.colSpan === 1 ? cell.textContent.length : 0;
    });
    return { width: Math.max(...textLengths) * 10 + 32 };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

test('measures every column using its header and all current rows in one unconstrained table', () => {
  const root = createTableRoot();
  expect(measureContentColumnWidths(root)).toEqual([134, 254, 284]);
  const measurementTable = HTMLElement.prototype.getBoundingClientRect.mock.instances[0].closest('table');
  expect(measurementTable.style.tableLayout).toBe('auto');
  expect(measurementTable.style.minWidth).toBe('0');
  expect(measurementTable.style.maxWidth).toBe('none');
  expect(measurementTable.querySelector('colgroup')).toBeNull();
  expect(measurementTable.querySelector('th').hasAttribute('width')).toBe(false);
  expect(root.querySelector('[aria-hidden]')).toBeNull();
  expect(root.querySelector('th').getAttribute('width')).toBe('80');
});

test('new page content can shrink columns as well as grow them', () => {
  const root = createTableRoot();
  const originalWidths = measureContentColumnWidths(root);
  root.querySelector('tbody tr:last-child').remove();
  const nextWidths = measureContentColumnWidths(root);
  expect(nextWidths).toEqual([134, 114, 134]);
  expect(nextWidths[1]).toBeLessThan(originalWidths[1]);
  expect(nextWidths[2]).toBeLessThan(originalWidths[2]);
});

test('measurement node is removed even if browser measurement fails', () => {
  const root = createTableRoot();
  HTMLElement.prototype.getBoundingClientRect.mockImplementation(() => {
    throw new Error('measurement failed');
  });
  expect(() => measureContentColumnWidths(root)).toThrow('measurement failed');
  expect(root.querySelector('[aria-hidden]')).toBeNull();
});

test('empty tables still size columns from the header', () => {
  const root = createTableRoot();
  root.querySelector('tbody').innerHTML = '';
  expect(measureContentColumnWidths(root)).toEqual([134, 114, 74]);
});

function TableHarness({ data }) {
  const [columns, setColumns] = useState([{ width: 80 }, { width: 80 }]);
  const tableRef = useContentColumnWidths(data, setColumns);
  return (
    <div ref={tableRef}>
      <table><thead><tr><th>ID</th><th>Location</th></tr></thead></table>
      <table><tbody>{data.map((record) => (
        <tr key={record.id}><td>{record.id}</td><td>{record.location}</td></tr>
      ))}</tbody></table>
      <output data-testid="widths">{columns.map((column) => column.width).join(',')}</output>
    </div>
  );
}

test('hook publishes shared widths and recalculates on data changes without looping', () => {
  const { rerender } = render(<TableHarness data={[{ id: 1, location: 'Short' }]} />);
  expect(screen.getByTestId('widths')).toHaveTextContent('54,114');
  rerender(<TableHarness data={[{ id: 2, location: 'A much longer location' }]} />);
  expect(screen.getByTestId('widths')).toHaveTextContent('54,254');
});

function ArcoTableHarness({ data }) {
  const [columns, setColumns] = useState([
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: 'Location', dataIndex: 'location', width: 80 },
  ]);
  const tableRef = useContentColumnWidths(data, setColumns);
  return (
    <div ref={tableRef}>
      <Table
        columns={columns}
        data={data}
        rowKey="id"
        pagination={false}
        tableLayoutFixed
        scroll={{ x: columns.reduce((total, column) => total + column.width, 0), y: 320 }}
      />
      <output data-testid="arco-widths">{columns.map((column) => column.width).join(',')}</output>
    </div>
  );
}

test('Arco table measures a DOM wrapper on mount and when capture rows arrive', () => {
  const { container, rerender } = render(
    <React.StrictMode><ArcoTableHarness data={[]} /></React.StrictMode>
  );
  expect(screen.getByTestId('arco-widths')).toHaveTextContent('54,114');
  rerender(
    <React.StrictMode>
      <ArcoTableHarness data={[{ id: 1, location: 'A much longer location' }]} />
    </React.StrictMode>
  );
  expect(screen.getByTestId('arco-widths')).toHaveTextContent('54,254');
  const tables = container.querySelectorAll('.arco-table table');
  expect(tables.length).toBeGreaterThanOrEqual(2);
  tables.forEach((table) => {
    expect(Array.from(table.querySelectorAll('col'), (column) => column.style.width))
      .toEqual(['54px', '254px']);
  });
});
