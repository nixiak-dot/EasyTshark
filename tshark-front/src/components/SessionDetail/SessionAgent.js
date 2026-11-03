import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Space, Spin, Tag } from '@arco-design/web-react';
import { sessionAgentApi } from './sessionAgentApi';
import '../../style/session-agent.css';

export default function SessionAgent({ sessionId }) {
  const [settings, setSettings] = useState({ baseUrl: '', model: '', apiKey: '' });
  const [configured, setConfigured] = useState(false);
  const [editing, setEditing] = useState(true);
  const [consent, setConsent] = useState(false);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coverage, setCoverage] = useState(null);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const modalRef = useRef(null);
  const endRef = useRef(null);
  const api = sessionAgentApi();

  useEffect(() => {
    const generation = ++generationRef.current;
    api.agentSettings().then((current) => {
      if (generation !== generationRef.current) return;
      setSettings({ baseUrl: current.baseUrl, model: current.model, apiKey: '' });
      setConfigured(Boolean(current.baseUrl && current.model));
      setEditing(!current.baseUrl || !current.model);
    }).catch((failure) => {
      if (generation === generationRef.current) setError(failure.message || '无法读取模型配置。');
    });
    return () => {
      generationRef.current += 1;
      modalRef.current?.close();
      api.agentCancel().catch(() => {});
    };
  }, [sessionId, api]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages, loading]);

  const save = async () => {
    try {
      const saved = await api.agentSettings({ ...settings, ...(settings.apiKey ? {} : { apiKey: undefined }) });
      setSettings({ baseUrl: saved.baseUrl, model: saved.model, apiKey: '' });
      setConfigured(true);
      setConsent(false);
      setEditing(false);
      setError('');
    } catch (failure) { setError(failure.message || '配置保存失败，请检查服务地址、模型和密钥格式。'); }
  };
  const send = async (text) => {
    if (busyRef.current || !configured || !text.trim()) return;
    if (!consent) {
      if (modalRef.current) return;
      modalRef.current = Modal.confirm({
        title: '确认发送网络证据',
        content: `将问题及 AI 按需获取的本会话端点、精简 info 和协议字段发送到 ${settings.baseUrl}（${settings.model}）。可能包含敏感信息，不发送完整载荷。取消不会发送，本次会话确认后无需重复确认。`,
        okText: '同意并发送', cancelText: '暂不发送',
        onOk: () => { modalRef.current = null; setConsent(true); execute(text); },
        onCancel: () => { modalRef.current = null; },
      });
      return;
    }
    execute(text);
  };
  const execute = async (text) => {
    if (busyRef.current) return;
    const generation = generationRef.current;
    busyRef.current = true;
    setLoading(true);
    setError('');
    setQuestion('');
    setMessages((previous) => [...previous, { role: 'user', content: text }]);
    try {
      const result = await api.agentChat({ sessionId: Number(sessionId), text, reset: messages.length === 0,
        provider: { baseUrl: settings.baseUrl, model: settings.model } });
      if (generation !== generationRef.current) return;
      if (!result.ok) throw new Error(result.error);
      setCoverage(result.coverage);
      setMessages((previous) => [...previous, { role: 'assistant', content: result.answer,
        meta: [...result.actions, result.usageTokens ? `本轮累计 ${result.usageTokens} tokens` : ''].filter(Boolean).join(' · ') }]);
    } catch (failure) {
      if (generation === generationRef.current) { setError(failure.message || '分析失败，请重试。'); setQuestion(text); }
    } finally {
      busyRef.current = false;
      if (generation === generationRef.current) setLoading(false);
    }
  };

  return (
    <section className='session-agent-page' aria-label={`会话 ${sessionId} 分析助手`}>
      <div className='session-agent-layout'>
        <div className='session-agent-settings'>
          <Space wrap><Tag color='arcoblue'>只读 · 会话 #{sessionId}</Tag>
            <Button size='small' disabled={loading} onClick={() => setEditing(!editing)}>模型配置</Button>
            <Button size='small' disabled={loading || !messages.length} onClick={() => { setMessages([]); setCoverage(null); setError(''); }}>新对话 / 刷新证据</Button>
          </Space>
          {editing && <div className='session-agent-form'>
            <label>模型服务 Base URL<Input aria-label='模型服务 Base URL' placeholder='https://服务地址/v1' value={settings.baseUrl} onChange={(baseUrl) => setSettings({ ...settings, baseUrl })} /></label>
            <label>模型名称<Input aria-label='模型名称' placeholder='支持工具调用的模型 ID' value={settings.model} onChange={(model) => setSettings({ ...settings, model })} /></label>
            <label>API Key<Input.Password aria-label='API Key' autoComplete='off' placeholder='保存到本机配置文件；留空保留已保存的密钥' value={settings.apiKey} onChange={(apiKey) => setSettings({ ...settings, apiKey })} /></label>
            <Button onClick={save} disabled={loading}>应用模型配置</Button>
            <small>兼容 Chat Completions 工具调用接口。配置自动保存，下次启动自动读取；API Key 明文保存在本机配置文件，不回显到页面，请勿分享该文件。</small>
          </div>}
          <small>首次发送时确认数据发送目标；AI 仅按问题需要读取精简证据，不发送完整抓包载荷。</small>
          {coverage && <small>本地快照：{coverage.loaded}/{coverage.total} 包{coverage.partial ? '，仅部分覆盖' : ''}。新对话可刷新证据。</small>}
        </div>
        <div className='session-agent-messages' role='log' aria-label='会话分析对话'>
          {!messages.length && <p>请直接描述你想了解的问题。助手会先理解需求，再决定是否需要查看会话摘要、数据包片段或协议字段，只回答与你的问题有关的内容。</p>}
          {messages.map((message, index) => <article key={index} className={`session-agent-message ${message.role}`}>
            <strong>{message.role === 'user' ? '你' : '分析助手'}</strong><div>{message.content}</div>{message.meta && <small>{message.meta}</small>}
          </article>)}
          {loading && <Spin tip='正在理解问题并按需分析…' />}
          <div ref={endRef} />
        </div>
        {error && <Alert type='error' content={error} />}
        <div className='session-agent-composer'>
          <Input.TextArea aria-label='向会话助手提问' value={question} onChange={setQuestion} maxLength={2000} autoSize={{ minRows: 2, maxRows: 4 }} placeholder='你希望了解这个会话的什么问题？' disabled={loading} />
          <Space><Button type='primary' disabled={loading || !configured || !question.trim()} onClick={() => send(question)}>发送</Button>
            {loading && <Button onClick={() => api.agentCancel().catch(() => setError('停止失败，请稍后重试。'))}>停止</Button>}</Space>
        </div>
      </div>
    </section>
  );
}
