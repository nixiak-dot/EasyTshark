import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Grid, Message, Spin, Typography, Upload } from '@arco-design/web-react';
import { useHistory } from 'react-router-dom';
import '../style/home.css'
import { apiGet, apiPost } from '../Api.ts';
import { IconFile, IconPlus, IconThunderbolt } from '@arco-design/web-react/icon';
import Capture from './Chart/Capture.js';

const HomePage = () => {
  const history = useHistory();
  const fileInputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [networkLoading, setNetworkLoading] = useState(false)
  const [data, setData] = useState([])
  const [cap, setCap] = useState(false)

  // 停止监控网卡流量趋势
  const stopMonitorAdaptersFlowTrend = async (item, type) => {
    await apiGet('/api/stopMonitorAdapterFlowTrend')
  }
  const onsubmit = () => {
    setCap(true)
    setLoading(true)
    history.push('/data/dataPacket/all')
  }

  const handleSelectFile = async () => {
    if (!window.electronAPI?.openFileDialog) {
      Message.error('请在 Electron 中运行')
      return
    }
    const selectedFilePath = await window.electronAPI.openFileDialog()
    if (!selectedFilePath) return
    setLoading(true)
    try {
      await apiGet('/api/stopMonitorAdapterFlowTrend')
      await apiPost('/api/analyseFile', { filePath: selectedFilePath })
      setCap(false)
      history.push('/data/dataPacket/all')
    } catch (error) {
      Message.error(error?.response?.data?.msg || '文件分析失败')
    } finally {
      setLoading(false)
    }
  }

  return <div>
    <Spin loading={loading} style={{ width: '100%' }} tip={`${cap ? '实时抓包' : '文件'}分析中...`}>
      <div className='home' style={{ padding: '30px 20%' }}>
        <Typography.Title heading={5} className='analysis-section-title'>
          <span className='analysis-section-icon' aria-hidden='true'><IconThunderbolt /></span>
          实时抓包分析
        </Typography.Title>
        {/* <Spin loading={networkLoading} block> */}
        <Capture onsubmit={onsubmit} />
        {/* </Spin> */}
        <Typography.Title heading={5} className='analysis-section-title'>
          <span className='analysis-section-icon' aria-hidden='true'><IconFile /></span>
          离线文件分析
        </Typography.Title>
        <div className='input-file' onClick={handleSelectFile} style={{height: 80, cursor: 'pointer'}}>
          <p><IconPlus style={{ fontSize: 22 }} /></p>
          <p>点击或拖拽文件到此处上传</p>
        </div>
      </div>
    </Spin>
  </div>
}

export default HomePage;
