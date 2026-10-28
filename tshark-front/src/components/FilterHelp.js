import React, { useId, useState } from 'react';
import '../style/settings.css';

export default function FilterHelp({ scope = 'packets' }) {
  const [visible, setVisible] = useState(false);
  const identifier = useId();
  const sessions = scope === 'sessions';
  return (
    <span className='filter-help' onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}
      onKeyDown={(event) => { if (event.key === 'Escape') setVisible(false); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setVisible(false); }}>
      <button type='button' className='filter-help-button' aria-label='筛选语法帮助'
        aria-expanded={visible} aria-controls={identifier} onFocus={() => setVisible(true)}
        onClick={() => setVisible(true)}>?</button>
      {visible && <div className='filter-help-panel' id={identifier} role='tooltip'>
        <strong>{sessions ? '会话' : '数据包'}筛选语法</strong>
        <p>简单搜索：输入 IP 或协议名称（如 <code>DNS</code>），模糊匹配地址和协议。</p>
        <p>精确条件：<code>字段=值</code>，支持 <code>=</code>、<code>==</code>、<code>!=</code>；协议名称不区分大小写。</p>
        <p>可用字段：<code>src.ip</code>、<code>dst.ip</code>、<code>src.port</code>、<code>dst.port</code>、<code>proto</code>。端口范围为 0–65535。</p>
        <p>组合条件：<code>&amp;&amp;</code> 表示同时满足，<code>||</code> 表示满足任一条件；可用括号分组，且 <code>&amp;&amp;</code> 优先于 <code>||</code>。</p>
        <p>示例：<code>src.ip=192.0.2.1 &amp;&amp; dst.port=53</code></p>
        <p>示例：<code>(proto=DNS || proto=MDNS) &amp;&amp; dst.ip!=192.0.2.2</code></p>
        <p>值含空格时可用双引号包裹；输入后按 Enter 或点击“筛选”，“清除”恢复全部数据。</p>
        <p>{sessions
          ? '会话中 src/dst 对应列表端点一/端点二（按首次观察方向），不保证是客户端/服务器；proto 匹配传输层或应用协议。'
          : '数据包中 src/dst 是该包的源/目的端点；proto 精确匹配列表协议列，proto=TCP 不包含标记为 HTTP 的包。'}</p>
        <p>这是本项目的筛选语法，不是 Wireshark 显示过滤器；暂不支持 http.host、tcp.port、网段、范围比较或 not 等语法。</p>
      </div>}
    </span>
  );
}
