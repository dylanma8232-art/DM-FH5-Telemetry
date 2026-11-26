/**
 * 统一 OpenAI 兼容大模型客户端与配置解析服务。
 *
 * 同时兼容通用变量 (AI_* / OPENAI_*) 与历史阿里云百炼变量 (DASHSCOPE_*)，
 * 并支持本地免密钥服务（如 Ollama / LM Studio）及推理模型的容错处理。
 */

export const DEFAULT_AI_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DEFAULT_AI_MODEL = 'qwen3.7-plus';

export function normalizeBaseUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return DEFAULT_AI_BASE_URL;
  return trimmed
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/+$/, '');
}

export function isLocalAiEndpoint(rawUrl) {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(normalizeBaseUrl(rawUrl));
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

export function getAiConfig() {
  const apiKey = (
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    ''
  ).trim();
  const baseUrl = normalizeBaseUrl(
    process.env.AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.DASHSCOPE_BASE_URL ||
    DEFAULT_AI_BASE_URL
  );
  const model = (
    process.env.AI_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.DASHSCOPE_MODEL ||
    DEFAULT_AI_MODEL
  ).trim() || DEFAULT_AI_MODEL;

  return { apiKey, baseUrl, model };
}

export function isAiConfigured() {
  const { apiKey, baseUrl } = getAiConfig();
  return Boolean(apiKey) || isLocalAiEndpoint(baseUrl);
}

export function stripThinkingTags(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export function parseJsonFromAiContent(content) {
  const cleaned = stripThinkingTags(content)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

async function readErrorMessage(response) {
  let detail = '';
  try {
    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.error?.message || parsed?.message || text;
      } catch {
        detail = text;
      }
    }
  } catch {
    detail = '';
  }
  return detail || response.statusText || `HTTP ${response.status}`;
}

export function resolveAiConfig(overrides = {}) {
  const base = getAiConfig();
  const givenKey = typeof overrides.apiKey === 'string' ? overrides.apiKey.trim() : '';
  const looksMasked = givenKey.includes('*');
  const apiKey = givenKey && !looksMasked ? givenKey : base.apiKey;
  const baseUrl = overrides.baseUrl ? normalizeBaseUrl(overrides.baseUrl) : base.baseUrl;
  const model = (typeof overrides.model === 'string' && overrides.model.trim()) || base.model;
  return { apiKey, baseUrl: baseUrl || DEFAULT_AI_BASE_URL, model: model || DEFAULT_AI_MODEL };
}

export async function callChatCompletion({
  messages,
  temperature,
  jsonMode = false,
  config = null,
  timeoutMs = 0,
  fetchImpl = fetch
}) {
  const { apiKey, baseUrl, model } = config || getAiConfig();
  const isLocal = isLocalAiEndpoint(baseUrl);

  if (!apiKey && !isLocal) {
    const err = new Error('尚未配置 AI 密钥，请先在设置中填写 API 密钥或接入本地模型。');
    err.status = 403;
    err.code = 'api_key_missing';
    throw err;
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey || 'ollama'}`
  };

  const buildBody = (withJsonMode, withTemperature) => {
    const body = { model, messages };
    if (withTemperature && temperature !== undefined) body.temperature = temperature;
    if (withJsonMode) body.response_format = { type: 'json_object' };
    return JSON.stringify(body);
  };

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const signal = controller?.signal;

  const send = (body) => fetchImpl(endpoint, { method: 'POST', headers, body, ...(signal ? { signal } : {}) });

  try {
    let response = await send(buildBody(jsonMode, true));

    // 部分推理模型或本地网关不支持 response_format / temperature，遇到 400/422 时降级重试一次
    if (!response.ok && (response.status === 400 || response.status === 422) && (jsonMode || temperature !== undefined)) {
      response = await send(buildBody(false, false));
    }

    if (!response.ok) {
      const detail = await readErrorMessage(response);
      const err = new Error(`AI 请求失败（${response.status}）：${detail}`);
      err.status = response.status;
      throw err;
    }

    const json = await response.json();
    const rawContent = json?.choices?.[0]?.message?.content || '';
    return {
      content: rawContent,
      raw: json,
      model: json?.model || model,
      baseUrl
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`AI 接口响应超时（超过 ${Math.round(timeoutMs / 1000)} 秒），请检查端点地址或网络。`);
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    // 网络层错误（DNS 不通、拒绝连接、端口未监听等）统一转成可读提示
    if (err?.status === undefined && (err instanceof TypeError || err?.name === 'FetchError' || /fetch failed|network/i.test(err?.message || ''))) {
      const cause = err?.cause?.code || err?.cause?.message || '';
      const hint = /ECONNREFUSED/i.test(cause)
        ? '目标端口拒绝连接，本地模型服务可能尚未启动'
        : /ENOTFOUND|EAI_AGAIN/i.test(cause)
          ? '域名无法解析，请检查端点地址是否正确'
          : /CERT|SSL|TLS/i.test(cause)
            ? '证书校验失败，请检查端点是否为可信地址'
            : cause || '请检查端点地址、网络连通性与服务是否已启动';
      const netErr = new Error(`无法连接到 AI 服务（${baseUrl}）：${hint}。`);
      netErr.status = 502;
      throw netErr;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 连通性自检：用极小请求实测端点、模型与密钥是否真的可用。
 * 返回真实延迟、服务端回报的模型名与首句回复，失败时抛错并带上准确原因。
 */
export async function testAiConnection({ overrides = {}, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const config = resolveAiConfig(overrides);
  const startedAt = Date.now();
  const result = await callChatCompletion({
    config,
    timeoutMs,
    fetchImpl,
    temperature: 0,
    messages: [
      { role: 'system', content: '你是接口连通性检测助手，只回复一个词。' },
      { role: 'user', content: '请只回复：连通' }
    ]
  });
  const latencyMs = Date.now() - startedAt;
  return {
    ok: true,
    latencyMs,
    baseUrl: config.baseUrl,
    requestedModel: config.model,
    servedModel: result.model,
    reply: stripThinkingTags(result.content).slice(0, 80)
  };
}
