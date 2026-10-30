import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { readJsonAsync, writeBrotliAsync, writeJsonAsync } from '../src/storage/file-db.js';

const brotliDecompress = promisify(zlib.brotliDecompress);

async function withTempDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'forza-file-db-'));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('JSON 读取在文件缺失或内容损坏时返回调用方默认值', async (t) => {
  t.mock.method(console, 'error', () => {});
  await withTempDirectory(async (directory) => {
    const missingPath = path.join(directory, 'missing.json');
    const malformedPath = path.join(directory, 'malformed.json');
    const fallback = { vehicles: [] };
    await fs.writeFile(malformedPath, '{not valid json', 'utf8');

    assert.strictEqual(await readJsonAsync(missingPath, fallback), fallback);
    assert.strictEqual(await readJsonAsync(malformedPath, fallback), fallback);
  });
});

test('JSON 写入会创建父目录、保留可恢复备份，并按同一路径调用顺序落盘', async () => {
  await withTempDirectory(async (directory) => {
    const filepath = path.join(directory, 'nested', 'state.json');

    await Promise.all([
      writeJsonAsync(filepath, { revision: 1 }),
      writeJsonAsync(filepath, { revision: 2 }),
      writeJsonAsync(filepath, { revision: 3 })
    ]);

    assert.deepEqual(JSON.parse(await fs.readFile(filepath, 'utf8')), { revision: 3 });
    assert.deepEqual(JSON.parse(await fs.readFile(`${filepath}.bak`, 'utf8')), { revision: 3 });
    await assert.rejects(fs.access(`${filepath}.tmp`));
  });
});

test('Brotli 写入保留 JSON 语义，且写入失败返回 false', async (t) => {
  t.mock.method(console, 'error', () => {});
  await withTempDirectory(async (directory) => {
    const filepath = path.join(directory, 'session.br');
    const payload = { trackId: 'track-1', laps: [91.2, 90.8] };

    assert.equal(await writeBrotliAsync(filepath, payload), true);
    const compressed = await fs.readFile(filepath);
    assert.deepEqual(JSON.parse((await brotliDecompress(compressed)).toString('utf8')), payload);

    assert.equal(await writeBrotliAsync(directory, payload), false);
  });
});
