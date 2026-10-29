import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readTrackDetailAsync } from '../src/storage/session-db.js';

// 回归背景：批次 1 把 brotliDecompressSync 改成 `await zlib.brotliDecompress(buffer)`，
// 回调式 API 不能 await，导致所有赛道详情异步读取全部失败并静默返回 null。
async function withTracksDir(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'forza-track-async-'));
  await fs.mkdir(path.join(base, 'tracks'), { recursive: true });
  try {
    await run(base);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

const detail = { id: 'track_x', name: '测试赛道', centerLine: [{ x: 0, z: 0 }, { x: 1, z: 1 }] };

test('异步读取 Brotli 赛道详情不再因回调式 zlib 而失败', async () => {
  await withTracksDir(async (base) => {
    const compressed = zlib.brotliCompressSync(Buffer.from(JSON.stringify(detail)));
    await fs.writeFile(path.join(base, 'tracks', 'track_x.json.br'), compressed);
    assert.deepEqual(await readTrackDetailAsync('track_x', base), detail);
  });
});

test('异步读取 Gzip 赛道详情同样可用', async () => {
  await withTracksDir(async (base) => {
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(detail)));
    await fs.writeFile(path.join(base, 'tracks', 'track_gz.json.gz'), compressed);
    assert.deepEqual(await readTrackDetailAsync('track_gz', base), detail);
  });
});

test('既无压缩包也无 JSON 时返回 null，不抛错', async () => {
  await withTracksDir(async (base) => {
    assert.equal(await readTrackDetailAsync('track_missing', base), null);
  });
});
