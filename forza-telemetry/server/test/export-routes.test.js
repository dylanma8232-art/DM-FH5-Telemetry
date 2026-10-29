import test from 'node:test';
import assert from 'node:assert/strict';
import exportRouter from '../src/routes/export.js';

const routesOf = (router) => router.stack
  .filter((layer) => layer.route)
  .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route.path}`));

test('GET /:format/:sessionId 已注册（useSessionHistory.downloadBlob 的调用目标）', () => {
  assert.ok(routesOf(exportRouter).includes('GET /:format/:sessionId'));
});
