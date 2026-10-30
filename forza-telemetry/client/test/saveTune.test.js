import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/services/api.js';

test('api.tunes.update 发送 PUT 请求至 /api/tunes/:id 并包含修改后的调校数据', async () => {
  let request;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      status: 'ok',
      tune: {
        id: 'tune_123',
        name: '测试方案',
        vehicleId: 'car_1',
        tires: { frontPressure: 2.1, rearPressure: 2.0 }
      }
    }), { status: 200 });
  };

  try {
    const previewTune = {
      id: 'tune_123',
      name: '测试方案',
      vehicleId: 'car_1',
      basePi: 500,
      totalPi: 800,
      tires: { frontPressure: 2.1, rearPressure: 2.0 },
      suspension: { frontSpring: 100 },
      parts: {}
    };

    const result = await api.tunes.update(previewTune.id, previewTune);
    assert.equal(request.url, '/api/tunes/tune_123');
    assert.equal(request.options.method, 'PUT');
    assert.deepEqual(JSON.parse(request.options.body), previewTune);
    assert.equal(result.status, 'ok');
    assert.equal(result.tune.tires.frontPressure, 2.1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api.tunes.update 失败时抛出错误保留 HTTP 状态码与服务器错误消息', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: '保存失败：调校未找到' }), { status: 404 });

  try {
    await assert.rejects(
      api.tunes.update('non_existent', { name: '未知方案' }),
      (err) => err.status === 404 && err.message === '保存失败：调校未找到'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
