export const AI_PROVIDER_PRESETS = [
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    recommendedModels: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true
  },
  {
    id: 'openai',
    label: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    recommendedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    requiresKey: true
  },
  {
    id: 'dashscope',
    label: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.7-plus',
    recommendedModels: ['qwen3.7-plus', 'qwen-plus', 'qwen-max'],
    requiresKey: true
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    recommendedModels: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
    requiresKey: true
  },
  {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    recommendedModels: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    requiresKey: true
  },
  {
    id: 'ollama',
    label: 'Ollama 本地模型',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:14b',
    recommendedModels: ['qwen2.5:14b', 'deepseek-r1:14b', 'llama3.1:8b'],
    requiresKey: false
  },
  {
    id: 'custom',
    label: '自定义兼容接口',
    baseUrl: '',
    defaultModel: '',
    recommendedModels: [],
    requiresKey: true
  }
];

export function detectProviderPreset(baseUrl) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  const matched = AI_PROVIDER_PRESETS.find((preset) => preset.baseUrl && preset.baseUrl === normalized);
  return matched ? matched.id : 'custom';
}

export function isLocalAiUrl(baseUrl) {
  const value = String(baseUrl || '').trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}
