const fs = require('fs');

let index = fs.readFileSync('server/src/index.js', 'utf8');

// Remove routerContext definition
const startIdx = index.indexOf('// 全局上下文');
if (startIdx !== -1) {
  const endIdx = index.indexOf('// 挂载核心模块化路由');
  if (endIdx !== -1) {
    index = index.substring(0, startIdx) + `
stateManager.tracks = tracks;
stateManager.vehicles = vehicles;
stateManager.tunes = tunes;
stateManager.setIO(io);
stateManager.DATA_DIR = DATA_DIR;

` + index.substring(endIdx);
  }
}

// Fix router passes
index = index.replace('recordRouterModule(routerContext)', 'recordRouterModule');
index = index.replace('analysisRouter(routerContext)', 'analysisRouter');
index = index.replace('tracksRouter(routerContext)', 'tracksRouter');
index = index.replace('tunesRouter(routerContext)', 'tunesRouter');
index = index.replace('vehiclesRouter(routerContext)', 'vehiclesRouter');
index = index.replace('leaderboardRouter(routerContext)', 'leaderboardRouter');
index = index.replace('navigationRouter(routerContext)', 'navigationRouter');
index = index.replace('systemRouter(routerContext)', 'systemRouter');
index = index.replace('sessionsRouter(routerContext)', 'sessionsRouter');

fs.writeFileSync('server/src/index.js', index);
console.log('index.js safely updated');

