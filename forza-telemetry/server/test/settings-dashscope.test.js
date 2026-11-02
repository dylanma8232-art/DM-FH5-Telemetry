import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import systemRouter, { settingsRouter } from '../src/routes/system.js';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');

async function withSettingsServer(run) {
  const app = express();
  app.use('/api/system', systemRouter);
  app.use('/api/settings', settingsRouter);

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const savedEnvKey = process.env.DASHSCOPE_API_KEY;
  const savedEnvUrl = process.env.DASHSCOPE_BASE_URL;
  const savedEnvModel = process.env.DASHSCOPE_MODEL;
  let savedEnvFileContent = null;
  if (fs.existsSync(envPath)) {
    savedEnvFileContent = fs.readFileSync(envPath, 'utf8');
  }

  try {
    await run({ baseUrl, app, server });
  } finally {
    server.close();
    if (savedEnvKey !== undefined) process.env.DASHSCOPE_API_KEY = savedEnvKey;
    else delete process.env.DASHSCOPE_API_KEY;

    if (savedEnvUrl !== undefined) process.env.DASHSCOPE_BASE_URL = savedEnvUrl;
    else delete process.env.DASHSCOPE_BASE_URL;

    if (savedEnvModel !== undefined) process.env.DASHSCOPE_MODEL = savedEnvModel;
    else delete process.env.DASHSCOPE_MODEL;

    if (savedEnvFileContent !== null) {
      fs.writeFileSync(envPath, savedEnvFileContent, 'utf8');
    }
  }
}

test('非本地 IP 访问 POST /api/settings/dashscope-key 返回 403 Forbidden', async () => {
  const app = express();
  app.use((req, res, next) => {
    // 模拟远端非本地客户端 IP
    Object.defineProperty(req.socket, 'remoteAddress', {
      value: '192.168.1.100',
      configurable: true
    });
    next();
  });
  app.use('/api/settings', settingsRouter);

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/settings/dashscope-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-abcdef123456' })
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, '仅允许从本地访问修改配置');
  } finally {
    server.close();
  }
});

test('参数中包含 \\r 或 \\n 换行符时返回 400 Bad Request', async () => {
  await withSettingsServer(async ({ baseUrl }) => {
    const payloads = [
      { apiKey: 'sk-123\nINJECTED=true' },
      { apiKey: 'sk-123\rINJECTED=true' },
      { apiKey: 'sk-real-secret', baseUrl: 'https://example.com\nINJECTED=true' },
      { apiKey: 'sk-real-secret', model: 'qwen\nINJECTED=true' }
    ];

    for (const body of payloads) {
      const res = await fetch(`${baseUrl}/api/settings/dashscope-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, '参数不能包含换行符');
    }
  });
});

test('使用掩码 Key 尝试修改 baseUrl 会被拒绝返回 400', async () => {
  await withSettingsServer(async ({ baseUrl }) => {
    process.env.DASHSCOPE_API_KEY = 'sk-super-secret-key-1234';
    process.env.DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

    // 1. 获取掩码 Key
    const getRes = await fetch(`${baseUrl}/api/settings/dashscope-key`);
    assert.equal(getRes.status, 200);
    const { apiKey: maskedKey } = await getRes.json();
    assert.equal(maskedKey, '********************1234');

    // 2. 尝试用掩码 Key 劫持 baseUrl
    const attackRes = await fetch(`${baseUrl}/api/settings/dashscope-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: maskedKey,
        baseUrl: 'https://attacker.com/v1'
      })
    });

    assert.equal(attackRes.status, 400);
    const attackBody = await attackRes.json();
    assert.equal(attackBody.error, '修改 baseUrl 时必须提供真实完整 Key');

    // 确保 process.env.DASHSCOPE_BASE_URL 未被篡改
    assert.equal(process.env.DASHSCOPE_BASE_URL, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  });
});

test('使用掩码 Key 且未修改 baseUrl 时可以正常保留原 API Key', async () => {
  await withSettingsServer(async ({ baseUrl }) => {
    process.env.DASHSCOPE_API_KEY = 'sk-super-secret-key-1234';
    process.env.DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    process.env.DASHSCOPE_MODEL = 'qwen3.7-plus';

    const getRes = await fetch(`${baseUrl}/api/settings/dashscope-key`);
    const { apiKey: maskedKey, baseUrl: currentBaseUrl } = await getRes.json();

    const updateRes = await fetch(`${baseUrl}/api/settings/dashscope-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: maskedKey,
        baseUrl: currentBaseUrl,
        model: 'qwen-max'
      })
    });

    assert.equal(updateRes.status, 200);
    const body = await updateRes.json();
    assert.equal(body.status, 'ok');
    assert.equal(process.env.DASHSCOPE_API_KEY, 'sk-super-secret-key-1234');
    assert.equal(process.env.DASHSCOPE_MODEL, 'qwen-max');
  });
});

test('提供完整真实 Key 时允许修改 apiKey、baseUrl 和 model，并写入 .env', async () => {
  await withSettingsServer(async ({ baseUrl }) => {
    const newKey = 'sk-new-valid-dashscope-secret-5678';
    const newUrl = 'https://custom-dashscope.example.com/v1';
    const newModel = 'qwen-plus';

    const res = await fetch(`${baseUrl}/api/settings/dashscope-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: newKey,
        baseUrl: newUrl,
        model: newModel
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');

    assert.equal(process.env.DASHSCOPE_API_KEY, newKey);
    assert.equal(process.env.DASHSCOPE_BASE_URL, newUrl);
    assert.equal(process.env.DASHSCOPE_MODEL, newModel);

    assert.equal(fs.existsSync(envPath), true);
    const envFileContent = fs.readFileSync(envPath, 'utf8');
    assert.ok(envFileContent.includes(`DASHSCOPE_API_KEY=${newKey}`));
    assert.ok(envFileContent.includes(`DASHSCOPE_BASE_URL=${newUrl}`));
    assert.ok(envFileContent.includes(`DASHSCOPE_MODEL=${newModel}`));
  });
});

test('非法协议或畸形 baseUrl 被拒绝返回 400', async () => {
  await withSettingsServer(async ({ baseUrl }) => {
    const invalidProtocols = [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'not-a-valid-url'
    ];

    for (const url of invalidProtocols) {
      const res = await fetch(`${baseUrl}/api/settings/dashscope-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'sk-real-valid-key',
          baseUrl: url
        })
      });

      assert.equal(res.status, 400);
    }
  });
});
