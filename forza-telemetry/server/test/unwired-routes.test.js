import test from 'node:test';
import assert from 'node:assert/strict';
import tracksRouter from '../src/routes/tracks.js';
import systemRouter from '../src/routes/system.js';

// 契约测试：客户端 api.js / 页面实际调用的路径必须在服务端存在对应路由。
// 这里只做「路由已注册」的静态契约校验，不触碰任何赛道业务逻辑。
const routesOf = (router) => router.stack
  .filter((layer) => layer.route)
  .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route.path}`));

test('GET /:id/thumbnail 已注册（比赛中心 TrackThumbnail 的调用目标）', () => {
  assert.ok(routesOf(tracksRouter).includes('GET /:id/thumbnail'));
});

test('system 路由提供 /backup/export 与 /backup/restore（/api 与 /api/system 两个挂载点都会命中）', () => {
  const routes = routesOf(systemRouter);
  assert.ok(routes.includes('GET /backup/export'));
  assert.ok(routes.includes('POST /backup/restore'));
});

test('批量关联赛道路由必须注册在单场 /:id/track 之前（否则 batch 会被当成 sessionId）', async () => {
  const { default: sessionsRouter } = await import('../src/routes/sessions.js');
  const paths = sessionsRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
  const batchIdx = paths.indexOf('PUT /api/sessions/batch/track');
  const singleIdx = paths.indexOf('PUT /api/sessions/:id/track');
  assert.ok(batchIdx >= 0 && singleIdx >= 0);
  assert.ok(batchIdx < singleIdx, `batch(${batchIdx}) 必须先于 :id(${singleIdx}) 注册`);
});
