import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import express from 'express';
import { stateManager } from '../src/services/state-manager.js';
import tunesRouter from '../src/routes/tunes.js';
import { sqliteDb } from '../src/storage/sqlite-db.js';

test('routes/tunes.js 新建调校持久化 body.notes', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/tunes', tunesRouter);

  // 模拟车辆数据
  stateManager.vehicles['9999'] = {
    ordinal: 9999,
    name: '测试测试车',
    basePi: 500,
    pi: 500
  };

  const server = app.listen(0);
  const port = server.address().port;

  t.after(() => {
    server.close();
    delete stateManager.vehicles['9999'];
  });

  const payload = {
    name: '带备注的调校',
    vehicleId: '9999',
    basePi: 500,
    totalPi: 600,
    generationMode: 'manual',
    driveType: 'awd',
    notes: '这是测试调校的特殊驾驶备注：弯道注意收油。'
  };

  const res = await fetch(`http://127.0.0.1:${port}/api/tunes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.ok(data.tuneId);
  assert.equal(data.tune.notes, '这是测试调校的特殊驾驶备注：弯道注意收油。');

  // 验证 stateManager 中保存的调校也包含了 notes
  const savedTune = stateManager.tunes[data.tuneId];
  assert.ok(savedTune);
  assert.equal(savedTune.notes, '这是测试调校的特殊驾驶备注：弯道注意收油。');

  // 清理
  delete stateManager.tunes[data.tuneId];
});

test('routes/tunes.js AI 诊断接口使用统一 session-db 加载 _summary.json + SQLite 会话遥测数据', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/tunes', tunesRouter);

  const server = app.listen(0);
  const port = server.address().port;

  const testSessionId = `test_session_${Date.now()}`;
  const sessionsDir = path.join(stateManager.DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const summaryPath = path.join(sessionsDir, `${testSessionId}_summary.json`);
  const summaryData = {
    id: testSessionId,
    trackId: 'track_test',
    trackName: '地平线嘉年华赛道',
    vehicle: { ordinal: 9999, name: '测试车' },
    summary: { duration: 120000, dataCount: 2, positionCount: 2 },
    laps: { best: 58.234, last: 59.1, count: 2 },
    hasDetail: true
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');

  // 构造时序细节并存入 SQLite（数量需 >= 60 帧以触发 physicsAnalysis recommendations）
  const frame = () => ({
    speedKmh: 120,
    controls: { accel: 230, brake: 0 },
    tireSlipRatio: { frontLeft: 0, frontRight: 0, rearLeft: 0.24, rearRight: 0.22 },
    suspension: { frontLeft: 0.5, frontRight: 0.5, rearLeft: 0.5, rearRight: 0.5 },
    acceleration: { x: 3 },
    tireTemp: { frontLeft: 92, frontRight: 91, rearLeft: 75, rearRight: 74 }
  });
  const hifiData = Array.from({ length: 120 }, () => frame());
  const hifiPayload = { id: testSessionId, data: hifiData, positions: [] };
  const hifiBr = zlib.brotliCompressSync(Buffer.from(JSON.stringify(hifiPayload)));
  sqliteDb.saveSessionDetail(testSessionId, hifiBr, hifiBr);

  t.after(() => {
    server.close();
    try { fs.unlinkSync(summaryPath); } catch {}
    try { sqliteDb.deleteSession(testSessionId); } catch {}
  });

  const diagnosisPayload = {
    tune: {
      vehicleId: '9999',
      tires: { frontPressure: 2.0, rearPressure: 2.0 },
      suspension: { frontARB: 25, rearARB: 25, frontSpring: 90, rearSpring: 80 },
      drivetrain: { diffAccel: 50 }
    },
    problems: [
      { name: '入弯转向不足', description: '弯道推头' }
    ],
    sessionId: testSessionId
  };

  const res = await fetch(`http://127.0.0.1:${port}/api/tunes/test_tune/ai-diagnosis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diagnosisPayload)
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.diagnosis);
  // 验证诊断内容关联了赛道和最佳圈速
  assert.match(data.diagnosis, /地平线嘉年华赛道/);
  assert.match(data.diagnosis, /58\.234s/);
  // 验证提取到了遥测证据，而不是回退为“未绑定遥测记录”
  assert.doesNotMatch(data.diagnosis, /未绑定遥测记录/);
  assert.match(data.diagnosis, /实测物理证据/);
});
