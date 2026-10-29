import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dgram from 'dgram';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { parseTelemetryPacket } from './telemetry-parser.js';
import { generateSectors, validateTrackQuality, detectTurnsEnhanced, buildRouteBook } from './track-builder.js';
import { stateManager } from './services/state-manager.js';
import { migrateMonolithicDatabase } from './storage/migration.js';
import { runSessionRetentionCleanup } from './services/retention.js';

// 子系统与存储模块导入
import { getLocalIPs, loadJSON, saveJSON } from './utils/helpers.js';
import { sqliteDb } from './storage/sqlite-db.js';
import {
  loadTracksDatabase,
  saveTracksDatabase,
  readTrackDetailAsync,
  writeTrackDetail,
  migrateOldSessions
} from './storage/session-db.js';

// 子路由器导入
import analysisRouter from './routes/analysis.js';
import exportRouter from './routes/export.js';
import tracksRouter from './routes/tracks.js';
import tunesRouter from './routes/tunes.js';
import sessionsRouter from './routes/sessions.js';
import vehiclesRouter from './routes/vehicles.js';
import leaderboardRouter from './routes/leaderboard.js';
import navigationRouter from './routes/navigation.js';
import systemRouter, { settingsRouter, backupRouter } from './routes/system.js';
import recordRouterModule from './routes/record.js';
import { configureHttpApp } from './http-app.js';

const UDP_PORT = process.env.UDP_PORT ? parseInt(process.env.UDP_PORT, 10) : 9996;
const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 9188;
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

// 本地环境加载
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      process.env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
    }
  });
}

// 初始化目录与基本字典数据
[DATA_DIR, DATA_DIR + '/tracks', DATA_DIR + '/sessions'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
migrateOldSessions();
try {
  sqliteDb.migrateAllOldSessions();
} catch (e) {
  console.error('[index.js] 自动全量迁移至 SQLite 失败:', e.message);
}

let vehicles = loadJSON(DATA_DIR + '/vehicles.json');
let tracks = loadTracksDatabase();
let tunes = loadJSON(DATA_DIR + '/tunes.json');
const carsDbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'config/cars-database.json');
let carsDatabase = fs.existsSync(carsDbPath) ? loadJSON(carsDbPath) : {};
let packetCount = 0;
let lastPacketTime = null;
let currentData = null;

// 车辆记账限频：lastUsed 最多 5s 刷一次，落盘也最多 5s 一次（避免每包字符串分配与写盘）
const VEHICLE_ACCOUNTING_INTERVAL_MS = 5000;
let lastVehicleAccountingTime = 0;
let lastVehiclePersistTime = 0;
let vehicleAccountingDirty = false;

const udpServer = dgram.createSocket('udp4');
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });


stateManager.tracks = tracks;
stateManager.vehicles = vehicles;
stateManager.tunes = tunes;
console.log("--> setIO called!"); stateManager.setIO(io);
stateManager.DATA_DIR = DATA_DIR;

const recordModule = recordRouterModule;

// Socket.io 监听
io.on('connection', (socket) => {
  console.log('[Socket] 客户端已连接:', socket.id);
  socket.emit('telemetry', currentData || {
    isRaceOn: false,
    car: { ordinal: 0, class: 0, performanceIndex: 0, drivetrainType: 0 },
    controls: { gear: 0 },
    currentEngineRpm: 0,
    engineMaxRpm: 8000,
    speedKmh: 0,
    lapNumber: 0,
    racePosition: 0
  });
});

udpServer.on('error', (err) => {
  console.error('[UDP] 错误:', err.message);
});

const STATIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
configureHttpApp({
  app,
  express,
  exportRouter,
  routers: {
    analysis: analysisRouter, tracks: tracksRouter, tunes: tunesRouter, vehicles: vehiclesRouter,
    leaderboard: leaderboardRouter, navigation: navigationRouter, system: systemRouter, settings: settingsRouter, backup: backupRouter, sessions: sessionsRouter,
  },
  recordRouter: recordModule.router,
  staticDir: STATIC_DIR,
  hasStaticDir: fs.existsSync(STATIC_DIR),
  getStatus: () => ({ udpPort: UDP_PORT, ips: getLocalIPs(), packetCount, lastPacketTime, isReceiving: lastPacketTime && (Date.now() - new Date(lastPacketTime).getTime() < 2000), isManualRecording: recordModule.getIsManualRecording(), autoRecordState: recordModule.getAutoRecordState() }),
  getCurrent: () => currentData || {},
});

