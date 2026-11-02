import test from 'node:test';
import assert from 'node:assert/strict';
import tracksRouter from '../src/routes/tracks.js';
import vehiclesRouter from '../src/routes/vehicles.js';
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
  const batchIdx = paths.indexOf('PUT /sessions/batch/track');
  const singleIdx = paths.indexOf('PUT /sessions/:id/track');
  assert.ok(batchIdx >= 0 && singleIdx >= 0);
  assert.ok(batchIdx < singleIdx, `batch(${batchIdx}) 必须先于 :id(${singleIdx}) 注册`);
});

test('车辆关联调校查询路由已注册（B07 删除确认用）', () => {
  assert.ok(routesOf(vehiclesRouter).includes('GET /:id/linked-tunes'));
});

test('删除会话会清空该会话的分析缓存（Q4）', async () => {
  const { invalidateAnalysisCache, __seedAnalysisCacheForTest, __readAnalysisCacheForTest } =
    await import('../src/routes/analysis.js');

  // 真实填充：按路由实际使用的 key 前缀写入多条派生缓存
  __seedAnalysisCacheForTest([
    ['overview_sess-A', { sessionId: 'sess-A' }],
    ['turns_sess-A', { turns: [] }],
    ['ai_stats_sess-A', { drivingScore: 0 }],
    ['overview_sess-B', { sessionId: 'sess-B' }],
  ]);

  // 删除前缓存确实存在
  assert.ok(__readAnalysisCacheForTest('overview_sess-A'));
  assert.ok(__readAnalysisCacheForTest('overview_sess-B'));

  // 删除 sess-A 应清掉它名下的全部派生缓存，且不影响 sess-B
  const removed = invalidateAnalysisCache('sess-A');
  assert.equal(removed, 3);
  assert.equal(__readAnalysisCacheForTest('overview_sess-A'), null);
  assert.equal(__readAnalysisCacheForTest('turns_sess-A'), null);
  assert.equal(__readAnalysisCacheForTest('ai_stats_sess-A'), null);
  assert.ok(__readAnalysisCacheForTest('overview_sess-B'));

  // 对不存在/空的 session 仍返回 0，不抛错（存在性由删除流程先判定）
  assert.equal(invalidateAnalysisCache('not-exists-session'), 0);
  assert.equal(invalidateAnalysisCache(null), 0);
});
