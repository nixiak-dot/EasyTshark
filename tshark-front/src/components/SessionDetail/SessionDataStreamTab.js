import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Empty, Radio, Spin, Typography } from '@arco-design/web-react';
import {
  hexCharCodeToAscStr,
  strSexteenSplit,
  strTwoSplit,
  padNumber,
  formatFileSize
} from '../../util.ts';
import { apiPost } from '../../Api.ts';

const RadioGroup = Radio.Group;

// 转换函数保持不变
function transformHexData(hex) {
  if (!hex) return { hexData: [], ascData: [], offsetData: [], hexAscData: [] };
  const ascParams = hexCharCodeToAscStr(hex);
  const hexAscData = strSexteenSplit(ascParams, 16, '换').split('换');
  const hexArr = strTwoSplit(hex).split(',');
  const hexData = strSexteenSplit(hexArr, 16, ',').split(',');
  const offsetData = hexAscData.map((_, i) => padNumber((i * 16).toString(16), 8, 0));
  return { hexData, ascData: [ascParams], offsetData, hexAscData };
}

function SessionDataStreamhTab({ sessionId }) {
  const [rawData, setRawData] = useState([]);
  const [countObj, setCountObj] = useState(null); // 初始为 null
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('ascii');
  const [filter, setFilter] = useState('a');

  const record = useMemo(() => {
    try {
      const data = localStorage.getItem(`row${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
  }, [sessionId]);

  const fetchData = useCallback(async (currentFilter) => {
    if (!record?.session_id) return;
    
    setLoading(true);
    try {
      const res = await apiPost('/api/getSessionDataStream', {
        session_id: record.session_id
      });

      if (res && res.code === 200) {
        // 【修正1】确保 count 对象被完整存储
        setCountObj(res.count);
        
        let list = res.data || [];
        // 【修正2】使用接口实时返回的 node0/node1 进行过滤判断
        if (currentFilter === 'b') {
          list = list.filter(v => v.srcNode === res.count?.node0);
        } else if (currentFilter === 'c') {
          list = list.filter(v => v.srcNode === res.count?.node1);
        }

        const processed = list.map((item, index) => ({
          ...item,
          ...transformHexData(item.hexData),
          uniqueKey: `pkt-${item.srcNode}-${item.time || index}-${index}`
        }));
        setRawData(processed);
      }
    } catch (err) {
      console.error("Fetch Data Error:", err);
    } finally {
      setLoading(false);
    }
  }, [record, sessionId]);

  // 修正后的数据请求逻辑
  useEffect(() => {
    fetchData(filter);
  }, [filter, fetchData]); // 移除这里的清理函数

  // 修正后的缓存清理逻辑：仅在 sessionId 变化或组件卸载时执行
  useEffect(() => {
    return () => {
      if (sessionId) {
        localStorage.removeItem(`row${sessionId}`);
      }
    };
  }, [sessionId]);


  // 渲染内容逻辑块
  const renderContent = () => {
    if (rawData.length === 0) return <Empty className="mt-5" />;
    return (
      <div className="stream-container" key={`${type}-${filter}`}>
        {rawData.map((item) => {
          const isNode0 = item.srcNode === countObj?.node0;
          const className = isNode0 ? 'send' : 'accept';
          if (type === 'ascii') {
            return (
              <div key={item.uniqueKey} className={className}>
                {item.ascData.map((info, idx) => (
                  <pre key={`pre-${idx}`} style={{ whiteSpace: 'break-spaces', fontFamily: 'monospace', margin: 0 }}>
                    {info}
                  </pre>
                ))}
              </div>
            );
          }
          if (type === 'rawData') {
            return (
              <div key={item.uniqueKey} className={className}>
                {item.hexData.join(' ')}
              </div>
            );
          }
          if (type === 'hex') {
            return (
              <div key={item.uniqueKey} className={`${className} stream-offset mgb20`}>
                <div className="left">{item.offsetData.map((v, i) => <div key={i}>{v}</div>)}</div>
                <div className="center">{item.hexData.map((v, i) => <div key={i}>{v}</div>)}</div>
                <div className="right">{item.hexAscData.map((v, i) => <div key={i}>{v}</div>)}</div>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div style={{ padding: 16 }}>
      {/* 1. 数据过滤器 - 修正统计和IP显示 */}
      <RadioGroup
        type='button'
        value={filter}
        style={{ marginBottom: 16, display: 'block' }}
        onChange={setFilter}
      >
        <Radio value="a">
          全部 (
          {formatFileSize((countObj?.node0BytesCount || 0) + (countObj?.node1BytesCount || 0))}
          ，{countObj?.totalPacketCount || 0} 个数据包)
        </Radio>
        
        {/* 【修正3】将 Node0/Node1 替换为实际 IP 地址 */}
        <Radio value="b">
          <Typography.Text style={{ color: '#C04545' }}>
            {countObj?.node0 || '加载中...'}
          </Typography.Text> 
          <span style={{ margin: '0 8px' }}>→</span>
          <Typography.Text style={{ color: '#319EFF' }}>
            {countObj?.node1 || '加载中...'}
          </Typography.Text>
        </Radio>
        
        <Radio value="c">
          <Typography.Text style={{ color: '#319EFF' }}>
            {countObj?.node1 || '加载中...'}
          </Typography.Text> 
          <span style={{ margin: '0 8px' }}>→</span>
          <Typography.Text style={{ color: '#C04545' }}>
            {countObj?.node0 || '加载中...'}
          </Typography.Text>
        </Radio>
      </RadioGroup>

      {/* 2. 视图类型切换 */}
      <RadioGroup
        value={type}
        type="button"
        style={{ marginBottom: 16 }}
        onChange={setType}
      >
        <Radio value="ascii">ASCII</Radio>
        <Radio value="rawData">原始数据</Radio>
        <Radio value="hex">HEX 转储</Radio>
      </RadioGroup>

      {/* 3. 渲染区域 */}
      <Spin loading={loading} block style={{ width: '100%', minHeight: 200 }}>
        {!loading && (
          <div key={`view-wrapper-${type}-${filter}`}>
            {renderContent()}
          </div>
        )}
      </Spin>
    </div>
  );
}

export default SessionDataStreamhTab;