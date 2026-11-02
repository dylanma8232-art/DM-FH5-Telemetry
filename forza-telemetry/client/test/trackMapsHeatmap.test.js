import test from 'node:test';
import assert from 'node:assert/strict';

// 测试 TrackMaps.jsx 中的异常事件热力图层判定逻辑
function evaluateHeatmapPoint(c) {
  // 锁死 (刹车>40 且 任意轮胎滑移<-0.15)
  const isLockup = (c.brake || 0) > 40 && (c.slipFL < -0.15 || c.slipFR < -0.15 || c.slipRL < -0.15 || c.slipRR < -0.15);

  // 打滑 (油门>40 且 任意轮胎滑移>0.15)
  const isSlip = (c.throttle || 0) > 40 && (c.slipFL > 0.15 || c.slipFR > 0.15 || c.slipRL > 0.15 || c.slipRR > 0.15);

  // 托底 (归一化悬挂行程<0.05)
  const suspFL = c.suspensionNormFL ?? c.suspFL ?? 1.0;
  const suspFR = c.suspensionNormFR ?? c.suspFR ?? 1.0;
  const suspRL = c.suspensionNormRL ?? c.suspRL ?? 1.0;
  const suspRR = c.suspensionNormRR ?? c.suspRR ?? 1.0;
  const isBottoming = suspFL < 0.05 || suspFR < 0.05 || suspRL < 0.05 || suspRR < 0.05;

  return { isLockup: !!isLockup, isSlip: !!isSlip, isBottoming: !!isBottoming };
}

test('TrackMaps 热力图层：正确匹配 API 返回的 throttle/brake (0-100) 及 suspensionNorm* 字段', () => {
  // 典型 API 返回帧格式 (来自 analysis.js:188-229)
  const normalFrame = {
    throttle: 80,
    brake: 0,
    slipFL: 0.02,
    slipFR: 0.02,
    slipRL: 0.05,
    slipRR: 0.05,
    suspensionNormFL: 0.45,
    suspensionNormFR: 0.46,
    suspensionNormRL: 0.50,
    suspensionNormRR: 0.51
  };
  assert.deepEqual(evaluateHeatmapPoint(normalFrame), {
    isLockup: false,
    isSlip: false,
    isBottoming: false
  });

  // 锁死事件：brake = 85 (0-100 区间)，前左轮胎滑移率 -0.22
  const lockupFrame = {
    ...normalFrame,
    brake: 85,
    throttle: 0,
    slipFL: -0.22
  };
  assert.equal(evaluateHeatmapPoint(lockupFrame).isLockup, true);

  // 打滑事件：throttle = 90 (0-100 区间)，后右轮胎滑移率 0.28
  const slipFrame = {
    ...normalFrame,
    throttle: 90,
    brake: 0,
    slipRR: 0.28
  };
  assert.equal(evaluateHeatmapPoint(slipFrame).isSlip, true);

  // 托底事件：suspensionNormFL = 0.02 (< 0.05)
  const bottomingFrame = {
    ...normalFrame,
    suspensionNormFL: 0.02
  };
  assert.equal(evaluateHeatmapPoint(bottomingFrame).isBottoming, true);

  // 兼容老数据或本地字段名 suspFL
  const legacyBottomingFrame = {
    throttle: 50,
    brake: 0,
    suspFL: 0.03
  };
  assert.equal(evaluateHeatmapPoint(legacyBottomingFrame).isBottoming, true);
});
