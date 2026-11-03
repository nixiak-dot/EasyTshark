import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Alert, Card, Empty, ResizeBox, Spin, Tag, Typography } from '@arco-design/web-react';
import { IconArrowRight } from '@arco-design/web-react/icon';
import { calculateDuration } from '../../util.ts';
import { apiPost } from '../../Api.ts';
import DataPacketPage from '../DataPacketPage';
import { MIN_PACKET_DETAIL_WIDTH } from '../packetByteLayout';
import TrafficFilterBar from '../TrafficFilterBar';
import '../../style/global.css';
import '../../style/session-time-graph.css';

function readSession(sessionId) {
  try {
    return JSON.parse(localStorage.getItem(`row${sessionId}`)) || {};
  } catch {
    return {};
  }
}

function Endpoint({ label, ip, port, location }) {
  return (
    <div className='session-endpoint'>
      <span className='session-eyebrow'>{label}</span>
      <span className='session-endpoint-address'>
        {ip || '未知地址'}{port != null ? `:${port}` : ''}
      </span>
      <span className='session-muted'>{location || '未知归属地'}</span>
    </div>
  );
}

export default function SessionTimeGraphTab({ sessionId }) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentRowId, setCurrentRowId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [filterExpression, setFilterExpression] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [splitSize, setSplitSize] = useState(0.5);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [timelineMinWidth, setTimelineMinWidth] = useState(480);
  const layoutRef = useRef(null);
  const summaryRef = useRef(null);
  const packetPageRef = useRef(null);
  const record = readSession(sessionId);
  const transport = record.trans_proto || '';
  const application = record.app_proto || '';
  const stacked = layoutWidth > 0 && layoutWidth < timelineMinWidth + MIN_PACKET_DETAIL_WIDTH + 20;
  const minSplitSize = layoutWidth && !stacked ? (timelineMinWidth + 10) / layoutWidth : 0.25;
  const maxSplitSize = layoutWidth && !stacked ? 1 - (MIN_PACKET_DETAIL_WIDTH + 10) / layoutWidth : 0.75;
  const clampSplitSize = (size) => Math.min(maxSplitSize, Math.max(minSplitSize, size));
  const effectiveSplitSize = clampSplitSize(splitSize);

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const summary = summaryRef.current;
    const measure = () => {
      setLayoutWidth(layout.offsetWidth);
      const sizingSummary = summary.cloneNode(true);
      sizingSummary.setAttribute('aria-hidden', 'true');
      Object.assign(sizingSummary.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none', width: 'max-content', maxWidth: 'none' });
      layout.parentElement.appendChild(sizingSummary);
      const summaryWidth = sizingSummary.getBoundingClientRect().width;
      sizingSummary.remove();
      const list = summary.closest('.session-timeline-list');
      const scrollbarWidth = Math.max(0, list.offsetWidth - list.clientWidth);
      setTimelineMinWidth(Math.ceil(Math.max(480, summaryWidth + 26 + scrollbarWidth)));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    [layout, summary.closest('.session-timeline-list'), ...summary.querySelectorAll('.session-endpoint > span, .session-summary-heading > *')].forEach((element) => observer?.observe(element));
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sessionId, transport, application, record.ip1, record.ip1_port, record.ip1_location, record.ip2, record.ip2_port, record.ip2_location]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData([]);
    setTotal(0);
    setCurrentRowId(null);
    apiPost('/api/queryPacket', {
      pageSize: 100,
      pageNum: 1,
      session_id: parseInt(sessionId),
      filterExpression,
    }).then((response) => {
      if (!active) return;
      if (!Array.isArray(response?.data) || (response.code !== undefined && String(response.code) !== '200')) {
        throw new Error(response?.msg || '时序图加载失败');
      }
      setData(response.data);
      setTotal(response.total ?? response.data.length);
      setCurrentRowId(response.data[0]?.frame_number ?? null);
    }).catch((failure) => {
      if (active) setError(failure.message || '时序图加载失败，请重试。');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [sessionId, filterExpression]);

  const selectPacket = (item, index) => {
    setCurrentRowId(item.frame_number);
    packetPageRef.current?.setCurrentRowId(item.frame_number, index);
  };

  return (
    <div className='session-time-view'>
      <TrafficFilterBar value={searchInput} appliedValue={filterExpression}
        onChange={setSearchInput} onSubmit={() => setFilterExpression(searchInput.trim())}
        onClear={() => { setSearchInput(''); setFilterExpression(''); }} />
      <ResizeBox.Split ref={layoutRef} className={`session-detail-layout${stacked ? ' is-stacked' : ''}`}
        style={{ '--packet-detail-min-width': `${MIN_PACKET_DETAIL_WIDTH}px` }}
        size={effectiveSplitSize} min={minSplitSize} max={maxSplitSize}
        onMoving={(_, size) => setSplitSize(clampSplitSize(Number(size)))}
        trigger={(
          <div className='session-split-handle' role='separator' tabIndex={0}
            aria-label='调整会话时序与数据包列表宽度' aria-orientation='vertical'
            aria-valuemin={Math.round(minSplitSize * 100)} aria-valuemax={Math.round(maxSplitSize * 100)} aria-valuenow={Math.round(effectiveSplitSize * 100)}
            title='左右拖动调整宽度，双击恢复均分'
            onDoubleClick={() => setSplitSize(clampSplitSize(0.5))}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
              event.preventDefault();
              setSplitSize(clampSplitSize(event.key === 'Home' ? 0.5 :
                effectiveSplitSize + (event.key === 'ArrowRight' ? 0.02 : -0.02)));
            }}>
            <span aria-hidden='true' />
          </div>
        )}
        panes={[
        <div className='session-timeline-column'>
          <Card className='session-panel session-timeline-panel' bordered={false}>
          <div className='session-panel-heading'>
            <h3>会话时序</h3>
            <Tag color='gray'>{total} 个数据包</Tag>
          </div>
          {error && <Alert type='error' content={error} />}
          <Spin loading={loading} className='session-timeline-spin'>
            <div className='session-timeline-list' aria-label='会话时序'>
              <div className='session-timeline-packets'>
          <Card className='session-summary' bordered={false} ref={summaryRef}>
            <div className='session-summary-heading'>
              <span className='session-eyebrow'>SESSION / {sessionId}</span>
              <div className='session-protocol-tags'>
                {transport && <Tag color='arcoblue'>{transport}</Tag>}
                {application && application !== transport && <Tag color='purple'>{application}</Tag>}
                {!transport && !application && <Tag>未知协议</Tag>}
              </div>
            </div>
            <div className='session-summary-endpoints'>
              <Endpoint label='端点一' ip={record.ip1} port={record.ip1_port} location={record.ip1_location} />
              <div className='session-summary-connection'>
                <span className='session-muted'>双向会话</span>
                <div className='session-summary-arrows' role='img' aria-label='蓝色：端点一到端点二；绿色：端点二到端点一'>
                  <div className='session-summary-direction is-forward' aria-hidden='true'><IconArrowRight /></div>
                  <div className='session-summary-direction is-backward' aria-hidden='true'><IconArrowRight /></div>
                </div>
                <span className='session-muted'>
                  {record.start_time && record.end_time ? calculateDuration(record.start_time, record.end_time) : '时长未知'}
                </span>
              </div>
              <Endpoint label='端点二' ip={record.ip2} port={record.ip2_port} location={record.ip2_location} />
            </div>
          </Card>

              {data.map((item, index) => {
                const forward = item.src_ip === record.ip1 &&
                  (record.ip1_port == null || String(item.src_port) === String(record.ip1_port));
                const protocol = item.protocol || '未知协议';
                const transportOnly = ['TCP', 'UDP', 'SCTP', 'ICMP', 'ICMPV6'].includes(protocol.toUpperCase());
                return (
                  <Card key={item.frame_number} hoverable role='button' tabIndex={0}
                    className={`session-packet-card ${forward ? 'is-forward' : 'is-backward'} ${currentRowId === item.frame_number ? 'is-selected' : ''}`}
                    aria-pressed={currentRowId === item.frame_number}
                    aria-label={`数据包 ${item.frame_number}，${protocol}，${item.len} 字节`}
                    onClick={() => selectPacket(item, index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectPacket(item, index);
                      }
                    }}>
                    <div className='session-packet-meta'>
                      <span className='session-frame-number'>{item.frame_number}</span>
                      <span className='session-packet-size'>{item.len} <small>B</small></span>
                    </div>
                    <div className='session-packet-content'>
                      <div className='session-packet-protocol'>
                        <Tag color={transportOnly ? 'arcoblue' : protocol === '未知协议' ? 'gray' : 'purple'} size='small'>{protocol}</Tag>
                        <span className='session-muted'>{transportOnly ? '网络 / 传输层' : protocol === '未知协议' ? '协议未识别' : '应用层协议'}</span>
                      </div>
                      <Typography.Text className='session-packet-info' title={item.info || '暂无数据包信息'}>{item.info || '暂无数据包信息'}</Typography.Text>
                    </div>
                  </Card>
                );
              })}
              </div>
              {!loading && !error && data.length === 0 && <Empty description='没有符合条件的数据包' />}
              {total > data.length && data.length > 0 && <div className='session-timeline-limit'>时序图显示前 {data.length} 个匹配包，其余可在右侧列表翻页查看。</div>}
            </div>
          </Spin>
          </Card>
        </div>,
        <Card className='session-panel session-packet-detail' bordered={false}>
          <div className='session-panel-heading'><h3>数据包列表与解析</h3><span className='session-muted'>保留原始顺序</span></div>
          <DataPacketPage key={`${sessionId}:${filterExpression}`} ref={packetPageRef}
            filterExpression={filterExpression} match={{ params: { type: 'detail', sessionId } }} />
        </Card>
      ]} />
    </div>
  );
}
