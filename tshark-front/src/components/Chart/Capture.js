import React, { useEffect, useState } from 'react';
import { Button, Card, Grid, Message, Typography } from '@arco-design/web-react';
import styles from '../../style/home.css'
import LineChart from './LineChart.js';
import { apiGet, apiPost } from '../../Api.ts';

function Carture({ type = '', onsubmit = null }){

    const [datas, setDatas] = useState({});
    const [loading,setLoading] = useState(false);
    let intervalId = null

    //监控网卡流量趋势
    const startMonitorAdaptersFlowTrend = async () => {
        try {
            await apiGet('/api/startMonitorAdapterFlowTrend');
        } catch (error) {
            Message.error(error?.response?.data?.msg || '启动网卡流量监控失败，请检查后端服务');
        }
    }
    //获取流量趋势数据
    const getAdaptersFlowTrendData = async () => {
        try {
            const res = await apiGet('/api/getAdapterFlowTrendData');
            setDatas(res?.data || {});
        } catch (error) {
            // Keep the last sample when a polling request fails.
        }
    }
    // 停止监控网卡流量趋势
    const stopMonitorAdaptersFlowTrend = async (item, type) => {
        if (type) {
            await startCapture(item);
            return;
        }
        try {
            await apiGet('/api/stopMonitorAdapterFlowTrend');
        } catch (error) {
            console.error('Failed to stop adapter monitoring:', error);
        }
    }
    //开始抓包
    const startCapture = async (key) => {
        setLoading(true);
        try {
            const stopped = await apiGet('/api/stopMonitorAdapterFlowTrend');
            if (String(stopped?.code) !== '200') {
                throw new Error(stopped?.msg || '停止网卡流量监控失败');
            }
            const res = await apiPost('/api/startCapture', {
                adapterName: key
            });
            if (String(res?.code) !== '200') {
                throw new Error(res?.msg || '启动抓包失败');
            }
            onsubmit?.(type);
        } catch (error) {
            Message.error(error?.response?.data?.msg || (error?.request ? '无法连接后端服务，请检查后端是否已启动' : error.message) || '启动抓包失败');
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        startMonitorAdaptersFlowTrend()
        intervalId = setInterval(getAdaptersFlowTrendData, 1000);
        return () => {
            if (intervalId !== null) {
                clearInterval(intervalId);
                stopMonitorAdaptersFlowTrend();
            }
        };
    }, [])

    return <Card style={{
                background: 'var(--color-fill-1)',
                maxHeight: 250,
                overflowY: 'auto',   // 当内容超出时，显示垂直滚动条
                overflowX: 'hidden', // 隐藏水平滚动条
            }}
            className='mb-[20px]'>
            {Object.entries(datas).map(([key, value]) => (
                <div className={`${styles['lines']} mb-[10px]`} key={key}>
                    <Grid.Row gutter={24} style={{ alignItems: 'end' }}>
                        <Grid.Col span={5}><Typography.Ellipsis showTooltip>{key}</Typography.Ellipsis></Grid.Col>
                        <Grid.Col span={16}><LineChart data={value} /></Grid.Col>
                        <Grid.Col span={3} style={{ textAlign: 'right' }}><Button type='primary' loading={loading} size={type ? 'small' : 'default'} onClick={() => stopMonitorAdaptersFlowTrend(key, 'cap')}>抓包</Button></Grid.Col>
                    </Grid.Row>
                </div>
            ))}
        </Card>;
}

export default Carture;
