import test from 'node:test';
import assert from 'node:assert/strict';
import recordModule from '../src/routes/record.js';

test('手动录制模式：正常跨圈重置计时器不触发倒转修剪，同圈或跨圈倒转正确修剪', async (t) => {
  // 启动手动录制
  // 通过模拟 HTTP 请求或直接通过 onPacketReceived
  // record.js 导出: default { router, handleAutoRecord, getIsManualRecording, getAutoRecordState, getManualRecordDataCount, getManualRacePositionsLength, onPacketReceived }

  // 先调用 /record/start 初始化
  const dummyReq = {};
  let startResJson = null;
  const dummyStartRes = {
    json: (data) => { startResJson = data; }
  };

  // 通过 router 或者直接触发
  // 找到 router 中对 /record/start 的 handler
  const startLayer = recordModule.router.stack.find(s => s.route && s.route.path === '/record/start');
  startLayer.route.stack[0].handle(dummyReq, dummyStartRes);
  assert.equal(recordModule.getIsManualRecording(), true);

  // 1. 模拟第 1 圈的打点
  // 初始点：lap 1, lapTime 10.0
  recordModule.onPacketReceived({
    position: { x: 100, y: 10, z: 200 },
    lapNumber: 1,
    currentLap: 10.0,
    speedKmh: 120
  });

  // 稍过一段时间打第二个点（由于 onPacketReceived 有 lastManualPositionSaveTime >= 100 防抖，我们等待 110ms）
  await new Promise(r => setTimeout(r, 110));
  recordModule.onPacketReceived({
    position: { x: 120, y: 10, z: 220 },
    lapNumber: 1,
    currentLap: 15.0,
    speedKmh: 125
  });

  await new Promise(r => setTimeout(r, 110));
  recordModule.onPacketReceived({
    position: { x: 150, y: 10, z: 250 },
    lapNumber: 1,
    currentLap: 20.0,
    speedKmh: 130
  });

  assert.equal(recordModule.getManualRacePositionsLength(), 3);

  // 2. 模拟正常跨圈！进入第 2 圈，currentLap 重置为 0.05 秒
  await new Promise(r => setTimeout(r, 110));
  recordModule.onPacketReceived({
    position: { x: 160, y: 10, z: 260 },
    lapNumber: 2,
    currentLap: 0.05,
    speedKmh: 135
  });

  // 验证：正常跨圈后，前一圈的打点绝不能被当成倒转而丢弃！当前打点总数应该为 4
  assert.equal(recordModule.getManualRacePositionsLength(), 4);

  // 3. 模拟在第 2 圈正常继续前进
  await new Promise(r => setTimeout(r, 110));
  recordModule.onPacketReceived({
    position: { x: 180, y: 10, z: 280 },
    lapNumber: 2,
    currentLap: 10.0,
    speedKmh: 140
  });
  assert.equal(recordModule.getManualRacePositionsLength(), 5);

  // 4. 模拟在第 2 圈内触发倒转（例如从 10.0s 倒转回 5.0s）
  // 应该修剪掉 lapTime > 5.0 的点
  await new Promise(r => setTimeout(r, 110));
  recordModule.onPacketReceived({
    position: { x: 170, y: 10, z: 270 },
    lapNumber: 2,
    currentLap: 5.0,
    speedKmh: 138
  });

  // 点应该修剪掉 lapTime 10.0 的点，然后加入当前的 5.0s 点 -> 总数为 5
  assert.equal(recordModule.getManualRacePositionsLength(), 5);

  // 5. 模拟大跨度倒转：从第 2 圈倒转回到第 1 圈（如 lapNumber 变回 1，currentLap 为 18.0s）
  await new Promise(r => setTimeout(r, 110));
  recordModule.onPacketReceived({
    position: { x: 140, y: 10, z: 240 },
    lapNumber: 1,
    currentLap: 18.0,
    speedKmh: 128
  });

  // 第 2 圈的所有点应该被裁剪，第 1 圈 > 18.0s 的点（20.0s）也应该被裁剪，
  // 最终保留第 1 圈 <= 18.0s 的点（10.0s, 15.0s）加上当前点（18.0s）共 3 个点
  assert.equal(recordModule.getManualRacePositionsLength(), 3);

  // 停止录制清理
  const stopLayer = recordModule.router.stack.find(s => s.route && s.route.path === '/record/stop');
  stopLayer.route.stack[0].handle(dummyReq, { json: () => {} });
});
