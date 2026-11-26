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

export async function callChatCompletion({
  messages,
  temperature,
  jsonMode = false,
  fetchImpl = fetch
}) {
  const { apiKey, baseUrl, model } = getAiConfig();
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

  let response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: buildBody(jsonMode, true)
  });

  // 部分推理模型或本地网关不支持 response_format / temperature，遇到 400/422 时降级重试一次
  if (!response.ok && (response.status === 400 || response.status === 422) && (jsonMode || temperature !== undefined)) {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: buildBody(false, false)
    });
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
    model,
    baseUrl
  };
}
