import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stateManager } from '../src/services/state-manager.js';
import { writeSummary, invalidateSummaryCache } from '../src/storage/session-store.js';
import leaderboardRouter from '../src/routes/leaderboard.js';
import tunesRouter from '../src/routes/tunes.js';

function invokeRoute(router, method, routePath, { query = {}, params = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const layer = router.stack.find((s) => s.route && s.route.path === routePath);
    if (!layer) return reject(new Error(`Route ${routePath} not found`));
    const handler = layer.route.stack[0].handle;

    let statusCode = 200;
    const req = { method, url: routePath, query, params, body };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resolve({ statusCode, data });
        return this;
      }
    };
    try {
      handler(req, res, reject);
    } catch (err) {
      reject(err);
    }
  });
}

test('leaderboard 路由通过 session-store 读取会话摘要并正确聚合排行榜', async () => {
  invalidateSummaryCache();
  stateManager.setLeaderboardCache(null);

  const testSessionId = 'test_lb_sess_' + Date.now();
  const summary = {
    id: testSessionId,
    trackId: 'test_track_1',
    trackName: 'Test Track',
    savedAt: new Date().toISOString(),
    vehicle: { ordinal: 9999, class: 5, performanceIndex: 850 },
    laps: { best: 85.123, last: 86.0, count: 5 },
    summary: { duration: 500 }
  };
  await writeSummary(testSessionId, summary);

  try {
    const { statusCode, data } = await invokeRoute(leaderboardRouter, 'GET', '/', {
      query: { trackId: 'test_track_1' }
    });

    assert.equal(statusCode, 200);
    assert.ok(Array.isArray(data));
    const entry = data.find((item) => item.trackId === 'test_track_1' && item.vehicleOrdinal === 9999);
    assert.ok(entry, '聚合排行榜中应包含新建的会话记录');
    assert.equal(entry.bestLap, 85.123);
    assert.equal(entry.vehicleClass, 5);
    assert.equal(entry.vehiclePI, 850);
  } finally {
    const summaryFile = path.join(stateManager.DATA_DIR, 'sessions', `${testSessionId}_summary.json`);
    const backupFile = summaryFile + '.bak';
    await fs.rm(summaryFile, { force: true });
    await fs.rm(backupFile, { force: true });
    invalidateSummaryCache();
    stateManager.setLeaderboardCache(null);
  }
});

test('tunes /compare 路由通过 session-store 读取会话并对比两个调校表现', async () => {
  invalidateSummaryCache();

  const carOrdinal = 8888;
  const tuneIdA = 'tune_test_A_' + Date.now();
  const tuneIdB = 'tune_test_B_' + Date.now();
  stateManager.tunes[tuneIdA] = { id: tuneIdA, name: 'Tune A', carOrdinal };
  stateManager.tunes[tuneIdB] = { id: tuneIdB, name: 'Tune B', carOrdinal };

  const testSessionA = 'test_tune_sess_A_' + Date.now();
  const testSessionB = 'test_tune_sess_B_' + Date.now();

  await writeSummary(testSessionA, {
    id: testSessionA,
    trackId: 'test_track_compare',
    tuneId: tuneIdA,
    vehicle: { ordinal: carOrdinal },
    laps: { best: 90.0, count: 2 }
  });

  await writeSummary(testSessionB, {
    id: testSessionB,
    trackId: 'test_track_compare',
    tuneId: tuneIdB,
    vehicle: { ordinal: carOrdinal },
    laps: { best: 88.5, count: 3 }
  });

  try {
    const { statusCode, data } = await invokeRoute(tunesRouter, 'GET', '/compare', {
      query: {
        tuneIdA,
        tuneIdB,
        trackId: 'test_track_compare'
      }
    });

    assert.equal(statusCode, 200);
    assert.equal(data.status, 'ok');
    assert.equal(data.tuneA.tuneId, tuneIdA);
    assert.equal(data.tuneA.bestLap, 90.0);
    assert.equal(data.tuneA.sessionCount, 1);
    assert.equal(data.tuneB.tuneId, tuneIdB);
    assert.equal(data.tuneB.bestLap, 88.5);
    assert.equal(data.tuneB.sessionCount, 1);
  } finally {
    delete stateManager.tunes[tuneIdA];
    delete stateManager.tunes[tuneIdB];
    const fileA = path.join(stateManager.DATA_DIR, 'sessions', `${testSessionA}_summary.json`);
    const fileB = path.join(stateManager.DATA_DIR, 'sessions', `${testSessionB}_summary.json`);
    await fs.rm(fileA, { force: true });
    await fs.rm(fileA + '.bak', { force: true });
    await fs.rm(fileB, { force: true });
    await fs.rm(fileB + '.bak', { force: true });
    invalidateSummaryCache();
  }
});
