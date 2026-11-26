import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callChatCompletion,
  getAiConfig,
  isAiConfigured,
  isLocalAiEndpoint,
  normalizeBaseUrl,
  parseJsonFromAiContent,
  stripThinkingTags
} from '../src/services/ai-client.js';

function withAiEnv(vars, run) {
  const keys = [
    'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL',
    'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL',
    'DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL', 'DASHSCOPE_MODEL'
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, vars);
  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      for (const k of keys) {
        if (saved[k] !== undefined) process.env[k] = saved[k];
        else delete process.env[k];
      }
    });
}

test('normalizeBaseUrl 自动去除末尾斜杠与误填的 /chat/completions 后缀', () => {
  assert.equal(normalizeBaseUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1');
  assert.equal(normalizeBaseUrl('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1');
  assert.equal(normalizeBaseUrl('http://localhost:11434/v1/chat/completions/'), 'http://localhost:11434/v1');
});

test('getAiConfig 优先读取 AI_*，并兼容 OPENAI_* 与 DASHSCOPE_*', async () => {
  await withAiEnv({
    DASHSCOPE_API_KEY: 'ds-key',
    DASHSCOPE_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    DASHSCOPE_MODEL: 'qwen3.7-plus',
    AI_API_KEY: 'ai-key',
    AI_BASE_URL: 'https://api.deepseek.com/v1/',
    AI_MODEL: 'deepseek-chat'
  }, () => {
    const cfg = getAiConfig();
    assert.equal(cfg.apiKey, 'ai-key');
    assert.equal(cfg.baseUrl, 'https://api.deepseek.com/v1');
    assert.equal(cfg.model, 'deepseek-chat');
  });

  await withAiEnv({
    OPENAI_API_KEY: 'oa-key',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    OPENAI_MODEL: 'gpt-4o'
  }, () => {
    const cfg = getAiConfig();
    assert.equal(cfg.apiKey, 'oa-key');
    assert.equal(cfg.baseUrl, 'https://api.openai.com/v1');
    assert.equal(cfg.model, 'gpt-4o');
  });
});

test('本地 Ollama/LM Studio 端点无需 API Key 也视为已配置', async () => {
  assert.equal(isLocalAiEndpoint('http://localhost:11434/v1'), true);
  assert.equal(isLocalAiEndpoint('http://127.0.0.1:1234/v1'), true);
  assert.equal(isLocalAiEndpoint('https://api.openai.com/v1'), false);

  await withAiEnv({
    AI_BASE_URL: 'http://localhost:11434/v1',
    AI_MODEL: 'qwen2.5:14b'
  }, () => {
    assert.equal(isAiConfigured(), true);
  });
});

test('stripThinkingTags 与 parseJsonFromAiContent 正确剥离推理标签与 Markdown 代码块', () => {
  const raw = '<think>正在推理配装...</think>\n```json\n{"parts":{"tires":{"optionId":"race"}},"reason":"抓地力更好"}\n```';
  assert.equal(stripThinkingTags('<think>abc</think>你好'), '你好');
  const parsed = parseJsonFromAiContent(raw);
  assert.deepEqual(parsed, { parts: { tires: { optionId: 'race' } }, reason: '抓地力更好' });
});

test('callChatCompletion 在服务端拒绝 json_object 时自动降级重试并解析 JSON 错误详情', async () => {
  await withAiEnv({
    AI_API_KEY: 'test-key',
    AI_BASE_URL: 'https://api.example.com/v1',
    AI_MODEL: 'deepseek-reasoner'
  }, async () => {
    let calls = 0;
    const mockFetch = async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      if (calls === 1) {
        assert.deepEqual(body.response_format, { type: 'json_object' });
        return new Response(JSON.stringify({ error: { message: 'response_format not supported' } }), { status: 400 });
      }
      assert.equal(body.response_format, undefined);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    };

    const res = await callChatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.1,
      jsonMode: true,
      fetchImpl: mockFetch
    });

    assert.equal(calls, 2);
    assert.equal(res.content, '{"ok":true}');
  });
});
