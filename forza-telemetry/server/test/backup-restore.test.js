import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { stateManager } from '../src/services/state-manager.js';
import systemRouter, { backupRouter } from '../src/routes/system.js';

async function withTestServer(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh5-backup-test-'));
  const originalDataDir = stateManager.DATA_DIR;
  stateManager.DATA_DIR = tempDir;

  const app = express();
  app.use('/api/system', systemRouter);
  app.use('/api/backup', backupRouter);

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run({ baseUrl, tempDir });
  } finally {
    server.close();
    stateManager.DATA_DIR = originalDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('路径穿越攻击载荷会被拒并返回 400 状态码，且不会写入 DATA_DIR 外部文件', async () => {
  await withTestServer(async ({ baseUrl, tempDir }) => {
    const canaryFile = path.join(tempDir, '..', 'canary_test_file.txt');
    if (fs.existsSync(canaryFile)) fs.unlinkSync(canaryFile);

    const maliciousPayload = {
      version: 2,
      data: {
        '..': {
          '..': {
            'canary_test_file.txt': { hacked: true }
          }
        }
      }
    };

    const res = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: JSON.stringify(maliciousPayload)
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
    assert.equal(fs.existsSync(canaryFile), false, 'Canary file must not be created outside DATA_DIR');
  });
});

test('带有路径分隔符斜杠的 key 会被拒', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const maliciousPayload = {
      version: 2,
      data: {
        '../malicious.json': { hacked: true }
      }
    };

    const res = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: JSON.stringify(maliciousPayload)
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });
});

test('简单 CORS 类型（如 text/plain、application/x-www-form-urlencoded）会被拒绝', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const payload = JSON.stringify({
      version: 2,
      data: { 'test.json': { ok: true } }
    });

    const resText = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: payload
    });
    assert.equal(resText.status, 400);

    const resForm = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload
    });
    assert.equal(resForm.status, 400);
  });
});

test('合法的 JSON 备份数据使用 application/octet-stream 或 application/json 恢复成功', async () => {
  await withTestServer(async ({ baseUrl, tempDir }) => {
    const validPayload = {
      version: 2,
      data: {
        'vehicles.json': { '100': { name: 'Test Car' } }
      }
    };

    const res = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: JSON.stringify(validPayload)
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const restoredFile = path.join(tempDir, 'vehicles.json');
    assert.equal(fs.existsSync(restoredFile), true);
    const restoredData = JSON.parse(fs.readFileSync(restoredFile, 'utf8'));
    assert.deepEqual(restoredData, { '100': { name: 'Test Car' } });
  });
});
