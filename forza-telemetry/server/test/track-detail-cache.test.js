import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackDetailCache } from '../src/storage/track-detail-cache.js';

const PATHS = ['/t/a.json.br', '/t/a.json.gz', '/t/a.json'];

function setup({ ttlMs = 30000, maxEntries = 32 } = {}) {
  const stats = new Map();
  const reads = { count: 0 };
  const statFile = (filePath) => {
    reads.count++;
    return stats.get(filePath) || null;
  };
  const cache = createTrackDetailCache({ ttlMs, maxEntries, statFile });
  return { cache, stats, reads };
}

function seed(stats, filePath, mtimeMs = 1000, size = 10) {
  stats.set(filePath, { mtimeMs, size });
}

test('未缓存时返回 null，记住后可命中同一对象', () => {
  const { cache, stats } = setup();
  assert.equal(cache.get('a', PATHS), null);

  seed(stats, PATHS[0]);
  const detail = { id: 'a', turns: [] };
  cache.remember('a', PATHS[0], detail);

  assert.equal(cache.get('a', PATHS), detail);
  assert.equal(cache.size(), 1);
});

test('文件 mtime/大小变化或不在候选路径时命中失效', () => {
  const { cache, stats } = setup();
  seed(stats, PATHS[0], 1000, 10);
  cache.remember('a', PATHS[0], { id: 'a' });

  // 外部写入导致文件变化
  seed(stats, PATHS[0], 2000, 10);
  assert.equal(cache.get('a', PATHS), null);
  assert.equal(cache.size(), 0);

  // 路径不再属于候选列表
  seed(stats, PATHS[2], 5000, 10);
  cache.remember('b', PATHS[2], { id: 'b' });
  assert.equal(cache.get('b', [PATHS[0]]), null);
});

test('超过 TTL 后失效', () => {
  const stats = new Map();
  let clock = 0;
  const cache = createTrackDetailCache({ ttlMs: 30000, statFile: (p) => stats.get(p) || null, now: () => clock });
  stats.set(PATHS[0], { mtimeMs: 1, size: 1 });
  cache.remember('a', PATHS[0], { id: 'a' });

  clock = 29999;
  assert.notEqual(cache.get('a', PATHS), null);
  clock = 30001;
  assert.equal(cache.get('a', PATHS), null);
});

test('invalidate 后立即失效，LRU 会淘汰最久未使用项', () => {
  const { cache, stats } = setup({ maxEntries: 2 });
  seed(stats, PATHS[0]);
  cache.remember('a', PATHS[0], { id: 'a' });
  cache.remember('b', PATHS[0], { id: 'b' });

  assert.equal(cache.get('a', PATHS).id, 'a'); // a 变为最近使用
  cache.remember('c', PATHS[0], { id: 'c' }); // 淘汰 b
  assert.equal(cache.size(), 2);
  assert.equal(cache.get('b', PATHS), null);
  assert.equal(cache.get('a', PATHS).id, 'a');

  cache.invalidate('a');
  assert.equal(cache.get('a', PATHS), null);

  cache.invalidate();
  assert.equal(cache.size(), 0);
});
