import { useState, forwardRef ,useEffect,useImperativeHandle,useRef,useCallback} from 'react';
import { Table,Pagination,Tree,Spin } from '@arco-design/web-react';
import { Resizable } from 'react-resizable';
import useContentColumnWidths from './useContentColumnWidths';
import TrafficFilterBar from './TrafficFilterBar';
import { buildProtocolTree, packetByteRange } from './packetProtocolTree';
import PacketBytes, { parsePacketBytes } from './PacketBytes';
import { MIN_PACKET_DETAIL_WIDTH } from './packetByteLayout';
import dayjs from 'dayjs';
import { apiPost,apiGet } from '../Api.ts';
const originColumns = [
  {
    title: '序号',
    dataIndex: 'frame_number',
    width: 80
  },
  {
    title: '时间',
    dataIndex: 'timestamp',
    width: 250,
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
    title: '源IP',
    dataIndex: 'src_ip',
    width: 180
  },
  {
    title: '源IP归属地',
    dataIndex: 'src_location',
    width: 200
  },
  {
    title: '源端口',
    dataIndex: 'src_port',
    width: 150
  },
  {
    title: '目的IP',
    dataIndex: 'dst_ip',
    width: 180
  },
  {
    title: '目的IP归属地',
    dataIndex: 'dst_location',
    width: 200
  },
  {
    title: '目的端口',
    dataIndex: 'dst_port',
    width: 150
  },
  {
    title: '数据包大小',
    dataIndex: 'len',
    width: 150
  },
  {
    title: '协议',
    dataIndex: 'protocol',
    width: 120
  },
  {
    title: '信息',
    dataIndex: 'info',
    width: 350
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

const DataPacketPage = forwardRef(function DataPacketPage(props,ref) {
  const [reloadCount, setReloadCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [packetTableHeight, setPacketTableHeight] = useState(520);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [dataList, setDataList] = useState([])
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const pendingRequestRef = useRef(null);
  const requestIdRef = useRef(0);
  const [listError, setListError] = useState('');

  const [treeData,setTreeData] = useState([]);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const detailPanelRef = useRef(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [currentRowId,setCurrentRowId] = useState(null);
  const [scrollTarget, setScrollTarget] = useState(null);

 // 十六进制数据相关
  const [packetBytes, setPacketBytes] = useState([])
  const [selectedRightHex, setSelectedRightHex] = useState([])

  const INTERVAL = 3000;
  const STATUS_CHECK_INTERVAL = 5000; 

  const submitSearch = () => {
    setCurrentPage(1);
    setSearchKeyword(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setCurrentPage(1);
    setSearchKeyword('');
  };

  const packetType = props.match.params.type;
  const packetSessionId = props.match.params.sessionId;
  const filterExpression = props.filterExpression ?? searchKeyword;
  const loadData = useCallback(({ silent = false } = {}) => {
    const payload = {
      pageSize,
      pageNum: currentPage,
      session_id: packetType === 'detail' ? parseInt(packetSessionId) : 0,
      filterExpression,
    };
    const key = JSON.stringify([payload, reloadCount]);
    if (pendingRequestRef.current?.key === key) return pendingRequestRef.current.promise;
    const requestId = ++requestIdRef.current;
    const request = { key, promise: null };
    pendingRequestRef.current = request;
    if (!silent) {
      setLoading(true);
      setListError('');
    }
    request.promise = (async () => {
      try {
        const response = await apiPost('/api/queryPacket', payload);
        if (requestId !== requestIdRef.current) return;
        if (!Array.isArray(response?.data) || (response.code !== undefined && String(response.code) !== '200')) {
          throw new Error(response?.msg || '数据包列表加载失败');
        }
        setDataList((previous) => JSON.stringify(previous) === JSON.stringify(response.data) ? previous : response.data);
        setTotal(response.total);
        setListError('');
      } catch (error) {
        if (requestId === requestIdRef.current) {
          if (!silent) setListError('数据包列表加载失败，请重试。');
          console.error('Failed to refresh packets:', error);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          pendingRequestRef.current = null;
          setLoading(false);
        }
      }
    })();
    return request.promise;
  }, [currentPage, pageSize, packetType, packetSessionId, filterExpression, reloadCount]);

  useEffect(() => {
    loadData();
    return () => {
      requestIdRef.current += 1;
      pendingRequestRef.current = null;
    };
  }, [loadData]);

  
  // 暴露方法给父组件
  const reloadData = () => {
    setScrollTarget(null)
    setDataList([])
    setTreeData([])
    setPacketBytes([])
    setCurrentPage(1)
    setCurrentRowId(null)
    setReloadCount(reloadCount + 1)
  }
  useImperativeHandle(ref, () => ({
    setCurrentRowId: (frameNumber, packetIndex) => {
      const page = Number.isInteger(packetIndex) ? Math.floor(packetIndex / pageSize) + 1 : currentPage;
      setScrollTarget({ frameNumber, page });
      setCurrentPage(page);
      setCurrentRowId(frameNumber);
    },
    reloadData: reloadData,
    loadData: loadData,
  }));

  useEffect(() => {
    if (dataList.length === 0 && !scrollTarget) setCurrentRowId(null);
    if (dataList.length > 0 && !scrollTarget) {
      setCurrentRowId((selectedId) =>
        dataList.some((record) => record.frame_number === selectedId)
          ? selectedId
          : dataList[0].frame_number
      );
    }
  }, [dataList, scrollTarget]);

  useEffect(() => {
    if (packetType === 'detail') return undefined;
    let active = true;
    let timer;
    let wasCapturing = false;
    const poll = async (initial = false) => {
      let capturing = false;
      try {
        const response = await apiGet('/api/getWorkStatus');
        if (!active) return;
        if (String(response?.code) !== '200') throw new Error(response?.msg || '获取工作状态失败');
        capturing = response.data.status === 2;
        if (!initial && (capturing || wasCapturing)) await loadData({ silent: true });
        wasCapturing = capturing;
      } catch (error) {
        if (active) console.error('Failed to poll packet status:', error);
      } finally {
        if (active) timer = setTimeout(poll, capturing ? INTERVAL : STATUS_CHECK_INTERVAL);
      }
    };
    poll(true);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [loadData, packetType]);
  

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

  useEffect(() => {
    if (!scrollTarget || scrollTarget.page !== currentPage ||
        !dataList.some((record) => record.frame_number === scrollTarget.frameNumber)) return;
    const body = tableRef.current?.querySelector('.arco-table-body');
    const row = body?.querySelector('.selected-row');
    if (!body || !row) return;
    const bodyBounds = body.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const visibleTop = bodyBounds.top + body.clientTop;
    const visibleBottom = visibleTop + body.clientHeight;
    if (rowBounds.top < visibleTop) {
      body.scrollTop += rowBounds.top - visibleTop;
    } else if (rowBounds.bottom > visibleBottom) {
      body.scrollTop += rowBounds.bottom - visibleBottom;
    }
    setScrollTarget(null);
  }, [scrollTarget, currentPage, dataList, tableRef]);

  const components = {
    header: {
      th: ResizableTitle,
    },
  };


  useEffect(()=>{
    let active = true;
    detailPanelRef.current?.querySelectorAll('.proto-tree, .hex-data').forEach((pane) => {
      pane.scrollTop = 0;
      pane.scrollLeft = 0;
    });
    setTreeData([]);
    setDetailError('');
    setSelectedKeys([]);
    setSelectedRightHex([]);
    setPacketBytes([]);
    setDetailLoading(currentRowId > 0);
    if (currentRowId > 0) {
      apiPost('/api/getPacketDetail', { frameNumber: currentRowId }).then((response) => {
        if (!active) return;
        if (!Array.isArray(response?.data?.proto)) {
          throw new Error('数据包协议详情解析失败');
        }
        const bytes = parsePacketBytes(response.data.hexdata || '');
        setTreeData(buildProtocolTree(response.data.proto));
        setPacketBytes(bytes);
      }).catch(() => {
        if (active) setDetailError('无法解析数据包详情，请确认抓包文件可读后重试。');
      }).finally(() => {
        if (active) setDetailLoading(false);
      });
    }
    return () => { active = false; };
  },[currentRowId]);

  const renderTitle = (node)=>{
    const title = node.dataRef.showname || node.dataRef.name || node.dataRef.show;
    if (node._level === 0) {
      return <span style={{ color: 'rgb(var(--primary-5))' }}>{title}</span>;
    }
    return title;
  }

// 点击节点高亮偏移量
  const handleNodeClick = (node, data) => {
    setSelectedKeys(node)
    const selectedNode = data.node?.props?.dataRef || data.node?.props;
    const bytes = packetByteRange(selectedNode, packetBytes.length);
    setSelectedRightHex(bytes);
  }



  return (
    <div className='data-packet-page' style={{ '--packet-detail-min-width': `${MIN_PACKET_DETAIL_WIDTH}px` }}>
      {listError && <div role='alert'>{listError}</div>}
      {props.match.params.type !== 'detail' && (
        <TrafficFilterBar value={searchInput} appliedValue={searchKeyword}
          onChange={setSearchInput} onSubmit={submitSearch} onClear={clearSearch} />
      )}
      <Resizable
        width={0}
        height={packetTableHeight}
        axis="y"
        resizeHandles={['s']}
        minConstraints={[0, 320]}
        maxConstraints={[Infinity, 1200]}
        onResize={(event, { size }) => setPacketTableHeight(size.height)}
        handle={<span className="packet-table-resize-handle" title="上下拖动调整数据包列表高度">上下拖动调整高度</span>}
      >
      <div ref={tableRef} className="packet-table-shell" style={{ height: packetTableHeight }}>
        <Table
          className='table-demo-resizable-column'
          style={{ '--traffic-table-height': `${packetTableHeight - 150}px` }}
          components={components}
          border={false}
          borderCell={false}
          tableLayoutFixed
          columns={columns}
          data={dataList}
          loading={loading}
          scroll={{ x: tableWidth, y: packetTableHeight - 150 }}
          rowKey='frame_number'
          rowClassName={(record) => currentRowId === record.frame_number ? 'selected-row' : ''}
          pagination={false}
          onRow={(record)=>({
            onClick:()=>{
              setCurrentRowId(record.frame_number);
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
          style={{ marginTop: 12,textAlign: 'right' }}
        />
      </div>
      </Resizable>
      <div className='detail-pannel' ref={detailPanelRef}>
        <div className='proto-tree' aria-label='协议树' aria-busy={detailLoading}>
          <Spin loading={detailLoading} className='packet-detail-spin' tip='正在加载协议树…'>
          <div className='packet-detail-content'>
          {detailError && <div role='alert'>{detailError}</div>}
          <Tree
           selectedKeys={selectedKeys}
           treeData={treeData}
           autoExpandParent={false}
           defaultSelectedKeys={['0-0-1']} 
           showLine
           fieldNames={{
            key: 'id',
            title: 'showname',
            children: 'children',
           }}
           renderTitle={renderTitle}
           onSelect={handleNodeClick}
           />
          </div>
          </Spin>
       </div>
       <div className='hex-data' aria-label='十六进制与 ASCII' aria-busy={detailLoading}>
        <Spin loading={detailLoading} className='packet-detail-spin' tip='正在加载字节数据…'>
          <div className='packet-detail-content'>
            <PacketBytes key={currentRowId} bytes={packetBytes} selectedBytes={selectedRightHex}
              onSelect={(bytes) => { setSelectedKeys([]); setSelectedRightHex(bytes); }} />
          </div>
        </Spin>
       </div>
    </div>
    </div>
  );
}  
)

export default DataPacketPage;
