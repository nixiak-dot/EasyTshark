import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Divider, Form, Input, Modal, Space, Typography } from '@arco-design/web-react';
import { apiGet, apiPost } from '../Api.ts';
import { IconSettings, IconFolder, IconFile, IconLock } from '@arco-design/web-react/icon';
import '../style/settings.css';

const fields = [
  { name: 'tsharkPath', label: 'TShark 可执行文件', placeholder: '选择 Wireshark 安装目录中的 tshark.exe', hint: '用于抓包、协议识别和数据包详情解析。', required: true },
  { name: 'editcapPath', label: 'Editcap 可执行文件', placeholder: '选择 Wireshark 安装目录中的 editcap.exe', hint: '用于抓包格式转换，通常与 tshark.exe 位于同一目录。', required: true },
  { name: 'pcapDirectory', label: '抓包保存目录', placeholder: '选择保存抓包文件的文件夹', hint: '保存实时抓包和离线分析副本；手动输入的新目录会在保存时创建。', required: true },
  { name: 'tlsKeyLogPath', label: 'TLS 密钥日志文件（可选）', placeholder: '选择日志文件，或指定未来保存的位置', hint: '可选择已有文件，也可指定新文件名；不会创建或覆盖文件。', required: false },
];

export function suggestedSettingsPath(field, values) {
  if (values[field]) return values[field];
  if (field === 'editcapPath' && values.tsharkPath) return values.tsharkPath.replace(/[^\\/]+$/, 'editcap.exe');
  if (field === 'tsharkPath' && values.editcapPath) return values.editcapPath.replace(/[^\\/]+$/, 'tshark.exe');
  if (field === 'tlsKeyLogPath' && values.pcapDirectory) {
    return values.pcapDirectory.replace(/[\\/]+$/, '') + '/tls-keys.log';
  }
  return '';
}

function checkedData(response) {
  if (String(response?.code) !== '200' || !response?.data?.values) {
    throw new Error(response?.msg || '无法读取路径设置');
  }
  return response.data;
}