// UDP 包接收分发循环
const EMIT_INTERVAL_MS = 33;
let lastEmitTime = 0;

udpServer.on('message', (msg, rinfo) => {
  packetCount++;
  stateManager.setPacketCount(packetCount);
  lastPacketTime = new Date();
  
  const now = Date.now();
  const view = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
  const isRaceOn = view.getInt32(0, true) === 1;
  const isRecording = recordModule.getIsManualRecording() || (recordModule.getAutoRecordState() === 'RECORDING');
  
  if (isRecording || isRaceOn) {
    const telemetry = parseTelemetryPacket(msg);
    if (telemetry) {
      processTelemetryPacket(telemetry, msg.length);
    }
  } else if (now - lastEmitTime >= EMIT_INTERVAL_MS) {
    const telemetry = parseTelemetryPacket(msg);
    if (telemetry) {
      processTelemetryPacket(telemetry, msg.length);
      lastEmitTime = now;
    }
  }
});

function processTelemetryPacket(telemetry, msgLength) {
  currentData = telemetry;
  telemetry._packetSize = msgLength;
  
  const now = Date.now();
  if (now - lastEmitTime >= EMIT_INTERVAL_MS) {
    io.emit('telemetry', telemetry);
    lastEmitTime = now;
  }
  
  // 调试日志输出
  if (packetCount % 100 === 1) {
    console.log('[调试] isRaceOn=' + telemetry.isRaceOn + ' rpm=' + telemetry.currentEngineRpm?.toFixed(0) + ' pos=' + telemetry.racePosition + ' lap=' + telemetry.lapNumber + ' speed=' + telemetry.speedKmh?.toFixed(0) + ' isManual=' + recordModule.getIsManualRecording() + ' pos=(' + telemetry.position?.x?.toFixed(0) + ',' + telemetry.position?.z?.toFixed(0) + ')');
  }
  
  // 车辆自动探测与更新
  if (telemetry.car && telemetry.car.ordinal && telemetry.car.ordinal > 0) {
    const carOrd = telemetry.car.ordinal;
    if (!vehicles[carOrd]) {
      vehicles[carOrd] = {
        name: carsDatabase[carOrd] || `Car #${carOrd}`,
        class: telemetry.car.class || '?',
        pi: telemetry.car.performanceIndex || 0,
        drivetrain: ['FWD','RWD','AWD'][telemetry.car.drivetrainType] || 'Unknown',
        firstSeen: new Date().toISOString(),
        raceCount: 0,
        tracks: [],
        bestLap: null,
        lastUsed: new Date().toISOString(),
        autoDetected: true
      };
      saveJSON(DATA_DIR + '/vehicles.json', vehicles);
      lastVehiclePersistTime = now;
      vehicleAccountingDirty = false;
      console.log(`[Vehicle] 自动识别新车辆: ${vehicles[carOrd].name}`);
      io.emit('vehicleDetected', vehicles[carOrd]);
    } else {
      if (now - lastVehicleAccountingTime >= VEHICLE_ACCOUNTING_INTERVAL_MS) {
        vehicles[carOrd].lastUsed = new Date().toISOString();
        lastVehicleAccountingTime = now;
        vehicleAccountingDirty = true;
      }
      let updated = false;
      if ((!vehicles[carOrd].name || vehicles[carOrd].name.startsWith('Car #')) && carsDatabase[carOrd]) {
        vehicles[carOrd].name = carsDatabase[carOrd];
        updated = true;
        console.log(`[Vehicle] 自动修正已存在车辆的名称: ${carOrd} -> ${vehicles[carOrd].name}`);
      }
      if (telemetry.car.performanceIndex && telemetry.car.performanceIndex > vehicles[carOrd].pi) {
        vehicles[carOrd].pi = telemetry.car.performanceIndex;
        updated = true;
      }
      if (updated) vehicleAccountingDirty = true;
      if (vehicleAccountingDirty && now - lastVehiclePersistTime >= VEHICLE_ACCOUNTING_INTERVAL_MS) {
        saveJSON(DATA_DIR + '/vehicles.json', vehicles);
        lastVehiclePersistTime = now;
        vehicleAccountingDirty = false;
      }
    }
  }

  // 分发至录制模块进行处理
  recordModule.handleAutoRecord(telemetry);
  recordModule.onPacketReceived(telemetry);
}

