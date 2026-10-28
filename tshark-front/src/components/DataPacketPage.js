import { useState, forwardRef ,useEffect,useImperativeHandle,useRef,useCallback} from 'react';
import { Table,Pagination,Tree,Input,Button } from '@arco-design/web-react';
import { Resizable } from 'react-resizable';
import useContentColumnWidths from './useContentColumnWidths';
import FilterHelp from './FilterHelp';
import { buildProtocolTree, packetByteRange } from './packetProtocolTree';
import dayjs from 'dayjs';
import { apiPost,apiGet } from '../Api.ts';
import { hexCharCodeToStr, strTwoSplit, isInteger, padNumber } from '../util.ts'
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
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [currentRowId,setCurrentRowId] = useState(1);

 // 十六进制数据相关
  const [offsetData, setOffsetData] = useState([])
  const [hexData, setHexData] = useState([])
  const [ascData, setAscData] = useState([])
  const [selectedLeftHex, setSelectedLeftHex] = useState([])
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
  const loadData = useCallback(({ silent = false } = {}) => {
    const payload = {
      pageSize,
      pageNum: currentPage,
      session_id: packetType === 'detail' ? parseInt(packetSessionId) : 0,
      filterExpression: searchKeyword,
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
  }, [currentPage, pageSize, packetType, packetSessionId, searchKeyword, reloadCount]);

  useEffect(() => {
    loadData();
    return () => {
      requestIdRef.current += 1;
      pendingRequestRef.current = null;
    };
  }, [loadData]);

  
  // 暴露方法给父组件
  const reloadData = () => {
    setDataList([])
    setTreeData([])
    setOffsetData([])
    setHexData([])
    setAscData([])
    setCurrentPage(1)
    setCurrentRowId(1)
    setReloadCount(reloadCount + 1)
  }
  useImperativeHandle(ref, () => ({
    setCurrentRowId: setCurrentRowId,
    reloadData: reloadData,
    loadData: loadData,
  }));

  useEffect(() => {
    if (dataList.length > 0) {
      setCurrentRowId((selectedId) =>
        dataList.some((record) => record.frame_number === selectedId)
          ? selectedId
          : dataList[0].frame_number
      );
    }
  }, [dataList]);

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

  const components = {
    header: {
      th: ResizableTitle,
    },
  };


  useEffect(()=>{
    let active = true;
    setTreeData([]);
    setDetailError('');
    setSelectedKeys([]);
    setSelectedLeftHex([]);
    setSelectedRightHex([]);
    transformHexData('');
    if (currentRowId > 0) {
      apiPost('/api/getPacketDetail', { frameNumber: currentRowId }).then((response) => {
        if (!active) return;
        if (!Array.isArray(response?.data?.proto)) {
          throw new Error('数据包协议详情解析失败');
        }
        setTreeData(buildProtocolTree(response.data.proto));
        transformHexData(response.data.hexdata || '');
      }).catch(() => {
        if (active) setDetailError('无法解析数据包详情，请确认抓包文件可读后重试。');
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

  const transformHexData = (hex) => {
    const offsetData = [];
    const hexData = [];
    const ascData = [];

    // 十六进制转换为ascii码
    const params = hexCharCodeToStr(hex);
    for (let i = 0; i < params.length; i++) {
      const asc = { label: params[i], key: i, show: false };
      // 如果是..，则表达找不到该ascii码，用虚拟.表达
      const str = ['换', '行', '无'];
      if (str.includes(params[i])) {
        asc.label = '.';
        asc.show = true;
      }
      ascData.push(asc);
    }
  
    const arr = strTwoSplit(hex).split(',').filter(Boolean);
    arr.map((item, index) => {
      hexData.push({ label: item, key: index });
    });

    // 判断是总偏移量个数是否为整数，不为整数向上取整
    let offset = ascData.length / 16;
    if (!isInteger(offset)) {
      offset = parseInt(offset) + 1;
    }

    // 计算偏移量 不够四位左侧补位0
    for (let i = 0; i < offset; i++) {
      const hex = padNumber((i * 16).toString(16), 4, 0);
      offsetData.push({ label: hex, key: i + 1 });
    }

    setOffsetData(offsetData);
    setHexData(hexData);
    setAscData(ascData);
}

// 点击节点高亮偏移量
  const handleNodeClick = (node, data) => {
    setSelectedKeys(node)
    const selectedNode = data.node?.props?.dataRef || data.node?.props;
    const bytes = packetByteRange(selectedNode, ascData.length);
    setSelectedRightHex(bytes);
    setSelectedLeftHex([...new Set(bytes.map((index) => Math.floor(index / 16) + 1))]);
  }



  return (
    <div>
      {listError && <div role='alert'>{listError}</div>}
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
          <FilterHelp scope='packets' />
        </div>
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
      <div className='detail-pannel'>
        <div className='proto-tree'>
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
       <div className='hex-data'>
        <div className="offset">
          <div className="left pdt8 pdb8">
            {offsetData.map(item => {
              return <span key={item.key} className={selectedLeftHex.indexOf(item.key) !== -1 ? 'selected' : ''}>{item.label}</span>
            })}
          </div>
          <div className="center">
            {hexData.map(item => {
              return <span id={item.key} key={item.key} className={selectedRightHex.indexOf(item.key) !== -1 ? 'selected' : ''}>{item.label}</span>
            })}
          </div>
          <div className="right">
            {ascData.map(item => {
              return <span key={item.key} className={selectedRightHex.indexOf(item.key) !== -1 ? 'selected' : ''} style={item.show ? { color: '#bbb' } : {}}>{item.label}</span>
            })}
          </div>
        </div>
       </div>
    </div>
    </div>
  );
}  
)

export default DataPacketPage;
