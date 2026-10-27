import { useState, forwardRef ,useEffect} from 'react';
import { Table,Pagination,Button,Input } from '@arco-design/web-react';
import { Resizable } from 'react-resizable';
import useContentColumnWidths from './useContentColumnWidths';
import dayjs from 'dayjs';
import { apiPost } from '../Api.ts';
const originColumns = [
  {
    title: '会话ID',
    dataIndex: 'session_id',
    width: 80
  },
  {
    title: 'IP1',
    dataIndex: 'ip1',
    width: 150
  },
  {
    title: 'IP1归属地',
    dataIndex: 'ip1_location',
    width: 200
  },
  {
    title: 'IP1端口',
    dataIndex: 'ip1_port',
    width: 100
  },
  {
    title: 'IP2',
    dataIndex: 'ip2',
    width: 150
  },
  {
    title: 'IP2归属地',
    dataIndex: 'ip2_location',
    width: 200
  },
  {
    title: 'IP2端口',
    dataIndex: 'ip2_port',
    width: 100
  },
  {
    title: '会话开始时间',
    dataIndex: 'start_time',
    width: 230,
    render:(value)=>{
      // 后端格式：20260128180948.41 → YYYYMMDDHHmmss.SS
      const timestampStr = value.toString();
      // 提取日期时间部分：20260128180948
      const mainPart = timestampStr.split('.')[0];   
      // 解析为 dayjs 对象
      const date = dayjs(mainPart, 'YYYYMMDDHHmmss');
      // 提取毫秒部分
      const milliseconds = timestampStr.split('.')[1] || '00';
      return `${date.format('YYYY-MM-DD HH:mm:ss')}.${milliseconds}`;
    }
  },
  {
    title: '会话结束时间',
    dataIndex: 'end_time',
    width: 230,
    render:(value)=>{
      // 后端格式：20260128180948.41 → YYYYMMDDHHmmss.SS
      const timestampStr = value.toString();
      // 提取日期时间部分：20260128180948
      const mainPart = timestampStr.split('.')[0];   
      // 解析为 dayjs 对象
      const date = dayjs(mainPart, 'YYYYMMDDHHmmss');
      // 提取毫秒部分
      const milliseconds = timestampStr.split('.')[1] || '00';
      return `${date.format('YYYY-MM-DD HH:mm:ss')}.${milliseconds}`;
    }
  },
  {
    title: '应用协议',
    dataIndex: 'app_proto',
    width: 120
  },
  {
    title: '数据包总大小',
    dataIndex: 'total_bytes',
    width: 120
  },
  {
    title: '数据包总数量',
    dataIndex: 'packet_count',
    width: 120
  },
   {
    className: 'custom-arco-table-row-action',
    fixed: 'right',
    title: '操作',
    align: 'center',
    width: 120,
    dataIndex: 'operations',
    render: (_, record) => (
      <div
        onClick={(e) => {
          e.stopPropagation();
          localStorage.setItem(`row${record.session_id}`, JSON.stringify(record))
          window.open(`/#/detail?sessionId=${record.session_id}`)
        }}
      >
        <Button type='outline' size='mini'>会话详情</Button>
      </div>
    ),
  },
];

const CustomResizeHandle = forwardRef((props, ref) => {
  const { handleAxis, ...restProps } = props;
  return (
    <span
      ref={ref}
      className={`react-resizable-handle react-resizable-handle-${handleAxis}`}
      {...restProps}
      onClick={(e) => {
        e.stopPropagation();
      }}
    />
  );
});

const ResizableTitle = (props) => {
  const { onResize, width, ...restProps } = props;

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={<CustomResizeHandle />}
      onResize={onResize}
      draggableOpts={{
        enableUserSelectHack: false,
      }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

function SessionPage(props) {
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [dataList, setDataList] = useState([])
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  const submitSearch = () => {
    setCurrentPage(1);
    setSearchKeyword(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setCurrentPage(1);
    setSearchKeyword('');
  };


  const loadData = async ()=>{
    setLoading(true);

    const _data = await apiPost('/api/getSessionList',{
      "pageSize":pageSize,
      "pageNum":currentPage,
      "filterExpression":searchKeyword
    })
    console.log(_data.data)
    setDataList(_data.data)
    setTotal(_data.total)
    setLoading(false);
  }

  useEffect(()=>{
    loadData();
  },[currentPage, pageSize, props.match.params.type, searchKeyword])

  const [columns, setColumns] = useState(
    originColumns.map((column, index) => {
      if (column.width) {
        return {
          ...column,
          onHeaderCell: (col) => ({
            width: col.width,
            onResize: handleResize(index),
          }),
        };
      }

      return column;
    })
  );

  function handleResize(index) {
    return (e, { size }) => {
      setColumns((prevColumns) => {
        const nextColumns = [...prevColumns];
        nextColumns[index] = { ...nextColumns[index], width: size.width };
        return nextColumns;
      });
    };
  }

  const tableRef = useContentColumnWidths(dataList, setColumns);
  const tableWidth = columns.reduce((totalWidth, column) => totalWidth + column.width, 0);

  const components = {
    header: {
      th: ResizableTitle,
    },
  };
  return (
    <div>
      {props.match.params.type !== 'detail' && (
        <div className='traffic-filter-bar'>
          <Input
            value={searchInput}
            placeholder='如 src.ip=192.0.2.1 && dst.port=443 && proto=TCP'
            onChange={setSearchInput}
            onPressEnter={submitSearch}
          />
          <Button type='primary' onClick={submitSearch}>筛选</Button>
          <Button onClick={clearSearch} disabled={!searchInput && !searchKeyword}>清除</Button>
        </div>
      )}
      <div ref={tableRef} className="table-window table-window-session">
      <Table
        className='table-demo-resizable-column'
        components={components}
        border={false}
        borderCell={false}
        tableLayoutFixed
        columns={columns}
        data={dataList}
        loading={loading}
        scroll={{ x: tableWidth, y: 320 }}
        rowKey='session_id'
        rowClassName={(record) => selectedRowId === record.session_id ? 'selected-row' : ''}
        pagination={false}
        onRow={(record)=>({
        onClick:()=>{
          setSelectedRowId(record.session_id); // 使用 session_id 作为选中标识
        },
        style: {
          cursor: 'pointer',
        }
      })}
      />
      <Pagination
        current={currentPage}
        showTotal
        total={total}
        pageSize={pageSize}
        onChange={(page)=>setCurrentPage(page)}
        style={{ marginTop: 16,textAlign: 'right' }}
      />
      </div>
    </div>
  );
}

export default SessionPage;
