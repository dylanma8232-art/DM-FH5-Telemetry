import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { sqliteDb } from '../src/storage/sqlite-db.js';

async function withTempDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'forza-save-failure-test-'));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('sqliteDb.saveSessionDetail 抛出 SQLite 异常时正确向上抛出', () => {
  assert.throws(() => {
    sqliteDb.saveSessionDetail(null, Buffer.from('hifi'), Buffer.from('lowfi'));
  });
});

test('save-worker 遇到 SQLite 存储失败时向主线程返回 status: error 且保留原始录制文件', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});

  await withTempDirectory(async (directory) => {
    const tempFilePath = path.join(directory, 'temp_auto_record_123.jsonl');
    await fs.writeFile(tempFilePath, JSON.stringify({ isRaceOn: 1, currentRaceTime: 10 }) + '\n', 'utf8');

    const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/storage/save-worker.js');

    const workerResult = await new Promise((resolve) => {
      const worker = new Worker(workerPath, {
        workerData: {
          tempFilePath,
          positions: [{ x: 1, y: 0, z: 2 }],
          sessionDataMeta: { id: null, autoRecorded: true, trackName: 'Test Track' },
          DATA_DIR: directory,
          tracks: {},
          trackMode: null
        }
      });

      worker.on('message', (msg) => {
        resolve(msg);
      });

      worker.on('error', (err) => {
        resolve({ status: 'error', error: err.message });
      });
    });

    // 1. Worker 必须返回 status: 'error'
    assert.strictEqual(workerResult.status, 'error');
    assert.ok(workerResult.error, '错误信息中应包含 SQLite 写入失败异常');

    // 2. 原始录制 JSONL 临时文件不能被清理删除，必须完整保留以供救回
    assert.strictEqual(existsSync(tempFilePath), true, '原始录制文件在 SQLite 写入失败时必须被保留');
  });
});
