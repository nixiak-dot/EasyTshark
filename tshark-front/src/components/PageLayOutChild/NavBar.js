import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Button, Message, Popover } from '@arco-design/web-react';
import { IconPlayCircle, IconHome, IconRecordStop, IconFile, IconSave } from '@arco-design/web-react/icon';
import '../../style/global.css';
import { apiGet, apiPost } from '../../Api.ts';
import Capture from '../Chart/Capture.js';

const STATUS_IDLE = 0;
const STATUS_ANALYSIS_FILE = 1;
const STATUS_CAPTURING = 2;
const STATUS_MONITORING = 3;

function NavBar() {
  const [stopLoading, setStopLoading] = useState(false);
  const [workStatus, setWorkStatus] = useState(STATUS_IDLE);
  const [visible, setVisible] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const history = useHistory();

  const checkStatus = async () => {
    const data = await apiGet('/api/getWorkStatus');
    setWorkStatus(data?.data?.status ?? data?.status ?? STATUS_IDLE);
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const stopCapture = async () => {
    setStopLoading(true);
    try {
      await apiPost('/api/stopCapture');
      Message.info('停止抓包');
      await checkStatus();
    } finally {
      setStopLoading(false);
    }
  };

  const analysisFile = async () => {
    if (!window.electronAPI?.openFileDialog) {
      Message.error('请在 Electron 中运行');
      return;
    }
    const filePath = await window.electronAPI.openFileDialog();
    if (!filePath) return;
    setFileLoading(true);
    try {
      await apiGet('/api/stopMonitorAdapterFlowTrend');
      await apiPost('/api/analyseFile', { filePath });
      Message.success('文件分析完成');
      history.push('/data/dataPacket/all');
      await checkStatus();
    } catch (error) {
      Message.error(error?.response?.data?.msg || '文件分析失败');
    } finally {
      setFileLoading(false);
    }
  };

  const saveFile = async () => {
    if (!window.electronAPI?.showSavePath) {
      Message.error('请在 Electron 中运行');
      return;
    }
    try {
      const settings = await apiGet('/api/settings');
      if (String(settings?.code) !== '200' || !settings.data?.configured) throw new Error('请先完成路径设置');
      const savePath = await window.electronAPI.showSavePath(settings.data.values.pcapDirectory);
      if (!savePath) return;
      const result = await apiPost('/api/savePacket', { savePath });
      if (String(result?.code) !== '200') throw new Error(result?.msg || '文件保存失败');
      Message.success('文件保存完成');
    } catch (error) {
      Message.error(error?.response?.data?.msg || error.message || '文件保存失败');
    }
  };

  return (
    <div id="nav-bar" style={{ padding: 20, display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button type="primary" onClick={() => history.push('/')} status="warning" icon={<IconHome />} disabled={workStatus !== STATUS_IDLE}>首页</Button>
      <Popover
        title="实时抓包分析"
        trigger="click"
        popupVisible={visible}
        overlayStyle={{ width: '800px', maxWidth: '90vw' }}
        onVisibleChange={setVisible}
        content={<div style={{ width: '100%', minHeight: '200px' }}><Capture type="home" onsubmit={() => setVisible(false)} /></div>}
      >
        <Button type="primary" icon={<IconPlayCircle />} disabled={[STATUS_ANALYSIS_FILE, STATUS_CAPTURING].includes(workStatus)}>开始抓包</Button>
      </Popover>
      <Button type="primary" status="danger" onClick={stopCapture} loading={stopLoading} icon={<IconRecordStop />} disabled={[STATUS_ANALYSIS_FILE, STATUS_MONITORING].includes(workStatus)}>停止抓包</Button>
      <Button type="primary" onClick={analysisFile} loading={fileLoading} icon={<IconFile />} disabled={workStatus !== STATUS_IDLE}>分析文件</Button>
      <Button type="primary" onClick={saveFile} icon={<IconSave />} disabled={workStatus !== STATUS_IDLE}>保存文件</Button>
    </div>
  );
}

export default NavBar;
