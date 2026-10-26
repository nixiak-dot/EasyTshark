import { useState, forwardRef ,useEffect,useImperativeHandle,useRef} from 'react';
import { Table,Pagination,Tree } from '@arco-design/web-react';
import { Resizable } from 'react-resizable';
import useContentColumnWidths from './useContentColumnWidths';
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

  const [treeData,setTreeData] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [currentRowId,setCurrentRowId] = useState(1);

 // 十六进制数据相关
  const [offsetData, setOffsetData] = useState([])
  const [hexData, setHexData] = useState([])
  const [ascData, setAscData] = useState([])
  const [selectedLeftHex, setSelectedLeftHex] = useState([])
  const [selectedRightHex, setSelectedRightHex] = useState([])

  const [workStatus, setWorkStatus] = useState(0); // 新增：工作状态
  const timeRef = useRef(null);
  const INTERVAL = 3000;
  const STATUS_CHECK_INTERVAL = 5000; 

  const loadData = async ()=>{
    setLoading(true);

    //协议
    let proto='';
    let sessionId = 0;
    if (props.match.params.type === 'arp') {
      proto = "ARP"
    } else if (props.match.params.type === 'icmp') {
      proto = "ICMP"
    } else if (props.match.params.type === 'icmpv6') {
      proto = "ICMPv6"
    }
    else if(props.match.params.type === 'detail'){
      sessionId = parseInt(props.match.params.sessionId)
    } 
    else {
      proto = ""
    }

    const _data = await apiPost('/api/queryPacket',{
      "pageSize":pageSize,
      "pageNum":currentPage,
      "proto":proto,
      "session_id":sessionId
    })
    console.log(_data.data)
    setDataList(_data.data)
    setTotal(_data.total)
    setLoading(false);
  }

  useEffect(()=>{
    loadData();
  },[currentPage, pageSize, props.match.params.type]);

  
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

  const loadWorkStatus = async () => {
    try {
      const response = await apiGet('/api/getWorkStatus');
      if (response.code === "200") {
        setWorkStatus(response.data.status);
        return response.data.status;
      }
      return 0; // 默认状态
    } catch (error) {
      console.error('获取工作状态失败:', error);
      return 0; // 默认状态
    }
  };

  // 修改后的启动轮询函数
  const startPolling = async () => {
    clearInterval(timeRef.current);
    
    // 先检查工作状态
    const currentStatus = await loadWorkStatus();
    
    if (currentStatus === 2) {
      // 状态为2时开始轮询
      timeRef.current = setInterval(async () => {
        // 每次轮询前再次检查状态
        const status = await loadWorkStatus();
        if (status === 2) {
          await loadData();
        } else {
          // 状态不为2，停止轮询
          clearInterval(timeRef.current);
          setWorkStatus(status);
        }
      }, INTERVAL);
    } else {
      // 状态不为2，不启动轮询
      setWorkStatus(currentStatus);
    }
  };

  // 状态监控轮询（独立监控工作状态变化）
  const startStatusMonitoring = () => {
    const statusCheckInterval = setInterval(async () => {
      const currentStatus = await loadWorkStatus();
      
      if (currentStatus !== workStatus) {
        setWorkStatus(currentStatus);
        
        if (currentStatus === 2) {
          // 状态变为2，启动数据轮询
          await startPolling();
        } else {
          // 状态不为2，停止数据轮询
          clearInterval(timeRef.current);
        }
      }
    }, STATUS_CHECK_INTERVAL);
    
    return () => clearInterval(statusCheckInterval);
  };

  const stopPolling = () => {
    clearInterval(timeRef.current);
  };

  // 修改现有的 useEffect
  useEffect(() => {
    if (props.match.params.type !== 'detail') {
      // 启动状态监控
      const stopStatusMonitoring = startStatusMonitoring();
      
      // 初始检查并可能启动轮询
      startPolling();
      
      return () => {
        stopPolling();
        stopStatusMonitoring();
      };
    } else {
      stopPolling();
    }
  }, [props.match.params.type]);
  

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


  const loadPacketDetail = async ()=>{
    const _data = await apiPost('/api/getPacketDetail',{
      frameNumber:currentRowId
    })
    const tree = _data?.data.proto.map(addUniqueID);
    setTreeData(tree);
    transformHexData(_data?.data?.hexdata);
  }

  useEffect(()=>{
    loadPacketDetail();
  },[currentRowId]);

  const makeIdGenerator=()=>{
    let idCounter = 0;
    return ()=> idCounter++;
  }
  const generateId = makeIdGenerator();
  const addUniqueID = (node)=>{
    const updateNode = {...node,id:generateId().toString()};
    if(Array.isArray(updateNode.field) && updateNode.field.length > 0){
      updateNode.field = updateNode.field.map(addUniqueID);
    }
    return updateNode;
  }
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
  
    const arr = strTwoSplit(hex).split(',');
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
    const pos = parseInt(data.node?.props.pos)
    const size = parseInt(data.node?.props.size) + pos
    const leftArr = []
    const rightArr = []
    for (let i = pos; i < size; i++) {
      leftArr.push(i)
    }
    setSelectedRightHex([...leftArr])
    // 计算8位偏移量是否选中
    if (data.node && parseInt(data.node?.props.size) !== 0) {
      const posLeft = !isInteger((pos + 1) / 16) ? ((pos + 1) / 16 >> 0) + 1 : (pos + 1) / 16
      const sizeLeft = !isInteger(size / 16) ? (size / 16 >> 0) + 1 : size / 16
      for (let i = posLeft; i <= sizeLeft; i++) {
        rightArr.push(i)
      }
      setSelectedLeftHex([...rightArr])
    } else {
      setSelectedLeftHex([])
    }
  }



  return (
    <div>
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
          <Tree
           selectedKeys={selectedKeys}
           treeData={treeData}
           autoExpandParent={false}
           defaultSelectedKeys={['0-0-1']} 
           showLine
           fieldNames={{
            key: 'id',
            title: 'showname',
            children: 'field',
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