// 服务引导流程
(async () => {
  try {
    await migrateMonolithicDatabase(DATA_DIR);
    await runSessionRetentionCleanup(path.join(DATA_DIR, 'sessions'));
    await stateManager.bootstrap();
    const freshTracks = loadTracksDatabase();
    Object.keys(tracks).forEach(k => delete tracks[k]);
    Object.assign(tracks, freshTracks);

    // 赛道弯道缺失自愈合
    const tracksDir = path.join(DATA_DIR, 'tracks');
    if (fs.existsSync(tracksDir)) {
      const trackFiles = fs.readdirSync(tracksDir).filter(f => f.endsWith('.json') || f.endsWith('.json.br'));
      // 读盘阶段并发（写盘与检测仍串行，输出顺序与结果不变）
      const loadedTracks = await Promise.all(trackFiles.map(async (file) => {
        const id = file.replace('.json.br', '').replace('.json', '');
        try {
          return { file, id, detail: await readTrackDetailAsync(id) };
        } catch (e) {
          console.error(`[启动自愈合] 读取 ${file} 失败:`, e.message);
          return null;
        }
      }));
      let healedCount = 0;
      for (const entry of loadedTracks) {
        if (!entry || !entry.detail) continue;
        const { file, id, detail } = entry;
        try {
          if ((!detail.turns || detail.turns.length === 0) && detail.centerline && detail.centerline.length > 20) {
            console.log(`[启动自愈合] 修复赛道: ${detail.name || id}`);
            const turns = detectTurnsEnhanced(detail.centerline);
            detail.turns = turns;
            detail.sectors = generateSectors(detail.centerline, turns);
            const allPts = [];
            if (detail.trajectories) detail.trajectories.forEach(t => { if (t.points) allPts.push(...t.points); });
            detail.routeBook = buildRouteBook(detail.centerline, turns, allPts.length > 0 ? allPts : detail.centerline);

            detail.quality = validateTrackQuality(detail);
            
            writeTrackDetail(id, detail);
            
            if (tracks[id]) {
              tracks[id].turns = turns;
              tracks[id].sectors = detail.sectors;
              tracks[id].routeBook = detail.routeBook;
              tracks[id].quality = detail.quality;
            }
            healedCount++;
          }
        } catch (e) {
          console.error(`[启动自愈合] 处理 ${file} 失败:`, e.message);
        }
      }
      if (healedCount > 0) {
        saveTracksDatabase(tracks);
        console.log(`[启动自愈合] 共修复 ${healedCount} 条赛道弯道数据`);
      }
    }

    udpServer.bind(UDP_PORT);
    httpServer.listen(HTTP_PORT, () => {
      const ips = getLocalIPs();
      console.log('Forza Horizon 5 遥测系统 API Server (已开启缓存优化与分包存储)');
      console.log('API: http://localhost:' + HTTP_PORT);
      console.log('React Client: http://localhost:9188');
      console.log('UDP Port: ' + UDP_PORT);
      console.log('IP: ' + ips.map(i => i.address).join(', '));
    });
  } catch (err) {
    console.error('[Bootstrap] 服务器引导失败:', err);
    udpServer.bind(UDP_PORT);
    httpServer.listen(HTTP_PORT);
  }
})();

process.on('uncaughtException', (err) => console.error('[Process] 未捕获异常:', err));
process.on('unhandledRejection', (reason) => console.error('[Process] 未处理Promise拒绝:', reason));

process.on('SIGINT', () => {
  udpServer.close();
  httpServer.close(() => {
    console.log('[Server] 已关闭');
    process.exit(0);
  });
});
