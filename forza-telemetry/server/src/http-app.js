/**
 * HTTP 应用的装配边界。
 *
 * 这里刻意只负责挂载顺序和静态页面回退；运行时可变状态仍由 index.js
 * 提供，避免路由、UDP 和 Socket.IO 在重构时获得不同的数据引用。
 */
export function configureHttpApp({
  app,
  express,
  routers,
  exportRouter,
  recordRouter,
  staticDir,
  hasStaticDir,
  getStatus,
  getCurrent,
}) {
  app.use('/api/export', exportRouter);
  app.use('/api/analysis', routers.analysis);
  app.use('/api/tracks', routers.tracks);
  app.use('/api/tunes', routers.tunes);
  app.use('/api/vehicles', routers.vehicles);
  app.use('/api/leaderboard', routers.leaderboard);
  app.use('/api', routers.navigation);
  app.use('/api/system', routers.system);
  // 兼容旧版设置页的调用路径，避免已打开的页面保存 AI 配置时直接 404。
  app.use('/api/settings', routers.system);
  // 兼容既有前端与文档里的 /api/backup/* 路径（system 路由内的 backup/export、backup/restore）。
  app.use('/api', routers.system);
  app.use('/api', recordRouter);
  app.use('/', routers.sessions);

  // 保持原有顺序：静态回退在状态与根接口之前挂载，且 API/Socket 请求交回后续路由。
  if (hasStaticDir) {
    app.use(express.static(staticDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
      res.sendFile(`${staticDir}/index.html`);
    });
  }

  app.get('/api/status', (req, res) => res.json(getStatus()));
  app.get('/api/current', (req, res) => res.json(getCurrent()));
  app.get('/', (req, res) => {
    res.json({
      name: 'Forza Horizon 5 遥测系统 API',
      version: '2.0',
      endpoints: {
        status: '/api/status', current: '/api/current', tracks: '/api/tracks',
        vehicles: '/api/vehicles', sessions: '/api/sessions', tunes: '/api/tunes', leaderboard: '/api/leaderboard',
      },
    });
  });
}
