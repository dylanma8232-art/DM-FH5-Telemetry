import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTelemetryTuningRecommendations } from '../src/services/physics/telemetry-tuning-recommendations.js';

const frame = (overrides = {}) => ({
  speedKmh: 120,
  controls: { accel: 230, brake: 0 },
  tireSlipRatio: { frontLeft: 0, frontRight: 0, rearLeft: 0.24, rearRight: 0.22 },
  suspension: { frontLeft: 0.5, frontRight: 0.5, rearLeft: 0.5, rearRight: 0.5 },
  acceleration: { x: 3 },
  tireTemp: { frontLeft: 92, frontRight: 91, rearLeft: 75, rearRight: 74 },
  ...overrides
});

test('无保存方案的遥测建议只输出相对调整量与证据', () => {
  const result = generateTelemetryTuningRecommendations(Array.from({ length: 120 }, () => frame()));
  const powerSlip = result.recommendations.find(item => item.id === 'power-slip');
  const temperature = result.recommendations.find(item => item.id === 'axle-temperature');
  assert.ok(powerSlip);
  assert.ok(temperature);
  assert.equal(powerSlip.changes[0].key, 'diffAccel');
  assert.equal(powerSlip.changes[0].delta, -5);
  assert.match(powerSlip.evidence, /后轴滑移/);
});

test('样本不足时不生成伪造调校结论', () => {
  const result = generateTelemetryTuningRecommendations(Array.from({ length: 20 }, () => frame()));
  assert.equal(result.recommendations.length, 0);
  assert.match(result.summary, /样本不足/);
});
