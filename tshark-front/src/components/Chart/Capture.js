import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Message, Typography } from '@arco-design/web-react';
import { IconMinus, IconPlus, IconRefresh } from '@arco-design/web-react/icon';
import '../../style/home.css';
import LineChart from './LineChart.js';
import { apiGet, apiPost } from '../../Api.ts';

function assertSuccess(response, fallback) {
    if (String(response?.code) !== '200') {
        throw new Error(response?.msg || fallback);
    }
    return response;
}

function Capture({ type = '', onsubmit = null }) {
    const [adapters, setAdapters] = useState([]);
    const [datas, setDatas] = useState({});
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [monitoringReady, setMonitoringReady] = useState(false);
    const monitorGeneration = useRef(0);

    const getTrendData = async () => {
        const response = assertSuccess(await apiGet('/api/getAdapterFlowTrendData'), 'Unable to get adapter trends');
        setDatas(response?.data || {});
    };

    const startMonitor = async (adapterName) => {
        const query = new URLSearchParams({ adapterName }).toString();
        assertSuccess(await apiGet(`/api/startMonitorAdapterFlowTrend?${query}`), `Unable to monitor ${adapterName}`);
    };

    const refreshTrends = async (adapterList = adapters) => {
        setRefreshing(true);
        setMonitoringReady(false);
        try {
            assertSuccess(await apiGet('/api/stopMonitorAdapterFlowTrend'), 'Unable to stop trend monitors');
            const selectedAdapters = adapterList.filter((adapter) => adapter.selected);
            for (const adapter of selectedAdapters) {
                await startMonitor(adapter.name);
            }
            await getTrendData();
            setMonitoringReady(selectedAdapters.length > 0);
        } catch (error) {
            await apiGet('/api/stopMonitorAdapterFlowTrend').catch(() => {});
            Message.error(error?.response?.data?.msg || error.message || 'Unable to refresh adapter trends');
        } finally {
            setRefreshing(false);
        }
    };

    const addAdapter = async (adapterName) => {
        const selectedNames = adapters.filter((adapter) => adapter.selected).map((adapter) => adapter.name);
        selectedNames.push(adapterName);
        setLoading(true);
        try {
            assertSuccess(await apiPost('/api/settings/trendAdapters', { adapterNames: selectedNames }), 'Unable to save trend adapters');
            setAdapters((previous) => previous.map((adapter) =>
                adapter.name === adapterName ? { ...adapter, selected: true } : adapter));
            Message.success('Adapter added. Refresh trends to start monitoring.');
        } catch (error) {
            Message.error(error?.response?.data?.msg || error.message || 'Unable to save trend adapters');
        } finally {
            setLoading(false);
        }
    };

    const removeAdapter = async (adapterName) => {
        const nextAdapters = adapters.map((adapter) =>
            adapter.name === adapterName ? { ...adapter, selected: false } : adapter);
        const selectedNames = nextAdapters.filter((adapter) => adapter.selected).map((adapter) => adapter.name);
        setLoading(true);
        try {
            assertSuccess(await apiPost('/api/settings/trendAdapters', { adapterNames: selectedNames }), 'Unable to save trend adapters');
            setAdapters(nextAdapters);
            await refreshTrends(nextAdapters);
        } catch (error) {
            Message.error(error?.response?.data?.msg || error.message || 'Unable to remove trend adapter');
        } finally {
            setLoading(false);
        }
    };

    const startCapture = async (adapterName) => {
        setLoading(true);
        setMonitoringReady(false);
        try {
            assertSuccess(await apiGet('/api/stopMonitorAdapterFlowTrend'), 'Unable to stop trend monitors');
            assertSuccess(await apiPost('/api/startCapture', { adapterName }), 'Unable to start capture');
            onsubmit?.(type);
        } catch (error) {
            Message.error(error?.response?.data?.msg || (error?.request
                ? 'Cannot connect to the backend service' : error.message) || 'Unable to start capture');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const generation = ++monitorGeneration.current;
        let active = true;
        const initialize = async () => {
            try {
                const response = assertSuccess(await apiGet('/api/getNetworkAdapters'), 'Unable to get network adapters');
                const adapterList = response?.data?.adapters || [];
                if (!active) return;
                setAdapters(adapterList);
                for (const adapter of adapterList.filter((item) => item.selected)) {
                    if (!active) return;
                    await startMonitor(adapter.name);
                }
                if (active) {
                    await getTrendData();
                    setMonitoringReady(adapterList.some((adapter) => adapter.selected));
                }
            } catch (error) {
                if (active) Message.error(error?.response?.data?.msg || error.message || 'Unable to load adapter trends');
            }
        };
        const initialization = initialize();
        return () => {
            active = false;
            initialization.finally(() => {
                if (monitorGeneration.current !== generation) return;
                apiGet('/api/stopMonitorAdapterFlowTrend').catch((error) => {
                    console.error('Failed to stop adapter monitoring:', error);
                });
            });
        };
    }, []);

    useEffect(() => {
        if (!monitoringReady || refreshing || !adapters.some((adapter) => adapter.selected)) return undefined;
        const intervalId = setInterval(() => {
            getTrendData().catch((error) => console.error('Failed to refresh adapter trends:', error));
        }, 1000);
        return () => clearInterval(intervalId);
    }, [adapters, monitoringReady, refreshing]);

    const orderedAdapters = [...adapters].sort((left, right) => Number(right.selected) - Number(left.selected));

    return (
        <Card className='adapter-trend-panel mb-[20px]'>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <Typography.Text type='secondary' style={{ fontSize: 12 }}>拖动右下角调整大小</Typography.Text>
                <Button aria-label="Refresh trends" icon={<IconRefresh />} loading={refreshing} disabled={loading || refreshing}
                    onClick={() => refreshTrends()}>{'\u5237\u65b0\u8d8b\u52bf'}</Button>
            </div>
            {orderedAdapters.map((adapter) => {
                const trendData = datas[adapter.name] || [];
                return (
                    <div className={`adapter-trend-row${adapter.selected ? ' adapter-trend-row-selected' : ''}`}
                        key={adapter.name} data-adapter-name={adapter.name}>
                        <div className='adapter-trend-name'><Typography.Ellipsis showTooltip>{adapter.name}</Typography.Ellipsis></div>
                        <div className='adapter-trend-chart'>{adapter.selected ? <LineChart data={trendData} /> :
                            <span className='adapter-trend-placeholder'>未加入趋势监听</span>}</div>
                        <div className='adapter-trend-action'>
                                {adapter.selected ? (
                                    <>
                                        <Button type='primary' loading={loading} disabled={refreshing}
                                            size={type ? 'small' : 'default'}
                                            title={`在 ${adapter.name} 上抓包`}
                                            onClick={() => startCapture(adapter.name)}>{'\u6293\u5305'}</Button>
                                        <Button aria-label={`Remove ${adapter.name} from trend monitoring`}
                                            title={`将 ${adapter.name} 移出趋势监听`} disabled={loading || refreshing}
                                            size={type ? 'small' : 'default'} icon={<IconMinus />}
                                            onClick={() => removeAdapter(adapter.name)} />
                                    </>
                                ) : (
                                    <Button aria-label={`Add ${adapter.name} to trend monitoring`} title={`将 ${adapter.name} 加入趋势监听`}
                                        disabled={loading || refreshing} size={type ? 'small' : 'default'}
                                        icon={<IconPlus />} onClick={() => addAdapter(adapter.name)} />
                                )}
                        </div>
                    </div>
                );
            })}
        </Card>
    );
}

export default Capture;
