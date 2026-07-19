import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceObjectContents } from '../src/services/state-manager.js';

test('替换运行时状态时保留对象引用', () => {
  const state = { stale: true, keep: 'old' };
  const reference = state;

  replaceObjectContents(state, { vehicle_1: { name: '测试车辆' } });

  assert.strictEqual(state, reference);
  assert.deepEqual(state, { vehicle_1: { name: '测试车辆' } });
});
