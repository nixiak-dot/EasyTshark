class ServiceRequestError extends Error {}

function connectionReason(error) {
  const pending = [error];
  const codes = new Set();
  const visited = new Set();
  while (pending.length && visited.size < 24) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (typeof current.code === 'string') codes.add(current.code);
    pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors.slice(0, 12));
  }
  const reasons = [
    [['ENOTFOUND', 'EAI_AGAIN'], '域名解析失败，请检查域名、DNS 或网络连接'],
    [['ECONNREFUSED'], '连接被拒绝，请检查服务是否启动及端口是否正确'],
    [['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'], '连接或响应超时，请检查网络、代理和服务状态'],
    [['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_UNTRUSTED', 'ERR_TLS_CERT_ALTNAME_INVALID'], 'HTTPS 证书验证失败，请检查证书链、域名及本机时间'],
    [['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'], '连接被中断，请检查服务、代理或网络连接'],
    [['ENETUNREACH', 'EHOSTUNREACH'], '目标网络不可达，请检查网络路由或代理'],
  ];
  for (const [knownCodes, message] of reasons) {
    const code = knownCodes.find((candidate) => codes.has(candidate));
    if (code) return `${message}（${code}）`;
  }
  return '网络连接失败，未获得有效响应；请检查地址、网络、代理或 HTTPS 证书';
}

async function requestJson(service, address, options) {
  const url = new URL(address);
  const target = `${url.origin}${url.pathname}`;
  const location = `请求地址：${target}`;
  try {
    const response = await fetch(address, options);
    if (!response.ok) {
      await response.body?.cancel();
      const hints = {
        400: '请求参数不被接受，请核对模型 ID、工具调用支持及接口要求',
        401: '认证失败，请检查 API Key 是否有效',
        403: '访问被拒绝，请检查账号、模型权限或服务访问限制',
        404: '接口或模型不存在，请核对 Base URL 的路径前缀和模型 ID',
        405: '接口不接受 POST 请求，请核对接口路径',
        429: '请求受限，请检查调用频率、余额或额度',
      };
      const hint = hints[response.status] || (response.status >= 500 ? '服务端异常，请稍后重试或检查服务状态' : '请求未成功，请核对接口配置');
      throw new ServiceRequestError(`${service}请求失败（HTTP ${response.status}）：${hint}。\n${location}`);
    }
    const raw = await response.text();
    if (service === '模型服务' && raw.length > 256000) throw new ServiceRequestError(`模型响应过大。\n${location}`);
    try {
      return JSON.parse(raw);
    } catch {
      throw new ServiceRequestError(`${service}返回的不是有效 JSON，可能指向网页、错误接口或网关页面。\n${location}`);
    }
  } catch (error) {
    if (options?.signal?.aborted || error instanceof ServiceRequestError) throw error;
    throw new ServiceRequestError(`${service}：${connectionReason(error)}。\n${location}`);
  }
}

module.exports = { requestJson, ServiceRequestError, connectionReason };
