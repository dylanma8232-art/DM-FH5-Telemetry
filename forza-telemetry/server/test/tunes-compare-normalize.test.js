import test from 'node:test';
import assert from 'node:assert/strict';

// 与 routes/tunes.js 中一致的归一化规则（数字 123 与字符串 "123" 视为同一台车）
const normalizeCarOrdinal = (value) => (value === undefined || value === null ? '' : String(value));
const isSameCar = (a, b) => normalizeCarOrdinal(a) === normalizeCarOrdinal(b);

test('carOrdinal 数字/字符串混用视为同车（修复前会误报 400）', () => {
  assert.equal(isSameCar(123, '123'), true);
  assert.equal(isSameCar('3051', 3051), true);
  assert.equal(isSameCar(null, ''), true);
});

test('真正不同的车仍判为不同', () => {
  assert.equal(isSameCar(123, 124), false);
  assert.equal(isSameCar('123', '124'), false);
  assert.equal(isSameCar(123, '0'), false);
});
