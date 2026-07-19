import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/services/api.js';

test('AI 改装请求保持既有接口、方法和请求体', async () => {
  let request;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ withinTarget: true, parts: {} }), { status: 200 });
  };

  try {
    const result = await api.vehicles.aiSolve('123', { targetPi: 900, raceType: 'road' });
    assert.equal(request.url, '/api/vehicles/123/upgrades/ai-solve');
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), { targetPi: 900, raceType: 'road' });
    assert.equal(result.withinTarget, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API 错误保留状态码和服务端信息', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: '方案无效' }), { status: 422 });

  try {
    await assert.rejects(api.vehicles.aiSolve('123', {}), error => error.status === 422 && error.message === '方案无效');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('遥测诊断接口保持既有请求路径', async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(url);
    return new Response(JSON.stringify([]), { status: 200 });
  };

  try {
    await api.sessions.list();
    await api.analysis.getTuningRecommendations('session-1');
    await api.sessions.getTelemetry('session-1');
    assert.deepEqual(requests, [
      '/api/sessions',
      '/api/analysis/session-1/tuning-recommendations',
      '/api/sessions/session-1/telemetry'
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('赛道原始响应方法保留页面的状态分支能力与请求语义', async () => {
  let request;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ error: '重建失败' }), { status: 422 });
  };

  try {
    const response = await api.tracks.rebuildResponse('track-1');
    assert.equal(request.url, '/api/tracks/track-1/rebuild');
    assert.deepEqual(request.options, { method: 'POST' });
    assert.equal(response.ok, false);
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: '重建失败' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('录制和路书停止保留原始响应及既有请求方法', async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(null, { status: 204 });
  };

  try {
    const [record, trackMode] = await Promise.all([
      api.record.stopResponse(),
      api.trackMode.stopResponse()
    ]);
    assert.equal(record.status, 204);
    assert.equal(trackMode.status, 204);
    assert.deepEqual(requests, [
      { url: '/api/record/stop', options: { method: 'POST' } },
      { url: '/api/trackMode/stop', options: { method: 'POST' } }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('备份恢复与导出分别保留二进制和 Blob 原始响应语义', async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response('backup', { status: 200 });
  };

  try {
    const buffer = new ArrayBuffer(4);
    const restore = await api.backup.restoreResponse(buffer);
    const download = await api.exports.downloadResponse('csv', 'session-1');
    assert.equal(restore.ok, true);
    assert.equal(await download.text(), 'backup');
    assert.equal(requests[0].url, '/api/backup/restore');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers['Content-Type'], 'application/octet-stream');
    assert.equal(requests[0].options.body, buffer);
    assert.deepEqual(requests[1], { url: '/api/export/csv/session-1', options: undefined });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
