import test from 'node:test';
import assert from 'node:assert/strict';

// 抽稀规则与 routes/tracks.js 中的实现保持一致（等距取点、首尾必含）。
const sampleThumbnail = (source, maxPoints) => {
  const count = Math.min(source.length, maxPoints);
  const positions = [];
  for (let k = 0; k < count; k++) {
    const idx = count === 1 ? 0 : Math.round((k * (source.length - 1)) / (count - 1));
    positions.push({ x: source[idx].x, z: source[idx].z });
  }
  return positions;
};

test('缩略图抽稀保留首尾点且点数不超过上限', () => {
  const source = Array.from({ length: 1000 }, (_, i) => ({ x: i, z: -i, speed: 1 }));
  const out = sampleThumbnail(source, 120);
  assert.equal(out.length, 120);
  assert.deepEqual(out[0], { x: 0, z: -0 });
  assert.deepEqual(out[out.length - 1], { x: 999, z: -999 });
  assert.ok(out.every((p) => Object.keys(p).length === 2), '缩略图只保留 x/z 两个字段');
});

test('源点少于上限时全量返回', () => {
  const source = [{ x: 1, z: 2 }, { x: 3, z: 4 }];
  assert.deepEqual(sampleThumbnail(source, 120), source);
});
