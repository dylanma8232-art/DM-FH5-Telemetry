import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceObjectContents, stateManager } from '../src/services/state-manager.js';

test('替换运行时状态时保留对象引用', () => {
  const state = { stale: true, keep: 'old' };
  const reference = state;

  replaceObjectContents(state, { vehicle_1: { name: '测试车辆' } });

  assert.strictEqual(state, reference);
  assert.deepEqual(state, { vehicle_1: { name: '测试车辆' } });
});

test('StateManager 设置与获取 currentData 正常运行', () => {
  const mockTelemetry = {
    isRaceOn: true,
    car: { ordinal: 1234, class: 5, performanceIndex: 800 },
    speedKmh: 120
  };

  stateManager.setCurrentData(mockTelemetry);
  assert.deepEqual(stateManager.getCurrentData(), mockTelemetry);

  stateManager.setCurrentData(null);
  assert.strictEqual(stateManager.getCurrentData(), null);
});