export function SettingsPanel({ settings, required, preparing = false, loadingError = '', onSaved, onCancel }) {
  const [values, setValues] = useState(settings.values);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState('');
  const panelRef = useRef(null);
  const busy = saving || preparing || Boolean(picking);

  useEffect(() => { setValues(settings.values); }, [settings]);
  useEffect(() => {
    if (!preparing) panelRef.current?.querySelector('input')?.focus();
  }, [preparing]);

  const choosePath = async (field) => {
    if (busy) return;
    setError('');
    setPicking(field);
    try {
      const initialPath = suggestedSettingsPath(field, values);
      let selected;
      if (window.electronAPI?.selectSettingsPath) {
        selected = await window.electronAPI.selectSettingsPath(field, initialPath);
      } else {
        const response = await apiPost('/api/settings/selectPath', { field, currentPath: initialPath });
        if (String(response?.code) !== '200' || typeof response?.data?.path !== 'string') {
          throw new Error(response?.msg || '无法打开系统选择窗口，请确认本机后端已更新并启动');
        }
        selected = response.data.canceled ? null : response.data.path;
      }
      if (selected) setValues((previous) => ({ ...previous, [field]: selected }));
    } catch (failure) {
      setError(failure?.response?.data?.msg || failure.message || '无法打开路径选择窗口，请手动输入或重试');
    } finally {
      setPicking('');
    }
  };

  const save = async (event) => {
    event?.preventDefault?.();
    if (busy) return;
    setError('');
    setSaving(true);
    try {
      const result = checkedData(await apiPost('/api/settings', values));
      if (!result.configured) throw new Error('配置尚未有效，请检查路径');
      onSaved(result);
    } catch (failure) {
      setError(failure?.response?.data?.msg || failure.message || '保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field) => (
    <Form.Item key={field.name} label={field.label} required={field.required}
      extra={<span id={`settings-hint-${field.name}`}>{field.hint}</span>}>
      <div className='settings-path-input'>
        <Input id={`settings-${field.name}`} aria-label={field.label} value={values[field.name] || ''}
          required={field.required} disabled={busy}
          prefix={field.name === 'pcapDirectory' ? <IconFolder /> : field.name === 'tlsKeyLogPath' ? <IconLock /> : <IconFile />}
          placeholder={field.placeholder} title={values[field.name] || ''}
          autoComplete='off' spellCheck={false} aria-describedby={`settings-hint-${field.name}`}
          onChange={(value) => setValues((previous) => ({ ...previous, [field.name]: value }))} />
        <Button disabled={busy} loading={picking === field.name} icon={<IconFolder />}
          onClick={() => choosePath(field.name)} aria-label={`浏览${field.label}`}>
          {picking === field.name ? '选择中…' : field.name === 'pcapDirectory' ? '选择文件夹' : '选择文件'}
        </Button>
      </div>
    </Form.Item>
  );

  const submit = () => {
    const form = panelRef.current?.querySelector('form');
    if (form?.reportValidity()) save();
  };

  return (
    <Modal visible title='路径设置' className='settings-modal'
      style={{ width: 680, maxWidth: 'calc(100vw - 32px)' }} maskClosable={false}
      closable={false} escToExit={!required && !busy} focusLock autoFocus
      onCancel={() => { if (!required && !busy) onCancel?.(); }}
      footer={<Space>
        {!required && <Button disabled={busy} aria-label='关闭设置' onClick={onCancel}>取消</Button>}
        <Button type='primary' disabled={busy} loading={saving} onClick={submit}>保存设置</Button>
      </Space>}>
      <div ref={panelRef}>
        <Typography.Paragraph type='secondary'>
          {required ? '首次使用，请配置分析工具和抓包保存位置。' : '修改分析工具与存储位置，保存后生效。'} 可通过系统窗口选择，也可直接输入路径。
        </Typography.Paragraph>
        <Form layout='vertical' onSubmit={() => save()}>
          {settings.errors?.map((message, index) => <Alert type='warning' content={message} key={index} />)}
          {preparing && <p className='settings-progress' role='status'>正在读取设置并停止网卡预览监控…</p>}
          {picking && <p className='settings-progress' role='status'>正在等待系统窗口选择；如果窗口未在前台，请查看任务栏。</p>}
          {loadingError && <Alert type='error' content={loadingError} />}
          <Divider orientation='left'>分析工具</Divider>
          {fields.slice(0, 2).map(renderField)}
          <Divider orientation='left'>本地存储</Divider>
          {fields.slice(2).map(renderField)}
          <div className='settings-note'><IconLock aria-hidden='true' /><Typography.Text>密钥日志目前仅保存路径，不会设置 SSLKEYLOGFILE、创建密钥日志或启用 HTTPS 解密。更改配置前，请先停止抓包或文件分析。</Typography.Text></div>
          {error && <Alert type='error' content={error} />}
          <div className='settings-persistence'>配置文件：<code>{settings.configPath}</code></div>
        </Form>
      </div>
    </Modal>
  );
}

export default function Settings({ children }) {
  const [settings, setSettings] = useState(null);
  const [visible, setVisible] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    apiGet('/api/settings').then((response) => {
      if (!active) return;
      const data = checkedData(response);
      setSettings(data);
      setVisible(!data.configured);
    }).catch((failure) => {
      if (active) setError(failure.message || '无法连接后端，请确认服务已启动');
    });
    return () => { active = false; };
  }, [attempt]);

  const open = async () => {
    setVisible(true);
    setPreparing(true);
    setError('');
    try {
      const response = await apiGet('/api/getWorkStatus');
      if (response?.data?.status === 3) {
        const stopped = await apiGet('/api/stopMonitorAdapterFlowTrend');
        if (String(stopped?.code) !== '200') throw new Error(stopped?.msg || '停止网卡预览监控失败');
      }
      setSettings(checkedData(await apiGet('/api/settings')));
    } catch (failure) {
      setError(failure.message || '读取设置失败');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <div className='settings-toolbar'><Button icon={<IconSettings />} onClick={open} disabled={!settings || preparing}>路径设置</Button></div>
      {error && !visible && <div role='alert' className='settings-connection-error'>{error} <Button onClick={() => setAttempt((value) => value + 1)}>重试</Button></div>}
      {!settings && !error && <p role='status'>正在读取路径配置…</p>}
      {settings?.configured && !visible && children}
      {settings && visible && <SettingsPanel settings={settings} required={!settings.configured} preparing={preparing} loadingError={error}
        onCancel={() => setVisible(false)} onSaved={(saved) => { setSettings(saved); setVisible(false); setError(''); }} />}
    </>
  );
}
