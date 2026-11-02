import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { sqliteDb } from '../src/storage/sqlite-db.js';
import { loadSession } from '../src/storage/session-db.js';
import { stateManager } from '../src/services/state-manager.js';
import systemRouter from '../src/routes/system.js';

const gunzipAsync = promisify(zlib.gunzip);

test('备份导出包含 telemetry.db 且恢复后能正常从 SQLite 读取会话细节', async () => {
  const sessionId = 'test_backup_sqlite_session_1';
  const sampleDetail = {
    id: sessionId,
    data: [{ speed: 100, timestampMS: 1000 }],
    positions: [{ x: 10, y: 0, z: 20 }]
  };

  const brotliOptions = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } };
  const hifiBr = zlib.brotliCompressSync(Buffer.from(JSON.stringify(sampleDetail)), brotliOptions);

  // 1. 写入 SQLite 细节与 JSON 摘要
  sqliteDb.saveSessionDetail(sessionId, hifiBr, hifiBr);

  const sessionsDir = path.join(stateManager.DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

  const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
  const summaryData = {
    id: sessionId,
    trackName: '测试赛道',
    summary: { dataCount: 1, positionCount: 1, duration: 1000 }
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');

  // 2. 模拟 GET /backup/export 请求
  const exportRoute = systemRouter.stack.find(layer => layer.route && layer.route.path === '/backup/export' && layer.route.methods.get);
  assert.ok(exportRoute, 'GET /backup/export 路由已注册');

  let exportedBuffer = null;
  let resStatus = 200;
  let resErr = null;

  const req = { method: 'GET', originalUrl: '/backup/export' };

  await new Promise((resolve) => {
    const res = {
      setHeader: () => {},
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resErr = data; resolve(); },
      send: (data) => { exportedBuffer = data; resolve(); }
    };
    const exportHandler = exportRoute.route.stack[0].handle;
    exportHandler(req, res, () => resolve());
  });

  assert.equal(resStatus, 200, `导出 HTTP 状态正常: ${JSON.stringify(resErr)}`);
  assert.ok(exportedBuffer, '导出的备份 Buffer 存在');

  const decompressed = await gunzipAsync(exportedBuffer);
  const backupObj = JSON.parse(decompressed.toString('utf8'));

  assert.ok(backupObj.data, '备份包包含 data 目录节点');
  assert.ok(backupObj.data['telemetry.db'], '备份包必须包含 telemetry.db');
  assert.equal(typeof backupObj.data['telemetry.db'], 'string');
  assert.ok(backupObj.data['telemetry.db'].length > 0);

  // 3. 删除 SQLite 中的 Session 细节，验证数据确实先从数据库中清掉了
  sqliteDb.deleteSessionDetail(sessionId);
  assert.equal(sqliteDb.getSessionDetail(sessionId), undefined);

  // 4. 模拟 POST /backup/restore 请求
  const restoreRoute = systemRouter.stack.find(layer => layer.route && layer.route.path === '/backup/restore' && layer.route.methods.post);
  assert.ok(restoreRoute, 'POST /backup/restore 路由已注册');

  const restoreReq = { method: 'POST', originalUrl: '/backup/restore', body: exportedBuffer };
  let restoreResult = null;

  await new Promise((resolve) => {
    const restoreRes = {
      setHeader: () => {},
      status: (code) => { return restoreRes; },
      json: (result) => { restoreResult = result; resolve(); }
    };
    const restoreHandler = restoreRoute.route.stack[restoreRoute.route.stack.length - 1].handle;
    restoreHandler(restoreReq, restoreRes, () => resolve());
  });

  assert.ok(restoreResult && restoreResult.success, '恢复备份响应成功');

  // 5. 验证从恢复后的 SQLite 数据库中可以成功读取会话细节
  const restoredDetail = sqliteDb.getSessionDetail(sessionId);
  assert.ok(restoredDetail, 'SQLite 中成功恢复了 session 细节');
  assert.ok(restoredDetail.hifi_data_br, 'hifi_data_br BLOB 恢复成功');

  const loadedSession = loadSession(sessionId);
  assert.ok(loadedSession, 'loadSession 成功读取恢复后的会话');
  assert.equal(loadedSession.data.length, 1);
  assert.equal(loadedSession.data[0].speed, 100);

  // 清理测试数据与中间产生的备份文件夹
  sqliteDb.deleteSessionDetail(sessionId);
  if (fs.existsSync(summaryPath)) fs.unlinkSync(summaryPath);
  if (restoreResult && restoreResult.message) {
    const match = restoreResult.message.match(/data_backup_\d+/);
    if (match) {
      const backupFolderPath = path.join(path.dirname(stateManager.DATA_DIR), match[0]);
      if (fs.existsSync(backupFolderPath)) {
        fs.rmSync(backupFolderPath, { recursive: true, force: true });
      }
    }
  }
});
