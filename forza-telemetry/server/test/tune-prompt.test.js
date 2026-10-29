import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTuneParamsForPrompt, pickTuneForPrompt } from '../src/services/tune-prompt.js';

const savedTune = {
  tires: { frontPressure: 28, rearPressure: 29, frontCamber: -1.5, rearCamber: -1.0, frontToe: 0.1, rearToe: 0.2 },
  suspension: { frontSpring: 100, rearSpring: 90, frontARB: 30, rearARB: 25, frontRideHeight: 12, rearRideHeight: 13, frontDamping: 8, rearDamping: 7 },
  drivetrain: { diffAccel: 60, diffDecel: 20, diffCenter: 55 },
  aero: { frontDownforce: 120, rearDownforce: 200 },
};

// 与改造前 routes/analysis.js 内的内联模板逐字一致的「旧实现」快照
const legacyParams = (tune) => tune ? `
  - 轮胎气压：前轮 ${tune.tires?.frontPressure || '未设置'} PSI, 后轮 ${tune.tires?.rearPressure || '未设置'} PSI
  - 轮胎外倾角：前轮 ${tune.tires?.frontCamber || '未设置'}°, 后轮 ${tune.tires?.rearCamber || '未设置'}°
  - 轮胎束角：前轮 ${tune.tires?.frontToe || '未设置'}°, 后轮 ${tune.tires?.rearToe || '未设置'}°
  - 悬架弹簧刚度：前部 ${tune.suspension?.frontSpring || '未设置'}, 后部 ${tune.suspension?.rearSpring || '未设置'}
  - 防倾杆硬度：前部 ${tune.suspension?.frontARB || '未设置'}, 后部 ${tune.suspension?.rearARB || '未设置'}
  - 车身高度：前部 ${tune.suspension?.frontRideHeight || '未设置'} cm, 后部 ${tune.suspension?.rearRideHeight || '未设置'} cm
  - 避震阻尼：前侧压缩 ${tune.suspension?.frontDamping || '未设置'}, 后侧压缩 ${tune.suspension?.rearDamping || '未设置'}
  - 差速器锁：加速锁 ${tune.drivetrain?.diffAccel || '未设置'}%, 减速锁 ${tune.drivetrain?.diffDecel || '未设置'}%, 中央分配 ${tune.drivetrain?.diffCenter || '未设置'}%
  - 空气动力学下压力：前部 ${tune.aero?.frontDownforce || '未设置'} lbs, 后部 ${tune.aero?.rearDownforce || '未设置'} lbs
  ` : '该车辆目前使用的是未改动的原厂设定，没有可用的自定义调校参数。';

test('已保存方案片段与改造前内联模板逐字一致（无行为漂移）', () => {
  assert.equal(formatTuneParamsForPrompt(savedTune), legacyParams(savedTune));
  assert.equal(formatTuneParamsForPrompt(null), legacyParams(null));
});

test('在途草稿优先于已保存方案，并被渲染进 Prompt 片段', () => {
  const draft = { tires: { frontToe: -0.35, frontPressure: 1.9 }, suspension: {}, drivetrain: {}, aero: {} };
  const picked = pickTuneForPrompt({ formData: draft, savedTune });
  assert.equal(picked.source, 'draft');
  assert.match(picked.sourceLabel, /草稿/);
  const text = formatTuneParamsForPrompt(picked.tune);
  assert.ok(text.includes('前轮 -0.35°'), '草稿前束角必须进入 Prompt');
  assert.ok(text.includes('前轮 1.9 PSI'), '草稿胎压必须进入 Prompt');
  assert.ok(!text.includes('前轮 0.1°'), '不得再使用已保存方案里的旧前束角');
});

test('无草稿时回退已保存方案；两者都无则回退原厂文案', () => {
  assert.equal(pickTuneForPrompt({ formData: null, savedTune }).source, 'saved');
  assert.equal(pickTuneForPrompt({ formData: {}, savedTune: null }).source, 'none');
  assert.match(formatTuneParamsForPrompt(null), /原厂设定/);
});

test('形状不合法（无 tires/suspension/drivetrain/aero）的 formData 不会被当成草稿', () => {
  assert.equal(pickTuneForPrompt({ formData: { foo: 1 }, savedTune }).source, 'saved');
});
