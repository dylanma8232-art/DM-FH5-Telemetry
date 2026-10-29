import test from 'node:test';
import assert from 'node:assert/strict';
import { configureHttpApp } from '../src/http-app.js';

function createAppSpy() {
  const calls = [];
  return {
    calls,
    use(...args) { calls.push({ method: 'use', args }); },
    get(...args) { calls.push({ method: 'get', args }); },
  };
}

const routers = Object.fromEntries(
  ['analysis', 'tracks', 'tunes', 'vehicles', 'leaderboard', 'navigation', 'system', 'sessions']
    .map((name) => [name, { name }]),
);

test('HTTP 装配保持既有路由挂载顺序与兼容设置路径', () => {
  const app = createAppSpy();
  configureHttpApp({
    app, express: { static: () => 'staticMiddleware' }, routers, recordRouter: { name: 'record' },
    staticDir: '/dist', hasStaticDir: false, getStatus: () => ({}), getCurrent: () => ({}),
  });

  assert.deepEqual(
    app.calls.filter(({ method }) => method === 'use').map(({ args }) => [args[0], args[1]?.name]),
    [
      ['/api/analysis', 'analysis'], ['/api/tracks', 'tracks'], ['/api/tunes', 'tunes'],
      ['/api/vehicles', 'vehicles'], ['/api/leaderboard', 'leaderboard'], ['/api', 'navigation'],
      ['/api/system', 'system'], ['/api/settings', 'system'], ['/api', 'system'],
      ['/api', 'record'], ['/', 'sessions'],
    ],
  );
});

test('静态页面回退不会拦截 API 或 Socket 请求', () => {
  const app = createAppSpy();
  configureHttpApp({
    app, express: { static: (dir) => ({ dir }) }, routers, recordRouter: {}, staticDir: '/dist',
    hasStaticDir: true, getStatus: () => ({ ok: true }), getCurrent: () => ({ speedKmh: 0 }),
  });

  const fallback = app.calls.find(({ method, args }) => method === 'get' && args[0] === '*').args[1];
  const sent = [];
  const response = { sendFile: (file) => sent.push(file) };
  let nextCount = 0;
  fallback({ path: '/api/status' }, response, () => { nextCount++; });
  fallback({ path: '/socket.io/socket' }, response, () => { nextCount++; });
  fallback({ path: '/tracks/abc' }, response, () => { nextCount++; });

  assert.equal(nextCount, 2);
  assert.deepEqual(sent, ['/dist/index.html']);
  assert.deepEqual(app.calls.find(({ method, args }) => method === 'use' && args[0]?.dir === '/dist').args[0], { dir: '/dist' });
});
