import React, { useState, useEffect, useRef} from 'react';
import "../../style/global.css"
import {  Grid ,Tag, Typography } from '@arco-design/web-react';
import { calculateDuration } from '../../util.ts'
import { apiPost } from '../../Api.ts';
import DataPacketPage from '../DataPacketPage.js';


const { Ellipsis } = Typography


function SessionTimeGraphTab({sessionId}) {

    const [data, setData] = useState([])
    const [currentRowId, setCurrentRowId] = useState([1])
    const [record, setRecord] = useState(JSON.parse(localStorage.getItem(`row${sessionId}`)))
    const DataPacketPageRef = useRef(null);

    const loadTimeGraph = async () => {
        const _data = await apiPost('/api/queryPacket', {
            pageSize: 100,
            pageNum: 1,
            session_id: parseInt(sessionId)
        });
    
        setData(_data.data);
        if (_data.data && _data.data.length > 0) {
            setCurrentRowId(_data.data[0].frame_number);
        }
    }

    useEffect(() => {
        loadTimeGraph()
    }, [])
    

    return (
        <div style={{ margin: 20 }} className='details'>
            <div style={{ margin: '0 10px 10px 10px' }}>
                <Grid.Row gutter={24} style={{ flexFlow: 'nowrap' }}>
                    <Typography.Paragraph style={{ minWidth: 450 }}>
                    <Grid.Col span={14} className='details-col'>
                      <div className='first-col'>
                        {/* IP1 信息 */}
                        <div style={{ width: 180, flexShrink: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-1)' }}>
                            <Typography.Ellipsis showTooltip>{record.ip1}:{record.ip1_port}</Typography.Ellipsis>
                          </div>
                          <Ellipsis showTooltip style={{ fontSize: '11px', color: 'var(--color-text-3)', marginTop: '2px' }}>
                            {record.ip1_location}
                          </Ellipsis>
                        </div>

                        {/* 中间协议信息 */}
                        <div style={{ textAlign: 'center', padding: '0 10px', flexShrink: 0 }}>
                          <div className='arrow'>
                            <span className="proto" style={{ display: 'block', marginBottom: '4px' }}>
                              <Tag 
                                bordered 
                                color='arcoblue' 
                                size='small'
                                style={{ fontSize: '11px', padding: '0 6px', height: '20px' }}
                              >
                                {record.app_proto || record.trans_proto}
                              </Tag>
                            </span>
                            <span className="icon"></span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-3)', marginTop: '3px', display: 'inline-block' }}>
                            {calculateDuration(record.start_time, record.end_time)}
                          </span>
                        </div>

                        {/* IP2 信息 */}
                        <div style={{ width: 180, flexShrink: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-1)' }}>
                            <Typography.Ellipsis showTooltip>{record.ip2}:{record.ip2_port}</Typography.Ellipsis>
                          </div>
                          <Ellipsis showTooltip style={{ fontSize: '11px', color: 'var(--color-text-3)', marginTop: '2px' }}>
                            {record.ip2_location}
                          </Ellipsis>
                        </div>
                      </div>

                      {/* 数据包列表 */}
                      {data.map((item, index) => {
                        const isInbound = item.src_ip === record.ip1;
                        const timeOffset = index === 0 
                          ? '0.000000' 
                          : ((item.timestamp - data[0].timestamp).toFixed(6));

                        return (
                          <div 
                            key={item.frame_number}
                            className={`box ${currentRowId === item.frame_number ? 'selected' : ''}`}
                            onClick={() => (
                              setCurrentRowId(item.frame_number),
                              DataPacketPageRef.current?.setCurrentRowId(item.frame_number)
                              
                            )}
                          >
                            {/* 左侧：序号和时间 */}
                            <div className="left-section">
                              <div className="frame-number">{item.frame_number}</div>
                              <div className="time-offset">{timeOffset}s</div>
                            </div>

                            {/* 中间：箭头 */}
                            <div className="arrow-section">
                              <div className={`arrow ${isInbound ? 'arrow-left' : 'arrow-right'}`}>
                                <span className="icon"></span>
                                <div className="port-direction">
                                  {isInbound ? `${record.ip1_port} ← ${record.ip2_port}` : `${record.ip2_port} → ${record.ip1_port}`}
                                </div>
                              </div>
                            </div>

                            {/* 右侧：数据包信息 */}
                            <div className="packet-info-section">
                              <div className="flex items-center">
                                <div className="packet-length">{item.len} B</div>
                                <Typography.Ellipsis showTooltip className="packet-info">
                                  {item.info}
                                </Typography.Ellipsis>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </Grid.Col>
                    </Typography.Paragraph>
                    <Grid.Col span={17} style={{ marginTop: -10, flexGrow: 1 }}>
                        <DataPacketPage
                          ref={DataPacketPageRef}
                          match={{
                            params:{
                                type:"detail",
                                sessionId: sessionId
                            }
                          }}
                        ></DataPacketPage>
                    </Grid.Col>
                </Grid.Row>
                </div>
            </div>
    )
    
}


export default SessionTimeGraphTab