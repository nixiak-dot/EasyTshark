import { useLayoutEffect, useRef } from 'react';

export const measureContentColumnWidths = (root) => {
  const header = root.querySelector('thead');
  const body = root.querySelector('tbody');
  if (!header || !body) {
    return [];
  }

  const measurement = document.createElement('div');
  measurement.setAttribute('aria-hidden', 'true');
  Object.assign(measurement.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    width: 'max-content',
  });
  const table = document.createElement('table');
  Object.assign(table.style, {
    tableLayout: 'auto',
    width: 'max-content',
    minWidth: '0',
    maxWidth: 'none',
  });
  table.append(header.cloneNode(true), body.cloneNode(true));
  table.querySelectorAll('th, td').forEach((cell) => {
    cell.removeAttribute('width');
    Object.assign(cell.style, {
      position: 'static',
      width: 'auto',
      minWidth: '0',
      maxWidth: 'none',
    });
  });
  table.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  table.querySelectorAll('.react-resizable-handle').forEach((handle) => handle.remove());
  measurement.append(table);
  root.append(measurement);

  try {
    return Array.from(table.querySelector('thead tr').cells, (cell) =>
      Math.ceil(cell.getBoundingClientRect().width) + 2
    );
  } finally {
    measurement.remove();
  }
};

export default function useContentColumnWidths(data, setColumns) {
  const tableRef = useRef(null);

  useLayoutEffect(() => {
    let disposed = false;
    const updateWidths = () => {
      if (disposed || !tableRef.current) {
        return;
      }
      const widths = measureContentColumnWidths(tableRef.current);
      setColumns((columns) => {
        if (widths.length !== columns.length || columns.every((column, index) => column.width === widths[index])) {
          return columns;
        }
        return columns.map((column, index) => ({ ...column, width: widths[index] }));
      });
    };

    updateWidths();
    if (document.fonts) {
      document.fonts.ready.then(updateWidths);
    }
    return () => {
      disposed = true;
    };
  }, [data, setColumns]);

  return tableRef;
}
