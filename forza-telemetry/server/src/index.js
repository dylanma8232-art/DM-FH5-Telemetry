import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dgram from 'dgram';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { parseTelemetryPacket } from './telemetry-parser.js';
import { buildTrackFromTrajectories, generateNavigationData, calculateTrackSimilarity, generateSectors, recognizeTrack, validateTrackQuality } from './track-builder.js';
import zlib from 'zlib';


const UDP_PORT = 9996;
const HTTP_PORT = 9188;
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const TRACK_DB_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/tracks-database.json');

// 小米TTS配置
const TTS_API_URL = 'https://token-plan-cn.xiaomimimo.com/v1';
const TTS_API_KEY = 'tp-c6v5w7m0irz9541u80ycd6r6eb8pw6h3cst1hlzr7izf8soq';
const TTS_MODEL = 'mimo-v2.5-tts';

// TTS缓存
const ttsCache = new Map();

// 调用小米TTS API
async function generateTTS(text) {
  // 检查缓存
  if (ttsCache.has(text)) {
    return ttsCache.get(text);
  }
  
  try {
    const response = await fetch(`${TTS_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TTS_API_KEY}`
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        messages: [
          { role: 'user', content: '请播报' },
          { role: 'assistant', content: text }
        ],
        audio: { format: 'mp3' }
      })
    });
    
    if (!response.ok) {
      console.error(`[TTS] API错误: ${response.status}`);
      return null;
    }
    
    const result = await response.json();
    const choices = result.choices || [];
    if (choices.length === 0) {
      console.error('[TTS] 无返回数据');
      return null;
    }
    
    const audioData = choices[0].message?.audio?.data;
    if (!audioData) {
      console.error('[TTS] 无音频数据');
      return null;
    }
    
    // 转换为DataURL
    const audioUrl = audioData.startsWith('data:') ? audioData : `data:audio/mp3;base64,${audioData}`;
    
    // 缓存结果
    ttsCache.set(text, audioUrl);
    
    // 限制缓存大小
    if (ttsCache.size > 100) {
      const firstKey = ttsCache.keys().next().value;
      ttsCache.delete(firstKey);
    }
    
    return audioUrl;
  } catch (e) {
    console.error(`[TTS] 错误:`, e.message);
    return null;
  }
}

[DATA_DIR, DATA_DIR + '/tracks', DATA_DIR + '/sessions'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push({ name, address: iface.address });
    }
  }
  return ips;
}

function loadJSON(file, def = {}) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; } }
function saveJSON(file, data) {
  try {
    const content = JSON.stringify(data);
    fs.writeFileSync(file, content);
    return true;
  } catch (err) {
    console.error(`[SaveJSON] 写入失败 ${file}:`, err.message);
    return false;
  }
}

// ===== 赛道与遥测数据优化辅助方法 =====

function loadTracksDatabase() {
  const gzPath = DATA_DIR + '/tracks.json.gz';
  const jsonPath = DATA_DIR + '/tracks.json';
  
  if (fs.existsSync(gzPath)) {
    try {
      const buffer = fs.readFileSync(gzPath);
      const decompressed = zlib.gunzipSync(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (err) {
      console.error('[loadTracksDatabase] 读取 tracks.json.gz 失败:', err.message);
    }
  }
  
  if (fs.existsSync(jsonPath)) {
    try {
      console.log('[loadTracksDatabase] 发现未压缩的 tracks.json，正在转换为压缩格式...');
      const rawContent = fs.readFileSync(jsonPath, 'utf8');
      const data = JSON.parse(rawContent);
      saveTracksDatabase(data);
      try {
        fs.unlinkSync(jsonPath);
        console.log('[loadTracksDatabase] 成功清理旧的 tracks.json 文件。');
      } catch (e) {
        console.warn('[loadTracksDatabase] 无法删除旧的 tracks.json 文件:', e.message);
      }
      return data;
    } catch (err) {
      console.error('[loadTracksDatabase] 读取 tracks.json 失败:', err.message);
    }
  }
  
  if (fs.existsSync(TRACK_DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(TRACK_DB_PATH, 'utf8'));
    } catch {
      return {};
    }
  }
  
  return {};
}

function saveTracksDatabase(data) {
  const gzPath = DATA_DIR + '/tracks.json.gz';
  try {
    const jsonStr = JSON.stringify(data);
    const compressed = zlib.gzipSync(Buffer.from(jsonStr));
    fs.writeFileSync(gzPath, compressed);
    return true;
  } catch (err) {
    console.error(`[saveTracksDatabase] 写入 ${gzPath} 失败:`, err.message);
    return false;
  }
}

function saveSession(sessionId, sessionData) {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  try {
    const summaryData = {
      id: sessionData.id || sessionId,
      trackName: sessionData.trackName || '未知赛道',
      trackId: sessionData.trackId || null,
      savedAt: sessionData.savedAt || new Date().toISOString(),
      autoRecorded: sessionData.autoRecorded ?? true,
      trackMode: sessionData.trackMode ?? false,
      tuneId: sessionData.tuneId || null,
      summary: sessionData.summary || {
        dataCount: sessionData.data ? sessionData.data.length : 0,
        positionCount: sessionData.positions ? sessionData.positions.length : 0,
        duration: sessionData.summary?.duration || 0
      },
      vehicle: sessionData.vehicle || null,
      laps: sessionData.laps || {},
      hasDetail: !!(sessionData.data && sessionData.data.length > 0)
    };

    const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');

    if (sessionData.data && sessionData.data.length > 0) {
      const detailData = {
        id: sessionData.id || sessionId,
        data: sessionData.data,
        positions: sessionData.positions || []
      };
      const detailPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(detailData)));
      fs.writeFileSync(detailPath, compressed);
    }
    
    autoCleanupSessionDetails(10);
    return true;
  } catch (err) {
    console.error(`[saveSession] 保存 session ${sessionId} 失败:`, err.message);
    return false;
  }
}

function loadSession(sessionId) {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
  
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      
      Object.defineProperty(summary, 'data', {
        get() {
          if (this._data) return this._data;
          const detailPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);
          if (fs.existsSync(detailPath)) {
            try {
              const buffer = fs.readFileSync(detailPath);
              const decompressed = zlib.gunzipSync(buffer);
              const detail = JSON.parse(decompressed.toString('utf8'));
              this._data = detail.data || [];
            } catch (e) {
              console.error(`[loadSession] 解压 ${sessionId} 细节数据失败:`, e.message);
              this._data = [];
            }
          } else {
            this._data = [];
          }
          return this._data;
        },
        set(val) {
          this._data = val;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(summary, 'positions', {
        get() {
          if (this._positions) return this._positions;
          const detailPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);
          if (fs.existsSync(detailPath)) {
            try {
              const buffer = fs.readFileSync(detailPath);
              const decompressed = zlib.gunzipSync(buffer);
              const detail = JSON.parse(decompressed.toString('utf8'));
              this._positions = detail.positions || [];
            } catch (e) {
              console.error(`[loadSession] 解压 ${sessionId} 轨迹位置失败:`, e.message);
              this._positions = [];
            }
          } else {
            this._positions = [];
          }
          return this._positions;
        },
        set(val) {
          this._positions = val;
        },
        configurable: true,
        enumerable: true
      });

      return summary;
    } catch (err) {
      console.error(`[loadSession] 读取会话摘要 ${sessionId} 失败:`, err.message);
      return null;
    }
  }
  
  return null;
}

function autoCleanupSessionDetails(maxDetailsToKeep = 10) {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) return;
  
  try {
    const files = fs.readdirSync(sessionsDir);
    const summaries = files
      .filter(f => f.endsWith('_summary.json'))
      .map(f => {
        const filePath = path.join(sessionsDir, f);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return {
            id: data.id,
            savedAt: new Date(data.savedAt),
            file: f
          };
        } catch {
          return null;
        }
      })
      .filter(s => s !== null);
    
    summaries.sort((a, b) => b.savedAt - a.savedAt);
    
    if (summaries.length > maxDetailsToKeep) {
      const toCleanup = summaries.slice(maxDetailsToKeep);
      let cleanedCount = 0;
      for (const session of toCleanup) {
        const detailPath = path.join(sessionsDir, `${session.id}_detail.json.gz`);
        if (fs.existsSync(detailPath)) {
          try {
            fs.unlinkSync(detailPath);
            cleanedCount++;
            
            const summaryPath = path.join(sessionsDir, session.file);
            const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
            if (summaryData.hasDetail !== false) {
              summaryData.hasDetail = false;
              fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');
            }
          } catch (err) {
            console.error(`[Cleanup] 清理 ${session.id} 的细节数据失败:`, err.message);
          }
        }
      }
      if (cleanedCount > 0) {
        console.log(`[Cleanup] 自动清理了 ${cleanedCount} 个老旧会话的细节数据，保留了成绩摘要。`);
      }
    }
  } catch (err) {
    console.error('[Cleanup] 运行自动清理失败:', err.message);
  }
}

function migrateOldSessions() {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) return;
  
  try {
    const files = fs.readdirSync(sessionsDir);
    let migratedCount = 0;
    
    for (const file of files) {
      if (file.startsWith('session_') && file.endsWith('.json') && !file.endsWith('_summary.json')) {
        const filePath = path.join(sessionsDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) continue;
          
          console.log(`[Migration] 发现旧的历史会话文件: ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)，正在转换并压缩...`);
          
          const rawContent = fs.readFileSync(filePath, 'utf8');
          const sessionData = JSON.parse(rawContent);
          const id = sessionData.id || file.replace('.json', '');
          
          const summaryData = {
            id: id,
            trackName: sessionData.trackName || '未知赛道',
            trackId: sessionData.trackId || null,
            savedAt: sessionData.savedAt || stats.mtime.toISOString(),
            autoRecorded: sessionData.autoRecorded ?? true,
            trackMode: sessionData.trackMode ?? false,
            tuneId: sessionData.tuneId || null,
            summary: sessionData.summary || {
              dataCount: sessionData.data ? sessionData.data.length : 0,
              positionCount: sessionData.positions ? sessionData.positions.length : 0,
              duration: sessionData.summary?.duration || 0
            },
            vehicle: sessionData.vehicle || null,
            laps: sessionData.laps || {},
            hasDetail: !!(sessionData.data && sessionData.data.length > 0)
          };
          
          const summaryPath = path.join(sessionsDir, `${id}_summary.json`);
          fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');
          
          if (sessionData.data && sessionData.data.length > 0) {
            const detailData = {
              id: id,
              data: sessionData.data,
              positions: sessionData.positions || []
            };
            const detailPath = path.join(sessionsDir, `${id}_detail.json.gz`);
            const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(detailData)));
            fs.writeFileSync(detailPath, compressed);
          }
          
          fs.unlinkSync(filePath);
          migratedCount++;
        } catch (err) {
          console.error(`[Migration] 转换旧文件失败 ${file}:`, err.message);
        }
      }
    }
    
    if (migratedCount > 0) {
      console.log(`[Migration] 成功转换并压缩了 ${migratedCount} 个旧历史会话文件。`);
    }
  } catch (err) {
    console.error('[Migration] 运行迁移任务失败:', err.message);
  }
}


// 历史轨迹降采样：每隔10个点取1个
function downsampleTrajectory(positions, step = 10) {
  if (!positions || positions.length <= step * 2) return positions;
  const sampled = [positions[0]];
  for (let i = step; i < positions.length - 1; i += step) {
    sampled.push(positions[i]);
  }
  sampled.push(positions[positions.length - 1]);
  return sampled;
}

// 轨迹数限制：最多保留5条历史轨迹
function trimTrajectories(trajectories, maxCount = 5) {
  if (!trajectories || trajectories.length <= maxCount) return trajectories;
  return trajectories.slice(-maxCount);
}

function loadSessionById(sessionId) {
  return loadSession(sessionId);
}

let vehicles = loadJSON(DATA_DIR + '/vehicles.json');
let tracks = loadTracksDatabase();
let tunes = loadJSON(DATA_DIR + '/tunes.json');

// 启动时自动迁移老旧的会话数据
migrateOldSessions();

const udpServer = dgram.createSocket('udp4');
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

udpServer.on('error', (err) => {
  console.error('[UDP] 错误:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('[UDP] 端口 9996 已被占用，请检查是否有其他实例在运行');
  }
});

// 静态文件服务 - 支持PWA/移动端通过服务器直接访问
const STATIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  // SPA fallback
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
      return next();
    }
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
  console.log('[Server] 静态文件服务已启用: ' + STATIC_DIR);
} else {
  console.log('[Server] 静态文件目录不存在，仅API模式运行: ' + STATIC_DIR);
}

let packetCount = 0, lastPacketTime = null, currentData = null;

// 数据节流配置
const EMIT_INTERVAL_MS = 33; // ~30fps (原来60fps)
let lastEmitTime = 0;

// 手动录制 - 用户主动控制，不影响自动录制
let isManualRecording = false, manualRecordedData = [], manualRacePositions = [];

// 自动录制 - 专用于赛道录制
let autoRecordedData = [], autoRacePositions = [];

// 赛道模式 - 选择特定赛道进行比赛
let trackMode = null; // { trackId: string, trackName: string }
let lastTurnIndex = -1; // 上次播报的弯道索引，避免重复播报

// 当前活跃调校（用于关联Session）
let currentTuneId = null;

// 自动录制状态机
let autoRecordState = 'IDLE'; // IDLE | RECORDING | POST_RACE
let autoRecordStartTimer = null;
let autoRecordStopTimer = null;
let autoRecordStartTime = null;
let lastRecognitionCheckTime = 0;
const RECOGNITION_INTERVAL_MS = 5000; // 每5秒检查一次赛道识别
const START_DEBOUNCE_MS = 500;
const STOP_DEBOUNCE_MS = 5000;
const MIN_RACE_DURATION_MS = 30000; // 30秒，过滤掉传送/误触发
let lastPacketSize = 0;
let hasDashExtension = false;
let lastSignificantPosition = null;
let staticPositionCount = 0;
const MAX_STATIC_COUNT = 100; // 连续100个包位置不变则认为不是真比赛

udpServer.on('message', (msg, rinfo) => {
  packetCount++;
  lastPacketTime = new Date();
  lastPacketSize = msg.length;
  
  // 诊断日志：每100个包打印一次大小
  if (packetCount % 100 === 1) {
    console.log(`[诊断] 包大小: ${msg.length} 字节`);
    if (msg.length >= 323) {
      hasDashExtension = true;
    } else if (msg.length >= 232) {
      hasDashExtension = false;
      console.log(`[警告] 包大小 ${msg.length} < 323, Dash扩展数据(圈速/排名/操控)不会被解析`);
    }
  }
  
  const telemetry = parseTelemetryPacket(msg);
  if (telemetry) {
    currentData = telemetry;
    telemetry._packetSize = msg.length;
    
    // 数据节流：控制发送频率
    const now = Date.now();
    if (now - lastEmitTime >= EMIT_INTERVAL_MS) {
      io.emit('telemetry', telemetry);
      lastEmitTime = now;
    }
    
    if (packetCount % 100 === 1) {
      console.log('[调试] isRaceOn=' + telemetry.isRaceOn + ' rpm=' + telemetry.currentEngineRpm?.toFixed(0) + ' pos=' + telemetry.racePosition + ' lap=' + telemetry.lapNumber + ' isManual=' + isManualRecording + ' trackMode=' + !!trackMode + ' pos=(' + telemetry.position?.x?.toFixed(0) + ',' + telemetry.position?.z?.toFixed(0) + ')');
    }
    
    // 车辆自动识别 - 当检测到新的carOrdinal时自动添加到车辆管理
    if (telemetry.car && telemetry.car.ordinal && telemetry.car.ordinal > 0) {
      const carOrd = telemetry.car.ordinal;
      if (!vehicles[carOrd]) {
        vehicles[carOrd] = {
          name: `Car #${carOrd}`,
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
        console.log(`[Vehicle] 自动识别新车辆: Car #${carOrd}`);
        io.emit('vehicleDetected', vehicles[carOrd]);
      } else {
        vehicles[carOrd].lastUsed = new Date().toISOString();
        if (telemetry.car.performanceIndex && telemetry.car.performanceIndex > vehicles[carOrd].pi) {
          vehicles[carOrd].pi = telemetry.car.performanceIndex;
        }
      }
    }

    // 自动录制逻辑
    handleAutoRecord(telemetry);
    
    // 手动录制（不受节流影响，确保数据完整性）
    if (isManualRecording) {
      manualRecordedData.push({ ...telemetry, _recordedAt: new Date().toISOString() });
      if (telemetry.position && (telemetry.position.x !== 0 || telemetry.position.z !== 0)) {
        manualRacePositions.push(extractTrackPoint(telemetry));
      }
    }
  }
});

function calculateTrackLength(points) {
  if (!points || points.length < 2) return 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = (points[i].y || 0) - (points[i-1].y || 0);
    const dz = points[i].z - points[i-1].z;
    length += Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  return Math.round(length);
}

function extractTrackPoint(telemetry) {
  const acc = telemetry.acceleration || {};
  const controls = telemetry.controls || {};
  const tireSlip = telemetry.tireCombinedSlip || {};
  const onRumble = telemetry.onRumbleStrip || {};
  const puddle = telemetry.puddleDepth || {};
  
  return {
    x: telemetry.position.x,
    y: telemetry.position.y || 0,
    z: telemetry.position.z,
    yaw: telemetry.yaw || 0,
    drivingLine: telemetry.drivingLine || 0,
    speed: telemetry.speedKmh || 0,
    lapTime: telemetry.currentLap || 0,
    racePos: telemetry.racePosition || 0,
    lapNum: telemetry.lapNumber || 0,
    accel: controls.accel || 0,
    brake: controls.brake || 0,
    steer: controls.steer || 0,
    clutch: controls.clutch || 0,
    handBrake: controls.handBrake || 0,
    gear: controls.gear || 0,
    gLong: acc.z || 0,
    gLat: acc.x || 0,
    gVert: acc.y || 0,
    slipFL: tireSlip.frontLeft || 0,
    slipFR: tireSlip.frontRight || 0,
    slipRL: tireSlip.rearLeft || 0,
    slipRR: tireSlip.rearRight || 0,
    onRumble: (onRumble.frontLeft || onRumble.frontRight || onRumble.rearLeft || onRumble.rearRight) ? 1 : 0,
    puddle: Math.max(puddle.frontLeft || 0, puddle.frontRight || 0, puddle.rearLeft || 0, puddle.rearRight || 0)
  };
}

// 自动录制优化参数
const SPEED_THRESHOLD = 10; // km/h
const SPEED_SUSTAIN_MS = 2000; // 持续2秒
const MIN_DISPLACEMENT = 50; // 米
const MAX_TELEPORT_DIST = 500; // 瞬移检测
let speedSustainStart = null;
let lastValidPosition = null;
let lastLapNumber = 0;

function handleAutoRecord(telemetry) {
  const now = Date.now();
  const speed = telemetry.speedKmh || 0;
  const position = telemetry.position;
  
  // 检测位置是否变化
  const isPositionValid = position && 
    (position.x !== 0 || position.z !== 0);
  
  if (isPositionValid && telemetry.isRaceOn) {
    const posKey = Math.round(position.x) + ',' + Math.round(position.z);
    if (lastSignificantPosition === posKey) {
      staticPositionCount++;
    } else {
      staticPositionCount = 0;
      lastSignificantPosition = posKey;
    }
  }
  
  // 基础条件检查
  const baseCondition = telemetry.isRaceOn && 
    telemetry.currentEngineRpm > 0 &&
    (telemetry.racePosition > 0 || telemetry.lapNumber > 0);
  
  if (!baseCondition) {
    speedSustainStart = null;
    
    if (autoRecordStartTimer) {
      clearTimeout(autoRecordStartTimer);
      autoRecordStartTimer = null;
    }
    
    if (autoRecordState === 'RECORDING') {
      autoRecordState = 'POST_RACE';
      autoRecordStopTimer = setTimeout(() => {
        stopAutoRecording();
        autoRecordStopTimer = null;
      }, STOP_DEBOUNCE_MS);
    }
    return;
  }
  
  // 速度阈值检测
  if (speed < SPEED_THRESHOLD) {
    speedSustainStart = null;
    return;
  }
  
  if (!speedSustainStart) {
    speedSustainStart = now;
  }
  
  // 速度持续时间检查
  if (now - speedSustainStart < SPEED_SUSTAIN_MS) {
    return;
  }
  
  // 位移距离检测和瞬移过滤
  if (isPositionValid && lastValidPosition) {
    const dx = position.x - lastValidPosition.x;
    const dz = position.z - lastValidPosition.z;
    const displacement = Math.sqrt(dx * dx + dz * dz);
    
    // 瞬移检测
    if (displacement > MAX_TELEPORT_DIST) {
      console.log('[自动录制] 检测到瞬移 (' + Math.round(displacement) + 'm)，跳过此帧');
      return;
    }
  }
  
  // 更新位置
  if (isPositionValid) {
    lastValidPosition = { x: position.x, z: position.z };
  }
  
  // 圈数变化检测（辅助验证）
  const lapChanged = telemetry.lapNumber > 0 && telemetry.lapNumber !== lastLapNumber;
  if (lapChanged) {
    lastLapNumber = telemetry.lapNumber;
  }
  
  // 有效比赛判断
  const isValidRace = true; // 通过了上面所有检查，确认是有效比赛
  
  if (isValidRace) {
    if (autoRecordState === 'IDLE' && !autoRecordStartTimer) {
      console.log('[自动录制] 检测到有效比赛，启动去抖定时器...');
      console.log('[自动录制] 速度: ' + Math.round(speed) + 'km/h, 排名: P' + telemetry.racePosition);
      autoRecordStartTimer = setTimeout(() => {
        startAutoRecording();
        autoRecordStartTimer = null;
      }, START_DEBOUNCE_MS);
    }
    
    if (autoRecordState === 'POST_RACE') {
      autoRecordState = 'RECORDING';
      if (autoRecordStopTimer) {
        clearTimeout(autoRecordStopTimer);
        autoRecordStopTimer = null;
      }
    }
    
    // 自动录制数据
    if (autoRecordState === 'RECORDING') {
      autoRecordedData.push({ ...telemetry, _recordedAt: new Date().toISOString() });
      if (isPositionValid) {
        autoRacePositions.push(extractTrackPoint(telemetry));
        
        // 赛道模式：检测弯道并进行语音播报
        if (trackMode && tracks[trackMode.trackId]) {
          const track = tracks[trackMode.trackId];
          if (track.turns && track.turns.length > 0) {
            checkAndAnnounceTurn(position, track.turns, track.points);
          }
        }
        
        // 自动赛道识别（每5秒检查一次，且轨迹点足够多时）
        if (!trackMode && autoRacePositions.length > 50) {
          const now2 = Date.now();
          if (now2 - lastRecognitionCheckTime > RECOGNITION_INTERVAL_MS) {
            lastRecognitionCheckTime = now2;
            performTrackRecognition(autoRacePositions);
          }
        }
      }
      
      // 推送录制状态更新
      if (packetCount % 30 === 0) {
        io.emit('recordStats', {
          state: 'RECORDING',
          pointCount: autoRecordedData.length,
          positionCount: autoRacePositions.length,
          speed: Math.round(speed),
          duration: autoRecordStartTime ? now - autoRecordStartTime : 0
        });
      }
    }
    
    // 手动录制时也触发播报
    if (isManualRecording && trackMode && tracks[trackMode.trackId]) {
      const track = tracks[trackMode.trackId];
      if (track.turns && track.turns.length > 0 && isPositionValid) {
        if (packetCount % 100 === 1) {
          console.log('[播报调试] 位置: ' + position.x.toFixed(0) + ', ' + position.z.toFixed(0) + ' 弯道数: ' + track.turns.length);
        }
        checkAndAnnounceTurn(position, track.turns, track.points);
      }
    }
  } else {
    if (autoRecordStartTimer) {
      clearTimeout(autoRecordStartTimer);
      autoRecordStartTimer = null;
    }
    
    if (autoRecordState === 'RECORDING') {
      autoRecordState = 'POST_RACE';
      autoRecordStopTimer = setTimeout(() => {
        stopAutoRecording();
        autoRecordStopTimer = null;
      }, STOP_DEBOUNCE_MS);
    }
  }
}

// 上次播报的弯道索引
let lastAnnouncedTurnIndex = -1;
let lastAnnounceTime = 0;
const ANNOUNCE_COOLDOWN_MS = 3000;

// 执行赛道识别
async function performTrackRecognition(currentPositions) {
  try {
    const results = recognizeTrack(currentPositions, tracks);
    
    if (results.length > 0) {
      const bestMatch = results[0];
      
      // 只有置信度超过阈值才通知客户端
      if (bestMatch.confidence > 0.5) {
        lastRecognitionResult = {
          ...bestMatch,
          timestamp: new Date().toISOString(),
          pointCount: currentPositions.length
        };
        
        recognitionHistory.push(lastRecognitionResult);
        if (recognitionHistory.length > 20) {
          recognitionHistory = recognitionHistory.slice(-20);
        }
        
        io.emit('trackRecognized', {
          trackId: bestMatch.trackId,
          trackName: bestMatch.trackName,
          confidence: bestMatch.confidence,
          details: bestMatch.details,
          alternatives: results.slice(1, 4).map(r => ({
            trackId: r.trackId,
            trackName: r.trackName,
            confidence: r.confidence
          }))
        });
        
        console.log(`[赛道识别] 识别到赛道: ${bestMatch.trackName} (置信度: ${Math.round(bestMatch.confidence * 100)}%)`);
      }
    }
  } catch (e) {
    console.error('[赛道识别] 识别失败:', e.message);
  }
}

// 赛道模式状态 - 用于实时显示弯道距离
let trackModeTurns = [];
let trackModePoints = [];

// 拉力领航员风格路线播报
async function checkAndAnnounceTurn(position, turns, trackPoints) {
  if (!position || !turns || turns.length === 0 || !trackPoints || trackPoints.length === 0) {
    return;
  }
  
  // 保存赛道数据供实时显示使用
  trackModeTurns = turns;
  trackModePoints = trackPoints;
  
  const now = Date.now();
  
  // 找到赛道上最近的点
  let minDist = Infinity;
  let nearestIndex = -1;
  let nearestPoint = null;
  
  for (let i = 0; i < trackPoints.length; i++) {
    const p = trackPoints[i];
    const dx = position.x - p.x;
    const dz = position.z - p.z;
    const dist = dx * dx + dz * dz;
    if (dist < minDist) {
      minDist = dist;
      nearestIndex = i;
      nearestPoint = p;
    }
  }
  
  if (!nearestPoint) return;
  
  // 路况播报（水坑、路肩、坡度、沙地）
  let conditionText = '';
  let conditionTTS = '';
  
  // 水坑检测
  if (nearestPoint.puddle > 0.5) {
    conditionText = '💧 积水';
    conditionTTS = '注意积水';
  }
  // 路肩检测
  else if (nearestPoint.onRumble) {
    conditionText = '⚠️ 路肩';
    conditionTTS = '压到路肩';
  }
  // 沙地/碎石检测
  else if (nearestPoint.surfaceRumble > 0.3) {
    conditionText = '🏜️ 碎石';
    conditionTTS = '碎石路面';
  }
  
  // 坡度检测（分级坡度）
  const nearestIdx = trackPoints.indexOf(nearestPoint);
  if (nearestIdx >= 0) {
    // 检测多个前瞻距离
    const lookAheadOptions = [20, 40, 60];
    let maxSlope = 0;
    let slopeType = '';
    
    for (const lookAhead of lookAheadOptions) {
      if (nearestIdx + lookAhead < trackPoints.length) {
        const currentY = nearestPoint.y || 0;
        const aheadY = trackPoints[nearestIdx + lookAhead].y || 0;
        const heightDiff = aheadY - currentY;
        
        if (Math.abs(heightDiff) > Math.abs(maxSlope)) {
          maxSlope = heightDiff;
          if (heightDiff > 15) {
            slopeType = heightDiff > 0 ? '急上坡' : '急下坡';
          } else if (heightDiff > 8) {
            slopeType = heightDiff > 0 ? '陡坡' : '陡下坡';
          } else if (heightDiff > 3) {
            slopeType = heightDiff > 0 ? '上坡' : '下坡';
          }
        }
      }
    }
    
    if (slopeType && !conditionTTS) {
      conditionTTS = slopeType;
    }
  }
  
  // 路况播报（如果有急弯，延迟路况播报）
  let shouldAnnounceCondition = false;
  if (conditionTTS && now - lastAnnounceTime > 2000) {
    // 检查前方是否有急弯
    let hasUrgentTurn = false;
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (!turn.x || !turn.z) continue;
      
      const dx = position.x - turn.x;
      const dz = position.z - turn.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < 100 && turn.angle > 30) {
        hasUrgentTurn = true;
        break;
      }
    }
    
    // 如果有急弯且距离很近，延迟路况播报
    if (!hasUrgentTurn) {
      shouldAnnounceCondition = true;
    }
  }
  
  if (shouldAnnounceCondition) {
    lastAnnounceTime = now;
    const audioUrl = await generateTTS(conditionTTS);
    io.emit('turnAnnounce', { 
      text: conditionText, 
      ttsText: conditionTTS,
      audioUrl: audioUrl,
      direction: 'center', 
      level: 0,
      angle: 0,
      distance: 0,
      announceType: 'condition'
    });
    return;
  }
  
  // 找到最近的弯道（用坐标距离，不限制index方向）
  let nextTurn = null;
  let nextTurnDist = Infinity;
  
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn.x || !turn.z) continue;
    
    const dx = position.x - turn.x;
    const dz = position.z - turn.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    // 只选距离在5-300米范围内的弯道（排除太远和已经过了的）
    if (dist > 5 && dist < 300 && dist < nextTurnDist) {
      nextTurnDist = dist;
      nextTurn = turn;
      nextTurnIndex = i;
    }
  }
  
  if (!nextTurn) return;
  
  // 速度自适应播报距离
  const currentSpeed = nearestPoint.speed || 0;
  let PRE_WARN_DIST, FINAL_WARN_DIST, EARLY_WARN_DIST;
  
  if (currentSpeed > 150) {
    // 高速模式
    EARLY_WARN_DIST = 400;
    PRE_WARN_DIST = 300;
    FINAL_WARN_DIST = 120;
  } else if (currentSpeed > 80) {
    // 中速模式
    PRE_WARN_DIST = 200;
    FINAL_WARN_DIST = 80;
    EARLY_WARN_DIST = 0;
  } else {
    // 低速模式
    PRE_WARN_DIST = 100;
    FINAL_WARN_DIST = 40;
    EARLY_WARN_DIST = 0;
  }
  
  const direction = nextTurn.direction === 'left' ? '左' : '右';
  const angle = nextTurn.angle || 0;
  
  let level;
  if (angle > 120) level = 1;
  else if (angle > 90) level = 2;
  else if (angle > 60) level = 3;
  else if (angle > 40) level = 4;
  else if (angle > 25) level = 5;
  else level = 6;
  
  let announceText = '';
  let ttsText = '';
  let shouldAnnounce = false;
  let announcePhase = '';
  
  // 三阶段播报（高速+急弯时启用）
  if (EARLY_WARN_DIST > 0 && angle > 30 && nextTurnDist < EARLY_WARN_DIST && nextTurnDist >= PRE_WARN_DIST) {
    if (lastAnnouncedTurnIndex !== nextTurnIndex || now - lastAnnounceTime > ANNOUNCE_COOLDOWN_MS * 2) {
      announceText = '前方急弯，准备减速';
      ttsText = '前方急弯，准备减速';
      shouldAnnounce = true;
      announcePhase = 'early';
    }
  }
  // 预提醒阶段
  else if (nextTurnDist < PRE_WARN_DIST && nextTurnDist >= FINAL_WARN_DIST) {
    if (lastAnnouncedTurnIndex !== nextTurnIndex || now - lastAnnounceTime > ANNOUNCE_COOLDOWN_MS) {
      const distText = Math.round(nextTurnDist / 10) * 10;
      announceText = direction + level + ' ' + distText;
      ttsText = direction + level + '，' + distText + '米';
      shouldAnnounce = true;
      announcePhase = 'pre';
    }
  }
  // 最终提示阶段
  else if (nextTurnDist < FINAL_WARN_DIST && nextTurnDist >= 30) {
    if (lastAnnouncedTurnIndex !== nextTurnIndex) {
      announceText = direction + level;
      ttsText = direction + level;
      shouldAnnounce = true;
      announcePhase = 'final';
    }
  }
  
  // 检查是否有连续弯道
  if (shouldAnnounce && announcePhase === 'pre') {
    const nextTurns = [];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (!turn.x || !turn.z) continue;
      
      const dx = position.x - turn.x;
      const dz = position.z - turn.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist > 5 && dist < 500) {
        nextTurns.push({ turn, dist, index: i });
      }
    }
    
    nextTurns.sort((a, b) => a.dist - b.dist);
    
    if (nextTurns.length >= 2) {
      const secondTurn = nextTurns[1];
      const secondDir = secondTurn.turn.direction === 'left' ? '左' : '右';
      const secondAngle = secondTurn.turn.angle || 0;
      let secondLevel;
      if (secondAngle > 120) secondLevel = 1;
      else if (secondAngle > 90) secondLevel = 2;
      else if (secondAngle > 60) secondLevel = 3;
      else if (secondAngle > 40) secondLevel = 4;
      else if (secondAngle > 25) secondLevel = 5;
      else secondLevel = 6;
      
      if (secondTurn.dist < 300) {
        const distText = Math.round(nextTurnDist / 10) * 10;
        announceText = direction + level + ' ' + distText + '，然后' + secondDir + secondLevel;
        ttsText = direction + level + '，' + distText + '米，然后' + secondDir + secondLevel;
      }
    }
  }
  
  if (shouldAnnounce) {
    lastAnnouncedTurnIndex = nextTurnIndex;
    lastAnnounceTime = now;
    
    const audioUrl = await generateTTS(ttsText);
    
    io.emit('turnAnnounce', { 
      text: announceText, 
      ttsText: ttsText,
      audioUrl: audioUrl,
      direction: nextTurn.direction, 
      level: level,
      angle: angle,
      distance: Math.round(nextTurnDist),
      turnType: nextTurn.type,
      announceType: announcePhase === 'early' ? 'early_warn' : (announcePhase === 'pre' ? 'pre_warn' : 'final_warn'),
      radius: nextTurn.radius || 0,
      recommendedSpeed: nextTurn.recommendedSpeed || 0
    });
    
    console.log('[领航播报] ' + announceText + ' (' + Math.round(nextTurnDist) + 'm)');
  }
}

function startAutoRecording() {
  autoRecordState = 'RECORDING';
  autoRecordStartTime = Date.now();
  // 每次新比赛清空自动录制数组（手动录制不受影响）
  autoRecordedData.length = 0;
  autoRacePositions.length = 0;
  console.log('[自动录制] 比赛开始，录制中...');
  io.emit('autoRecordStatus', { state: 'RECORDING', message: '比赛开始，自动录制中' });
}

function stopAutoRecording() {
  const duration = Date.now() - autoRecordStartTime;
  
  // 最小时长过滤
  if (duration < MIN_RACE_DURATION_MS) {
    console.log(`[自动录制] 比赛太短 (${duration}ms)，丢弃数据`);
    autoRecordState = 'IDLE';
    autoRecordedData.length = 0;
    autoRacePositions.length = 0;
    io.emit('autoRecordStatus', { state: 'IDLE', message: '比赛太短，数据已丢弃' });
    return;
  }
  
  autoRecordState = 'IDLE';
  
  console.log(`[自动录制] 比赛结束，${autoRecordedData.length} 条数据，${autoRacePositions.length} 个轨迹点`);
  
  // 自动保存
  saveAutoRecordedData(duration);
}

async function saveAutoRecordedData(duration) {
  const ts = Date.now();
  const filename = 'session_' + ts + '.json';
  
  // 确定赛道信息
  let trackId = null;
  let trackName = null;
  
  // 赛道模式：合并到指定赛道
  if (trackMode) {
    trackId = trackMode.trackId;
    trackName = trackMode.trackName;
  } else {
    // 普通模式：生成新赛道名称
    const now = new Date();
    const dateStr = now.getFullYear() + 
      String(now.getMonth() + 1).padStart(2, '0') + 
      String(now.getDate()).padStart(2, '0');
    const timeStr = String(now.getHours()).padStart(2, '0') + 
      String(now.getMinutes()).padStart(2, '0') + 
      String(now.getSeconds()).padStart(2, '0');
    trackName = '赛道_' + dateStr + '_' + timeStr;
  }
  
  const sessionData = {
    id: 'session_' + ts,
    trackName: trackName,
    trackId: trackId,
    savedAt: new Date().toISOString(),
    autoRecorded: true,
    trackMode: !!trackMode, // 标记是否为赛道模式
    tuneId: currentTuneId,
    summary: {
      dataCount: autoRecordedData.length,
      positionCount: autoRacePositions.length,
      duration: duration,
    },
    vehicle: autoRecordedData.length > 0 ? autoRecordedData[0].car : null,
    laps: {
      best: autoRecordedData.length > 0 ? autoRecordedData[0].bestLap : 0,
      last: autoRecordedData.length > 0 ? autoRecordedData[0].lastLap : 0,
      count: autoRecordedData.length > 0 ? autoRecordedData[0].lapNumber : 0,
    },
    data: autoRecordedData,
    positions: autoRacePositions,
  };
  
  saveSession(sessionData.id, sessionData);
  
  // 赛道模式：直接合并到指定赛道
  if (trackMode && trackId && tracks[trackId]) {
    const track = tracks[trackId];
    const existingTrajectories = track.trajectories || [];
    existingTrajectories.push(autoRacePositions);
    
    // 降采样历史轨迹（保留最新一条不降采样，历史轨迹每10点取1）
    for (let i = 0; i < existingTrajectories.length - 1; i++) {
      existingTrajectories[i] = downsampleTrajectory(existingTrajectories[i]);
    }
    // 限制最多5条轨迹
    const trimmed = trimTrajectories(existingTrajectories, 5);
    
    const trackData = buildTrackFromTrajectories(trimmed);
    track.trajectories = trimmed;
    track.trajectoryCount = trimmed.length;
    track.updatedAt = new Date().toISOString();
    
    if (trackData) {
      track.centerline = trackData.centerline;
      track.turns = trackData.turns;
      track.length = trackData.length;
      track.sectors = generateSectors(trackData.centerline, trackData.turns);
      track.navigation = generateNavigationData(trackData);
    }
    
    saveTracksDatabase(tracks);
    
    console.log(`[赛道模式] 合并到赛道: ${trackName}，轨迹数: ${trimmed.length}`);
    io.emit('autoRecordStatus', { 
      state: 'COMPLETED', 
      message: `比赛结束，已合并到赛道: ${trackName}`,
      sessionId: sessionData.id,
      trackId: trackId,
      trackName: trackName
    });
    
    // 重置赛道模式
    trackMode = null;
    lastTurnIndex = -1;

    // 更新车辆统计（赛道模式分支）
    const trackModeVehicleOrdinal = sessionData.vehicle ? sessionData.vehicle.ordinal : null;
    if (trackModeVehicleOrdinal && vehicles[trackModeVehicleOrdinal]) {
      vehicles[trackModeVehicleOrdinal].raceCount = (vehicles[trackModeVehicleOrdinal].raceCount || 0) + 1;
      if (trackName && !vehicles[trackModeVehicleOrdinal].tracks.includes(trackName)) {
        vehicles[trackModeVehicleOrdinal].tracks.push(trackName);
      }
      if (!vehicles[trackModeVehicleOrdinal].bestLap || (sessionData.laps && sessionData.laps.best && sessionData.laps.best < vehicles[trackModeVehicleOrdinal].bestLap)) {
        vehicles[trackModeVehicleOrdinal].bestLap = sessionData.laps?.best;
      }
      saveJSON(DATA_DIR + '/vehicles.json', vehicles);
    }

    return;
  }
  
  // 普通模式：检查是否与已有赛道匹配
  let matchedTrackId = null;
  let matchedTrackName = null;
  
  for (const [tid, track] of Object.entries(tracks)) {
    if (track.trajectories && track.trajectories.length > 0) {
      const similarity = calculateTrackSimilarity(autoRacePositions, track.points);
      if (similarity > 0.6) { // 60%相似度认为是同一条赛道
        matchedTrackId = tid;
        matchedTrackName = track.name;
        break;
      }
    }
  }
  
  if (matchedTrackId) {
    // 匹配到已有赛道，自动合并
    sessionData.trackId = matchedTrackId;
    sessionData.trackName = matchedTrackName;
    saveSession(sessionData.id, sessionData);
    
    // 合并轨迹到赛道
    const track = tracks[matchedTrackId];
    const existingTrajectories = track.trajectories || [];
    existingTrajectories.push(autoRacePositions);
    
    // 降采样历史轨迹（保留最新一条不降采样，历史轨迹每10点取1）
    for (let i = 0; i < existingTrajectories.length - 1; i++) {
      existingTrajectories[i] = downsampleTrajectory(existingTrajectories[i]);
    }
    // 限制最多5条轨迹
    const trimmed = trimTrajectories(existingTrajectories, 5);
    
    const trackData = buildTrackFromTrajectories(trimmed);
    track.trajectories = trimmed;
    track.trajectoryCount = trimmed.length;
    track.updatedAt = new Date().toISOString();
    
    if (trackData) {
      track.centerline = trackData.centerline;
      track.turns = trackData.turns;
      track.length = trackData.length;
      track.sectors = generateSectors(trackData.centerline, trackData.turns);
      track.navigation = generateNavigationData(trackData);
    }
    
    saveTracksDatabase(tracks);
    
    console.log(`[自动录制] 匹配到赛道: ${matchedTrackName}，轨迹已合并`);
    io.emit('autoRecordStatus', { 
      state: 'COMPLETED', 
      message: `比赛结束，已保存到赛道: ${matchedTrackName}`,
      sessionId: sessionData.id,
      trackId: matchedTrackId,
      trackName: matchedTrackName
    });
  } else {
    // 未匹配到赛道，自动创建新赛道
    const newTrackId = 'track_' + ts;
    const trackLength = calculateTrackLength(autoRacePositions);
    
    tracks[newTrackId] = {
      id: newTrackId,
      name: trackName,
      points: autoRacePositions,
      pointCount: autoRacePositions.length,
      length: trackLength,
      trajectories: [autoRacePositions],
      trajectoryCount: 1,
      centerline: null,
      turns: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // 更新session的trackId
    sessionData.trackId = newTrackId;
    saveSession(sessionData.id, sessionData);
    saveTracksDatabase(tracks);
    
    console.log(`[自动录制] 创建新赛道: ${trackName}，长度: ${trackLength}米`);
    io.emit('autoRecordStatus', { 
      state: 'COMPLETED', 
      message: `比赛结束，已创建赛道: ${trackName}`,
      sessionId: sessionData.id,
      trackId: newTrackId,
      trackName: trackName
    });
  }

  // 更新车辆统计
  const vehicleOrdinal = sessionData.vehicle ? sessionData.vehicle.ordinal : null;
  if (vehicleOrdinal && vehicles[vehicleOrdinal]) {
    vehicles[vehicleOrdinal].raceCount = (vehicles[vehicleOrdinal].raceCount || 0) + 1;
    if (trackName && !vehicles[vehicleOrdinal].tracks.includes(trackName)) {
      vehicles[vehicleOrdinal].tracks.push(trackName);
    }
    if (!vehicles[vehicleOrdinal].bestLap || (sessionData.laps && sessionData.laps.best && sessionData.laps.best < vehicles[vehicleOrdinal].bestLap)) {
      vehicles[vehicleOrdinal].bestLap = sessionData.laps?.best;
    }
    saveJSON(DATA_DIR + '/vehicles.json', vehicles);
  }
}

app.get('/api/status', (req, res) => res.json({ udpPort: UDP_PORT, ips: getLocalIPs(), packetCount, lastPacketTime, isReceiving: lastPacketTime && (Date.now() - new Date(lastPacketTime).getTime() < 2000), isManualRecording, autoRecordState }));
app.get('/api/current', (req, res) => res.json(currentData || {}));
app.get('/api/vehicles', (req, res) => res.json(vehicles));
app.post('/api/vehicles/:id', express.json(), (req, res) => { vehicles[req.params.id] = { ...vehicles[req.params.id], ...req.body }; saveJSON(DATA_DIR + '/vehicles.json', vehicles); res.json({ status: 'ok' }); });
app.delete('/api/vehicles/:id', (req, res) => { delete vehicles[req.params.id]; saveJSON(DATA_DIR + '/vehicles.json', vehicles); res.json({ status: 'ok' }); });
// Round 7: 赛道列表增强 - 附带每个赛道的 lastUsed 和 sessionCount（从 sessions 聚合）
app.get('/api/tracks', (req, res) => {
  const sessionsDir = DATA_DIR + '/sessions';
  const sessionCounts = {};
  const lastUsedMap = {};
  if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    files.forEach(file => {
      try {
        const s = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
        if (s.trackId && tracks[s.trackId]) {
          sessionCounts[s.trackId] = (sessionCounts[s.trackId] || 0) + 1;
          const ts = s.savedAt || s.createdAt || s.timestamp;
          if (ts && (!lastUsedMap[s.trackId] || ts > lastUsedMap[s.trackId])) {
            lastUsedMap[s.trackId] = ts;
          }
        }
      } catch {}
    });
  }
  const enriched = {};
  for (const [id, track] of Object.entries(tracks)) {
    enriched[id] = {
      ...track,
      sessionCount: sessionCounts[id] || 0,
      lastUsedAt: lastUsedMap[id] || track.updatedAt || track.createdAt || null
    };
  }
  res.json(enriched);
});
app.get('/api/tracks/:id', (req, res) => {
  const track = tracks[req.params.id];
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json(track);
});
app.get('/api/tracks/:id/navigation', (req, res) => {
  const track = tracks[req.params.id];
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json({
    trackId: track.id,
    trackName: track.name,
    centerline: track.centerline || [],
    turns: track.turns || [],
    sectors: track.sectors || [],
    navigation: track.navigation || [],
    length: track.length || 0,
    trajectoryCount: track.trajectoryCount || 0
  });
});
app.post('/api/tracks', express.json(), (req, res) => { const id = 'track_' + Date.now(); tracks[id] = { id, ...req.body, createdAt: new Date().toISOString() }; saveJSON(DATA_DIR + '/tracks.json', tracks); res.json({ status: 'ok', id }); });
app.delete('/api/tracks/:id', (req, res) => { delete tracks[req.params.id]; saveJSON(DATA_DIR + '/tracks.json', tracks); res.json({ status: 'ok' }); });

// Round 7: 赛道数据质量验证
app.get('/api/tracks/:id/validate', (req, res) => {
  const track = tracks[req.params.id];
  if (!track) return res.status(404).json({ error: 'Track not found' });
  const result = validateTrackQuality(track);
  res.json(result);
});

// Round 9: 更新弯道推荐速度
app.put('/api/tracks/:id/turns/:index/speedHint', express.json(), (req, res) => {
  const track = tracks[req.params.id];
  if (!track) return res.status(404).json({ error: 'Track not found' });
  if (!track.turns || !Array.isArray(track.turns)) return res.status(400).json({ error: 'Track has no turns' });
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= track.turns.length) return res.status(400).json({ error: 'Invalid turn index' });
  track.turns[idx].speedHint = req.body.speedHint || '';
  track.updatedAt = new Date().toISOString();
  saveJSON(DATA_DIR + '/tracks.json', tracks);
  res.json({ status: 'ok', turnIndex: idx, speedHint: track.turns[idx].speedHint });
});

// ========== 调校管理 API ==========

// 获取所有调校方案（支持按carOrdinal筛选）
app.get('/api/tunes', (req, res) => {
  try {
    const carOrdinal = req.query.carOrdinal ? parseInt(req.query.carOrdinal, 10) : null;
    const result = Object.values(tunes).filter(t => {
      if (carOrdinal !== null && carOrdinal !== undefined && !isNaN(carOrdinal)) {
        return t.carOrdinal === carOrdinal;
      }
      return true;
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load tunes' });
  }
});

// 获取单个调校详情
app.get('/api/tunes/:tuneId', (req, res) => {
  try {
    const tune = tunes[req.params.tuneId];
    if (!tune) {
      return res.status(404).json({ error: 'Tune not found' });
    }
    res.json(tune);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load tune' });
  }
});

// 创建新调校
app.post('/api/tunes', express.json(), (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) {
      return res.status(400).json({ error: 'name is required' });
    }

    // 兼容前端分类格式和旧格式
    // 前端发送: { name, tags, vehicleId, tires, suspension, drivetrain, aero, parts }
    // 旧格式: { name, carOrdinal, params: {} }
    const tuneId = 'tune_' + Date.now();
    const now = new Date().toISOString();
    const tune = {
      tuneId,
      id: tuneId,
      name: body.name,
      description: body.description || '',
      tags: body.tags || [],
      carOrdinal: body.carOrdinal || body.vehicleId || null,
      vehicleId: body.vehicleId || null,
      createdAt: now,
      updatedAt: now,
      params: body.params || {},
      // 前端分类字段直接存储
      tires: body.tires || null,
      suspension: body.suspension || null,
      drivetrain: body.drivetrain || null,
      aero: body.aero || null,
      // 改装配件数据
      parts: body.parts || null,
    };
    tunes[tuneId] = tune;
    saveJSON(DATA_DIR + '/tunes.json', tunes);
    res.json({ status: 'ok', tuneId, tune });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create tune' });
  }
});

// 更新调校
app.put('/api/tunes/:tuneId', express.json(), (req, res) => {
  try {
    const tune = tunes[req.params.tuneId];
    if (!tune) {
      return res.status(404).json({ error: 'Tune not found' });
    }
    const body = req.body || {};
    if (body.name !== undefined) tune.name = body.name;
    if (body.description !== undefined) tune.description = body.description;
    if (body.tags !== undefined) tune.tags = body.tags;
    if (body.carOrdinal !== undefined) tune.carOrdinal = body.carOrdinal;
    if (body.vehicleId !== undefined) {
      tune.vehicleId = body.vehicleId;
      tune.carOrdinal = body.vehicleId; // 同步更新 carOrdinal
    }
    if (body.params !== undefined) tune.params = body.params;
    // 前端分类字段直接存储
    if (body.tires !== undefined) tune.tires = body.tires;
    if (body.suspension !== undefined) tune.suspension = body.suspension;
    if (body.drivetrain !== undefined) tune.drivetrain = body.drivetrain;
    if (body.aero !== undefined) tune.aero = body.aero;
    // 改装配件数据
    if (body.parts !== undefined) tune.parts = body.parts;
    tune.updatedAt = new Date().toISOString();
    tunes[req.params.tuneId] = tune;
    saveJSON(DATA_DIR + '/tunes.json', tunes);
    res.json({ status: 'ok', tune });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update tune' });
  }
});

// 删除调校
app.delete('/api/tunes/:tuneId', (req, res) => {
  try {
    if (!tunes[req.params.tuneId]) {
      return res.status(404).json({ error: 'Tune not found' });
    }
    delete tunes[req.params.tuneId];
    saveJSON(DATA_DIR + '/tunes.json', tunes);
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete tune' });
  }
});

// 设置当前活跃调校（用于关联后续Session）
app.post('/api/tunes/active', express.json(), (req, res) => {
  try {
    const { tuneId } = req.body || {};
    if (tuneId === null || tuneId === undefined) {
      currentTuneId = null;
      return res.json({ status: 'ok', currentTuneId: null });
    }
    if (!tunes[tuneId]) {
      return res.status(404).json({ error: 'Tune not found' });
    }
    currentTuneId = tuneId;
    res.json({ status: 'ok', currentTuneId, tune: tunes[tuneId] });
  } catch (e) {
    res.status(500).json({ error: 'Failed to set active tune' });
  }
});

// 获取当前活跃调校
app.get('/api/tunes/active', (req, res) => {
  try {
    if (!currentTuneId || !tunes[currentTuneId]) {
      return res.json({ currentTuneId: null, tune: null });
    }
    res.json({ currentTuneId, tune: tunes[currentTuneId] });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get active tune' });
  }
});

// 调校对比：两个调校在同赛道的圈速对比
app.get('/api/tunes/compare', (req, res) => {
  try {
    const { tuneIdA, tuneIdB, trackId } = req.query;
    if (!tuneIdA || !tuneIdB || !trackId) {
      return res.status(400).json({ error: 'tuneIdA, tuneIdB and trackId are required' });
    }
    const tuneA = tunes[tuneIdA];
    const tuneB = tunes[tuneIdB];
    if (!tuneA || !tuneB) {
      return res.status(404).json({ error: 'Tune not found' });
    }
    if (tuneA.carOrdinal !== tuneB.carOrdinal) {
      return res.status(400).json({ error: 'Tunes must be for the same car' });
    }

    const sessionsDir = DATA_DIR + '/sessions';
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
    const carOrdinal = tuneA.carOrdinal;

    const sessionsA = [];
    const sessionsB = [];

    files.forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
        if (data.trackId !== trackId) return;
        const sessionCarOrdinal = data.vehicle ? (data.vehicle.ordinal || data.carOrdinal) : null;
        if (sessionCarOrdinal !== carOrdinal) return;
        if (data.tuneId === tuneIdA) {
          sessionsA.push(data);
        } else if (data.tuneId === tuneIdB) {
          sessionsB.push(data);
        }
      } catch (e) {
        // ignore
      }
    });

    const calcStats = (sessions) => {
      const validLaps = sessions.filter(s => s.laps && s.laps.best > 0);
      const lapTimes = validLaps.map(s => s.laps.best);
      const bestLap = lapTimes.length > 0 ? Math.min(...lapTimes) : 0;
      const avgLap = lapTimes.length > 0 ? lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length : 0;
      const totalLaps = sessions.reduce((sum, s) => sum + (s.laps ? (s.laps.count || 0) : 0), 0);
      return {
        sessionCount: sessions.length,
        bestLap: bestLap > 0 ? Number(bestLap.toFixed(3)) : 0,
        avgLap: avgLap > 0 ? Number(avgLap.toFixed(3)) : 0,
        totalLaps
      };
    };

    res.json({
      status: 'ok',
      trackId,
      carOrdinal,
      tuneA: {
        tuneId: tuneIdA,
        name: tuneA.name,
        ...calcStats(sessionsA)
      },
      tuneB: {
        tuneId: tuneIdB,
        name: tuneB.name,
        ...calcStats(sessionsB)
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to compare tunes' });
  }
});

// 合并赛道：将源赛道的轨迹合并到目标赛道
app.post('/api/tracks/merge', express.json(), (req, res) => {
  const { sourceTrackId, targetTrackId } = req.body;
  
  if (!sourceTrackId || !targetTrackId) {
    return res.status(400).json({ error: 'sourceTrackId and targetTrackId are required' });
  }
  
  if (!tracks[sourceTrackId] || !tracks[targetTrackId]) {
    return res.status(404).json({ error: 'Track not found' });
  }
  
  const source = tracks[sourceTrackId];
  const target = tracks[targetTrackId];
  
  // 合并轨迹
  const sourceTrajectories = source.trajectories || [source.points || []];
  const targetTrajectories = target.trajectories || [target.points || []];
  const mergedTrajectories = [...targetTrajectories, ...sourceTrajectories];
  
  // 重新生成中心线
  const trackData = buildTrackFromTrajectories(mergedTrajectories);
  
  target.trajectories = mergedTrajectories;
  target.trajectoryCount = mergedTrajectories.length;
  target.updatedAt = new Date().toISOString();
  
  if (trackData) {
    target.centerline = trackData.centerline;
    target.turns = trackData.turns;
    target.length = trackData.length;
    target.sectors = generateSectors(trackData.centerline, trackData.turns);
    target.navigation = generateNavigationData(trackData);
  }
  
  // 删除源赛道
  delete tracks[sourceTrackId];
  
  saveJSON(DATA_DIR + '/tracks.json', tracks);
  
  res.json({ 
    status: 'ok', 
    targetTrackId: targetTrackId,
    trajectoryCount: mergedTrajectories.length,
    trackLength: target.length || 0
  });
});

// 更新赛道名称
app.put('/api/tracks/:id', express.json(), (req, res) => {
  if (!tracks[req.params.id]) {
    return res.status(404).json({ error: 'Track not found' });
  }
  
  if (req.body.name) {
    const oldName = tracks[req.params.id].name;
    const newName = req.body.name;
    tracks[req.params.id].name = newName;

    // 同步更新 sessions 中匹配 trackId 的 trackName
    if (oldName !== newName) {
      try {
        const sessionsDir = DATA_DIR + '/sessions';
        if (fs.existsSync(sessionsDir)) {
          const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
          let updatedCount = 0;
          sessionFiles.forEach(file => {
            try {
              const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
              if (session.trackId === req.params.id && session.trackName !== newName) {
                session.trackName = newName;
                saveJSON(sessionsDir + '/' + file, session);
                updatedCount++;
              }
            } catch (e) {
              // 忽略单个 session 文件读取错误
            }
          });
          if (updatedCount > 0) {
            console.log(`赛道改名: "${oldName}" -> "${newName}", 已同步更新 ${updatedCount} 个比赛记录`);
          }
        }
      } catch (e) {
        console.error('同步更新 session trackName 失败:', e.message);
      }
    }
  }
  
  tracks[req.params.id].updatedAt = new Date().toISOString();
  saveTracksDatabase(tracks);

  // Round 6: 通知前端赛道已更新（改名同步到仪表盘等页面）
  io.emit('trackUpdated', { trackId: req.params.id, name: tracks[req.params.id].name });
  
  res.json({ status: 'ok' });
});

// 批量导入历史比赛记录为赛道
app.post('/api/tracks/import-sessions', express.json(), (req, res) => {
  try {
    const sessionsDir = DATA_DIR + '/sessions';
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    
    let importedCount = 0;
    const results = [];
    
    files.forEach(file => {
      try {
        const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
        
        // 检查是否有轨迹数据
        if (session.positions && session.positions.length > 10) {
          const trackId = 'track_' + Date.now() + '_' + importedCount;
          const trackName = session.trackName || '未命名赛道_' + importedCount;
          const trackLength = calculateTrackLength(session.positions);
          
          // 创建赛道
          tracks[trackId] = {
            id: trackId,
            name: trackName,
            points: session.positions,
            pointCount: session.positions.length,
            length: trackLength,
            trajectories: [session.positions],
            trajectoryCount: 1,
            centerline: null,
            turns: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            importedFrom: session.id
          };
          
          // 更新session的trackId
          session.trackId = trackId;
          saveJSON(sessionsDir + '/' + file, session);
          
          importedCount++;
          results.push({ sessionId: session.id, trackId, trackName, points: session.positions.length, length: trackLength });
        }
      } catch (e) {
        console.error(`导入 ${file} 失败:`, e.message);
      }
    });
    
    saveJSON(DATA_DIR + '/tracks.json', tracks);
    
    res.json({ 
      status: 'ok', 
      importedCount,
      results
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to import sessions' });
  }
});

app.post('/api/record/start', (req, res) => { 
  manualRecordedData.length = 0; 
  manualRacePositions.length = 0; 
  isManualRecording = true; 
  res.json({ status: 'ok' }); 
});

app.post('/api/record/stop', (req, res) => { 
  isManualRecording = false; 
  res.json({ status: 'ok', count: manualRecordedData.length, positions: manualRacePositions.length }); 
});

app.post('/api/record/save', express.json(), (req, res) => {
  const ts = Date.now();
  const trackName = req.body.trackName || '未命名赛道';
  const isNewTrack = req.body.isNewTrack;
  const trackId = req.body.trackId;
  const filename = 'session_' + ts + '.json';
  
  // 保存全量数据
  const sessionData = {
    id: 'session_' + ts,
    trackName: trackName,
    trackId: trackId || null,
    savedAt: new Date().toISOString(),
    autoRecorded: false,
    tuneId: currentTuneId,
    summary: {
      dataCount: manualRecordedData.length,
      positionCount: manualRacePositions.length,
      duration: manualRecordedData.length > 0 ? (manualRecordedData[manualRecordedData.length-1].timestampMS - manualRecordedData[0].timestampMS) : 0,
    },
    vehicle: manualRecordedData.length > 0 ? manualRecordedData[0].car : null,
    laps: {
      best: manualRecordedData.length > 0 ? manualRecordedData[0].bestLap : 0,
      last: manualRecordedData.length > 0 ? manualRecordedData[0].lastLap : 0,
      count: manualRecordedData.length > 0 ? manualRecordedData[0].lapNumber : 0,
    },
    data: manualRecordedData,
    positions: manualRacePositions,
  };
  
  saveSession(sessionData.id, sessionData);
  
  // 处理赛道数据
  if(isNewTrack && trackName){
    // 新赛道：创建新赛道
    const newTrackId = 'track_' + ts;
    const trackLength = calculateTrackLength(manualRacePositions);
    tracks[newTrackId] = {
      id: newTrackId,
      name: trackName,
      points: manualRacePositions,
      pointCount: manualRacePositions.length,
      length: trackLength,
      trajectories: [manualRacePositions], // 保存所有轨迹用于聚合
      centerline: null, // 中心线（待生成）
      turns: null, // 弯道（待生成）
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveTracksDatabase(tracks);
    res.json({ status: 'ok', filename, count: manualRecordedData.length, positions: manualRacePositions.length, trackId: newTrackId });
  } else if(trackId && tracks[trackId]){
    // 历史赛道：合并轨迹并重新生成中心线
    const track = tracks[trackId];
    const existingTrajectories = track.trajectories || [];
    existingTrajectories.push(manualRacePositions);
    
    // 降采样历史轨迹（保留最新一条不降采样，历史轨迹每10点取1）
    for (let i = 0; i < existingTrajectories.length - 1; i++) {
      existingTrajectories[i] = downsampleTrajectory(existingTrajectories[i]);
    }
    // 限制最多5条轨迹
    const trimmed = trimTrajectories(existingTrajectories, 5);
    
    // 使用轨迹聚合算法生成中心线
    const trackData = buildTrackFromTrajectories(trimmed);
    
    track.points = manualRacePositions; // 保留最新轨迹（完整精度）
    track.pointCount = manualRacePositions.length;
    track.trajectories = trimmed;
    track.trajectoryCount = trimmed.length;
    track.updatedAt = new Date().toISOString();
    
    if (trackData) {
      track.centerline = trackData.centerline;
      track.turns = trackData.turns;
      track.length = trackData.length;
      track.sectors = generateSectors(trackData.centerline, trackData.turns);
      track.navigation = generateNavigationData(trackData);
    }
    
    saveTracksDatabase(tracks);
    res.json({ 
      status: 'ok', 
      filename, 
      count: manualRecordedData.length, 
      positions: manualRacePositions.length, 
      trackId: trackId, 
      merged: true,
      trajectoryCount: trimmed.length,
      trackLength: track.length || 0
    });
  } else {
    res.json({ status: 'ok', filename, count: manualRecordedData.length, positions: manualRacePositions.length });
  }
});

app.get('/api/record/positions', (req, res) => res.json(manualRacePositions));

// 获取比赛记录列表
app.get('/api/sessions', (req, res) => {
  try {
    const sessionsDir = DATA_DIR + '/sessions';
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
    const sessions = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
        const tune = data.tuneId && tunes[data.tuneId] ? tunes[data.tuneId] : null;
        return {
          id: data.id,
          filename: f,
          trackName: data.trackName || '未知赛道',
          trackId: data.trackId || null,
          vehicle: data.vehicle || null,
          laps: data.laps || {},
          summary: data.summary || {},
          savedAt: data.savedAt,
          tuneId: data.tuneId || null,
          tuneName: tune ? tune.name : null,
          hasDetail: data.hasDetail ?? false
        };
      } catch (e) {
        return null;
      }
    }).filter(s => s !== null);

    // 按时间倒序排列
    sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    res.json(sessions);
  } catch (e) {
    res.json([]);
  }
});

// 获取比赛记录详情
app.get('/api/sessions/:id', (req, res) => {
  try {
    const session = loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// 获取比赛记录的遥测数据数组
app.get('/api/sessions/:id/telemetry', (req, res) => {
  try {
    const session = loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session.data || []);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load session telemetry' });
  }
});

// 删除比赛记录
app.delete('/api/sessions/:id', (req, res) => {
  try {
    const sessionsDir = DATA_DIR + '/sessions';
    const summaryPath = path.join(sessionsDir, `${req.params.id}_summary.json`);
    const detailPath = path.join(sessionsDir, `${req.params.id}_detail.json.gz`);
    
    let deleted = false;
    if (fs.existsSync(summaryPath)) {
      fs.unlinkSync(summaryPath);
      deleted = true;
    }
    if (fs.existsSync(detailPath)) {
      fs.unlinkSync(detailPath);
      deleted = true;
    }
    
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    leaderboardCache = null; // 清除排行榜缓存
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// 编辑比赛记录的赛道名称
app.put('/api/sessions/:id/track', express.json(), (req, res) => {
  try {
    const sessionsDir = DATA_DIR + '/sessions';
    const filePath = path.join(sessionsDir, `${req.params.id}_summary.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const newTrackName = req.body.trackName;
    if (!newTrackName) {
      return res.status(400).json({ error: 'trackName is required' });
    }
    
    data.trackName = newTrackName;
    if (req.body.trackId) {
      data.trackId = req.body.trackId;
    }
    
    saveJSON(filePath, data);
    res.json({ status: 'ok', trackName: newTrackName });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// 批量更新比赛记录的赛道名称
app.put('/api/sessions/batch/track', express.json(), (req, res) => {
  try {
    const { sessionIds, trackName, trackId } = req.body;
    if (!sessionIds || !Array.isArray(sessionIds) || !trackName) {
      return res.status(400).json({ error: 'sessionIds array and trackName are required' });
    }
    
    const sessionsDir = DATA_DIR + '/sessions';
    let updatedCount = 0;
    
    sessionIds.forEach(sessionId => {
      const filePath = path.join(sessionsDir, `${sessionId}_summary.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.trackName = trackName;
        if (trackId) data.trackId = trackId;
        saveJSON(filePath, data);
        updatedCount++;
      }
    });
    
    res.json({ status: 'ok', updatedCount });
  } catch (e) {
    res.status(500).json({ error: 'Failed to batch update sessions' });
  }
});

// 获取自动录制状态
app.get('/api/autoRecord/status', (req, res) => {
  res.json({
    state: autoRecordState,
    isRecording: autoRecordState === 'RECORDING',
    packetCount: autoRecordedData.length,
    positionCount: autoRacePositions.length,
    lastPacketSize: lastPacketSize,
    hasDashExtension: hasDashExtension
  });
});

// 测试播报API - 直接模拟位置触发播报
app.post('/api/test/announce', express.json(), async (req, res) => {
  const { x, z } = req.body;
  if (!trackMode || !tracks[trackMode.trackId]) {
    return res.json({ error: '未进入赛道模式' });
  }
  const track = tracks[trackMode.trackId];
  if (!track.turns || track.turns.length === 0) {
    return res.json({ error: '赛道无弯道数据' });
  }
  const position = { x: x || 0, y: 100, z: z || 0 };
  console.log(`[测试播报] 模拟位置: (${position.x}, ${position.z})`);
  await checkAndAnnounceTurn(position, track.turns, track.points);
  res.json({ status: 'ok', position, turnCount: track.turns.length });
});

// 赛道模式API
app.post('/api/trackMode/start', express.json(), (req, res) => {
  const { trackId } = req.body;
  if (!trackId || !tracks[trackId]) {
    return res.status(400).json({ error: '无效的赛道ID' });
  }
  
  trackMode = {
    trackId: trackId,
    trackName: tracks[trackId].name
  };
  lastTurnIndex = -1;
  
  console.log(`[赛道模式] 已选择赛道: ${trackMode.trackName}`);
  res.json({ 
    status: 'ok', 
    trackId: trackId, 
    trackName: trackMode.trackName,
    turns: tracks[trackId].turns || []
  });
});

app.post('/api/trackMode/stop', (req, res) => {
  trackMode = null;
  lastTurnIndex = -1;
  console.log('[赛道模式] 已退出赛道模式');
  res.json({ status: 'ok' });
});

app.get('/api/trackMode/status', (req, res) => {
  res.json({
    active: !!trackMode,
    trackId: trackMode?.trackId || null,
    trackName: trackMode?.trackName || null,
    turns: trackMode && tracks[trackMode.trackId] ? tracks[trackMode.trackId].turns || [] : []
  });
});

// 赛道识别API - 基于当前轨迹识别赛道
let lastRecognitionResult = null;
let recognitionHistory = [];

app.get('/api/trackRecognition/current', (req, res) => {
  res.json({
    result: lastRecognitionResult,
    history: recognitionHistory.slice(-10)
  });
});

app.post('/api/trackRecognition/confirm', express.json(), (req, res) => {
  const { trackId, isCorrect } = req.body;
  
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }
  
  if (isCorrect) {
    // 确认识别正确，自动进入赛道模式
    if (tracks[trackId]) {
      trackMode = {
        trackId: trackId,
        trackName: tracks[trackId].name
      };
      
      console.log(`[赛道识别] 用户确认赛道: ${tracks[trackId].name}`);
      io.emit('trackRecognitionConfirmed', {
        trackId,
        trackName: tracks[trackId].name,
        autoEntered: true
      });
      
      res.json({ status: 'ok', trackId, trackName: tracks[trackId].name });
    } else {
      res.status(404).json({ error: 'Track not found' });
    }
  } else {
    // 识别错误，记录反馈用于改进算法
    console.log(`[赛道识别] 用户反馈识别错误: ${trackId}`);
    io.emit('trackRecognitionFeedback', { trackId, correct: false });
    res.json({ status: 'ok', feedback: 'recorded' });
  }
});

// 手动选择赛道（从识别结果中）
app.post('/api/trackRecognition/select', express.json(), (req, res) => {
  const { trackId } = req.body;
  
  if (!trackId || !tracks[trackId]) {
    return res.status(400).json({ error: 'Invalid trackId' });
  }
  
  trackMode = {
    trackId: trackId,
    trackName: tracks[trackId].name
  };
  lastTurnIndex = -1;
  
  console.log(`[赛道识别] 手动选择赛道: ${tracks[trackId].name}`);
  io.emit('trackModeChanged', {
    active: true,
    trackId,
    trackName: tracks[trackId].name
  });
  
  res.json({ status: 'ok', trackId, trackName: tracks[trackId].name });
});

// 赛后分析API
app.get('/api/analysis/:sessionId', (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // 计算赛后分析数据
    const analysis = {
      sessionId: session.id,
      trackName: session.trackName || '未知赛道',
      trackId: session.trackId || null,
      vehicle: session.vehicle || null,
      date: session.savedAt,
      
      // 成绩统计
     成绩: {
        最快圈速: session.laps?.best || 0,
        上一圈速: session.laps?.last || 0,
        圈数: session.laps?.count || 0,
        总时长: session.summary?.duration || 0
      },
      
      // 走线分析
      走线分析: calculateDrivingLineAnalysis(session.positions || []),
      
      // 驾驶风格
      驾驶风格: calculateDrivingStyle(session.data || []),
      
      // 详细数据统计
      详细统计: calculateDetailedStats(session.data || []),
      
      // 综合评分（V5 新增）
      驾驶评分: calculateDrivingScore(session)
    };
    
    res.json(analysis);
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate analysis' });
  }
});

// 计算走线分析
function calculateDrivingLineAnalysis(positions) {
  if (!positions || positions.length === 0) {
    return { 评分: 0, 良好比例: 0, 偏差比例: 0, 严重偏离: 0 };
  }
  
  let good = 0, medium = 0, bad = 0;
  positions.forEach(p => {
    const dl = Math.abs(p.drivingLine || 0);
    if (dl < 30) good++;
    else if (dl < 70) medium++;
    else bad++;
  });
  
  const total = positions.length;
  const score = Math.round((good / total) * 100);
  
  return {
    评分: score,
    良好比例: Math.round((good / total) * 100),
    偏差比例: Math.round((medium / total) * 100),
    严重偏离: Math.round((bad / total) * 100),
    总点数: total
  };
}

// 计算驾驶风格
function calculateDrivingStyle(data) {
  if (!data || data.length === 0) {
    return { 油门控制: 0, 刹车控制: 0, 转向平顺性: 0, G力分布: {} };
  }
  
  let maxAccel = 0, maxBrake = 0, maxGLong = 0, maxGLat = 0;
  let steerChanges = 0;
  let prevSteer = 0;
  
  data.forEach(d => {
    const accel = d.controls?.accel || 0;
    const brake = d.controls?.brake || 0;
    const steer = d.controls?.steer || 0;
    const gLong = Math.abs(d.acceleration?.z || 0);
    const gLat = Math.abs(d.acceleration?.x || 0);
    
    if (accel > maxAccel) maxAccel = accel;
    if (brake > maxBrake) maxBrake = brake;
    if (gLong > maxGLong) maxGLong = gLong;
    if (gLat > maxGLat) maxGLat = gLat;
    
    // 计算转向变化次数
    if (Math.abs(steer - prevSteer) > 20) {
      steerChanges++;
    }
    prevSteer = steer;
  });
  
  // 计算平顺性评分（转向变化越少越平顺）
  const steerSmoothness = Math.max(0, 100 - Math.round((steerChanges / data.length) * 100));
  
  return {
    油门控制: Math.round((maxAccel / 255) * 100),
    刹车控制: Math.round((maxBrake / 255) * 100),
    转向平顺性: steerSmoothness,
    G力分布: {
      最大纵向: Math.round(maxGLong * 100) / 100,
      最大横向: Math.round(maxGLat * 100) / 100
    }
  };
}

// 计算详细统计
function calculateDetailedStats(data) {
  if (!data || data.length === 0) {
    return {};
  }
  
  let maxSpeed = 0, maxRpm = 0, maxPower = 0;
  let speedSum = 0, rpmSum = 0;
  let count = 0;
  
  data.forEach(d => {
    const speed = d.speedKmh || 0;
    const rpm = d.currentEngineRpm || 0;
    const power = d.powerHP || 0;
    
    if (speed > maxSpeed) maxSpeed = speed;
    if (rpm > maxRpm) maxRpm = rpm;
    if (power > maxPower) maxPower = power;
    
    speedSum += speed;
    rpmSum += rpm;
    count++;
  });
  
  return {
    最高速度: Math.round(maxSpeed),
    最高转速: Math.round(maxRpm),
    最大马力: Math.round(maxPower),
    平均速度: Math.round(speedSum / count),
    平均转速: Math.round(rpmSum / count),
    数据点数: count
  };
}

// 驾驶综合评分（V5 新增）
// 5 维度 × 20 分 = 100 分
function calculateDrivingScore(session) {
  const data = session.data || [];
  const positions = session.positions || [];
  const laps = session.laps || {};
  
  if (data.length === 0) {
    return { 总分: 0, 等级: 'N/A', 维度: {}, 建议: ['数据不足，无法评分'] };
  }
  
  // === 维度 1: 圈速（20分）===
  // 提取每圈用时：currentLap 在 lapNumber 变化时为上一圈总用时
  const lapTimes = [];
  let prevLapNum = 0;
  data.forEach((d) => {
    const ln = d.lapNumber || d.lapNum || 0;
    if (ln > prevLapNum && prevLapNum > 0 && d.lapTime) {
      lapTimes.push(d.lapTime);
    }
    if (ln > 0) prevLapNum = ln;
  });
  const bestLap = laps.best || 0;
  let lapScore = 0;
  if (bestLap > 0 && lapTimes.length > 0) {
    // 平均圈速越接近最佳圈，得分越高
    const avgLap = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
    const avgDelta = avgLap - bestLap;
    lapScore = Math.max(0, Math.min(20, 20 - Math.round(avgDelta * 2))); // 每+0.5s 扣 1 分
  } else if (bestLap > 0) {
    lapScore = 15; // 只能算最佳圈，没多圈数据给中等分
  }
  
  // === 维度 2: 刹车（20分）===
  // 检测重刹车点是否合理（gLong > 0.7 时算重刹车）
  // 评价：直道/平缓弯能重刹，急弯后不应连续重刹
  let heavyBrakeCount = 0;
  let totalBrakeCount = 0;
  let consecutiveBrake = 0;
  let maxConsecutive = 0;
  data.forEach(d => {
    const brake = d.controls?.brake || d.brake || 0;
    const gLong = Math.abs(d.acceleration?.z || d.gLong || 0);
    if (brake > 100) {
      totalBrakeCount++;
      if (gLong > 0.7) heavyBrakeCount++;
    }
    if (brake > 50) {
      consecutiveBrake++;
      if (consecutiveBrake > maxConsecutive) maxConsecutive = consecutiveBrake;
    } else {
      consecutiveBrake = 0;
    }
  });
  let brakeScore = 10;
  if (totalBrakeCount > 0) {
    const heavyRatio = heavyBrakeCount / totalBrakeCount;
    // 重刹占比 0.3-0.5 是健康范围（占比太高=经常紧急刹车，太低=不敢刹）
    if (heavyRatio > 0.2 && heavyRatio < 0.6) brakeScore = 18;
    else if (heavyRatio > 0.1 && heavyRatio < 0.7) brakeScore = 15;
    else if (heavyRatio > 0.05) brakeScore = 12;
    else brakeScore = 8; // 几乎不重刹
    // 长连续刹车扣分
    if (maxConsecutive > 100) brakeScore -= 3;
  }
  brakeScore = Math.max(0, Math.min(20, brakeScore));
  
  // === 维度 3: 油门（20分）===
  // 出弯油门响应：gLat > 0.5 的弯中，accel 是否及时给上
  let corneringCount = 0;
  let goodThrottleInCorner = 0;
  data.forEach(d => {
    const gLat = Math.abs(d.acceleration?.x || d.gLat || 0);
    const accel = d.controls?.accel || d.accel || 0;
    if (gLat > 0.5) {
      corneringCount++;
      // 弯中给油 > 150 = 良好
      if (accel > 150) goodThrottleInCorner++;
    }
  });
  let throttleScore = 10;
  if (corneringCount > 0) {
    const ratio = goodThrottleInCorner / corneringCount;
    throttleScore = Math.round(ratio * 20);
  }
  throttleScore = Math.max(0, Math.min(20, throttleScore));
  
  // === 维度 4: 走线（20分）===
  // drivingLine 在 -30 ~ 30 内算良好
  let goodLineCount = 0;
  positions.forEach(p => {
    const dl = Math.abs(p.drivingLine || 0);
    if (dl < 30) goodLineCount++;
  });
  let lineScore = 0;
  if (positions.length > 0) {
    lineScore = Math.round((goodLineCount / positions.length) * 20);
  }
  lineScore = Math.max(0, Math.min(20, lineScore));
  
  // === 维度 5: 一致性（20分）===
  // 多圈时间方差越小越好
  let consistencyScore = 0;
  if (lapTimes.length >= 2) {
    const avg = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
    const variance = lapTimes.reduce((sum, t) => sum + (t - avg) ** 2, 0) / lapTimes.length;
    const stdDev = Math.sqrt(variance);
    // 标准差 < 0.5s = 20 分；> 3s = 0 分
    consistencyScore = Math.max(0, Math.min(20, Math.round(20 - stdDev * 6)));
  } else {
    consistencyScore = 8; // 单圈无法评估
  }
  
  const total = lapScore + brakeScore + throttleScore + lineScore + consistencyScore;
  let grade = 'C';
  if (total >= 90) grade = 'S+';
  else if (total >= 80) grade = 'S';
  else if (total >= 70) grade = 'A';
  else if (total >= 60) grade = 'B';
  else if (total >= 40) grade = 'C';
  else grade = 'D';
  
  // 生成建议
  const advice = [];
  if (lapScore < 14) advice.push('圈速不稳定，专注完成完整圈并参考最佳圈节奏');
  if (brakeScore < 12) advice.push('刹车控制需改进：避免过晚刹车，多利用直道末端的重刹区');
  if (throttleScore < 12) advice.push('出弯油门响应偏慢，弯心过后应渐进给油保持牵引力');
  if (lineScore < 12) advice.push('走线偏激进或偏保守，尝试贴近赛道上公认的赛车线');
  if (consistencyScore < 12) advice.push('圈速波动大，专注每圈相同节奏，避免刻意刷单圈');
  if (advice.length === 0) advice.push('表现优秀！保持当前节奏，挑战自我极限');
  
  return {
    总分: total,
    等级: grade,
    圈数统计: lapTimes.length,
    维度: {
      圈速: { 分数: lapScore, 满分: 20, 最佳圈: bestLap, 平均圈: lapTimes.length > 0 ? Math.round((lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length) * 1000) / 1000 : 0 },
      刹车: { 分数: brakeScore, 满分: 20, 重刹占比: totalBrakeCount > 0 ? Math.round((heavyBrakeCount / totalBrakeCount) * 100) : 0 },
      油门: { 分数: throttleScore, 满分: 20, 弯中给油比: corneringCount > 0 ? Math.round((goodThrottleInCorner / corneringCount) * 100) : 0 },
      走线: { 分数: lineScore, 满分: 20, 良好比例: positions.length > 0 ? Math.round((goodLineCount / positions.length) * 100) : 0 },
      一致性: { 分数: consistencyScore, 满分: 20, 圈数: lapTimes.length }
    },
    建议: advice
  };
}

// 轮胎性能分析
function calculateTireAnalysis(data) {
  if (!data || data.length === 0) {
    return { 温度分布: {}, 打滑统计: {}, 侧偏角分析: {} };
  }
  
  const tireTempFL = [], tireTempFR = [], tireTempRL = [], tireTempRR = [];
  const slipFL = [], slipFR = [], slipRL = [], slipRR = [];
  const angleFL = [], angleFR = [], angleRL = [], angleRR = [];
  
  data.forEach(d => {
    if (d.tireTemp) {
      tireTempFL.push(d.tireTemp.frontLeft || 0);
      tireTempFR.push(d.tireTemp.frontRight || 0);
      tireTempRL.push(d.tireTemp.rearLeft || 0);
      tireTempRR.push(d.tireTemp.rearRight || 0);
    }
    if (d.tireCombinedSlip) {
      slipFL.push(d.tireCombinedSlip.frontLeft || 0);
      slipFR.push(d.tireCombinedSlip.frontRight || 0);
      slipRL.push(d.tireCombinedSlip.rearLeft || 0);
      slipRR.push(d.tireCombinedSlip.rearRight || 0);
    }
    if (d.tireSlipAngle) {
      angleFL.push(d.tireSlipAngle.frontLeft || 0);
      angleFR.push(d.tireSlipAngle.frontRight || 0);
      angleRL.push(d.tireSlipAngle.rearLeft || 0);
      angleRR.push(d.tireSlipAngle.rearRight || 0);
    }
  });
  
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const max = arr => arr.length > 0 ? Math.max(...arr) : 0;
  
  const avgTempFL = avg(tireTempFL);
  const avgTempFR = avg(tireTempFR);
  const avgTempRL = avg(tireTempRL);
  const avgTempRR = avg(tireTempRR);
  
  return {
    温度分布: {
      前左: Math.round(avgTempFL),
      前右: Math.round(avgTempFR),
      后左: Math.round(avgTempRL),
      后右: Math.round(avgTempRR),
      平均温度: Math.round((avgTempFL + avgTempFR + avgTempRL + avgTempRR) / 4),
      最高温差: Math.round(Math.max(avgTempFL, avgTempFR, avgTempRL, avgTempRR) - Math.min(avgTempFL, avgTempFR, avgTempRL, avgTempRR))
    },
    打滑统计: {
      前左平均: (avg(slipFL)).toFixed(2),
      前右平均: (avg(slipFR)).toFixed(2),
      后左平均: (avg(slipRL)).toFixed(2),
      后右平均: (avg(slipRR)).toFixed(2),
      最大打滑: (max([...slipFL, ...slipFR, ...slipRL, ...slipRR])).toFixed(2),
      打滑时间比例: Math.round(data.filter(d => {
        const slip = d.tireCombinedSlip || {};
        return (slip.frontLeft || 0) > 0.8 || (slip.frontRight || 0) > 0.8 || 
               (slip.rearLeft || 0) > 0.8 || (slip.rearRight || 0) > 0.8;
      }).length / data.length * 100)
    },
    侧偏角分析: {
      前左平均: (avg(angleFL)).toFixed(1),
      前右平均: (avg(angleFR)).toFixed(1),
      后左平均: (avg(angleRL)).toFixed(1),
      后右平均: (avg(angleRR)).toFixed(1)
    }
  };
}

// 制动分析
function calculateBrakingAnalysis(data, positions) {
  if (!data || data.length === 0) {
    return { 刹车点: [], 刹车力度: {}, 刹车效率: 0 };
  }
  
  const brakeEvents = [];
  let isBraking = false;
  let brakeStart = null;
  
  data.forEach((d, i) => {
    const brake = d.controls?.brake || 0;
    
    if (brake > 50 && !isBraking) {
      isBraking = true;
      brakeStart = {
        index: i,
        speed: d.speedKmh || 0,
        position: d.position || {},
        time: d.timestampMS || 0
      };
    } else if (brake <= 50 && isBraking) {
      isBraking = false;
      if (brakeStart) {
        const brakeEnd = {
          index: i,
          speed: d.speedKmh || 0,
          position: d.position || {},
          time: d.timestampMS || 0
        };
        
        brakeEvents.push({
          起始速度: Math.round(brakeStart.speed),
          结束速度: Math.round(brakeEnd.speed),
          速度损失: Math.round(brakeStart.speed - brakeEnd.speed),
          持续时间: brakeEnd.time - brakeStart.time,
          起始位置: brakeStart.position,
          结束位置: brakeEnd.position
        });
      }
    }
  });
  
  const brakeValues = data.map(d => d.controls?.brake || 0).filter(b => b > 0);
  const avgBrake = brakeValues.length > 0 ? brakeValues.reduce((a, b) => a + b, 0) / brakeValues.length : 0;
  
  const brakeGForces = data.map(d => Math.abs(d.acceleration?.z || 0)).filter(g => g > 0.1);
  const avgBrakeG = brakeGForces.length > 0 ? brakeGForces.reduce((a, b) => a + b, 0) / brakeGForces.length : 0;
  
  return {
    刹车事件: brakeEvents.slice(0, 20),
    刹车事件总数: brakeEvents.length,
    平均刹车力度: Math.round(avgBrake),
    平均刹车G力: avgBrakeG.toFixed(2),
    刹车效率: avgBrake > 0 ? (avgBrakeG / (avgBrake / 255) * 100).toFixed(0) : 0
  };
}

// 加速效率分析
function calculateAccelerationAnalysis(data) {
  if (!data || data.length === 0) {
    return { 加速G力: {}, 牵引力利用率: 0, 出弯加速点: [] };
  }
  
  const accelEvents = [];
  let isAccelerating = false;
  let accelStart = null;
  
  data.forEach((d, i) => {
    const accel = d.controls?.accel || 0;
    const brake = d.controls?.brake || 0;
    
    if (accel > 200 && brake < 30 && !isAccelerating) {
      isAccelerating = true;
      accelStart = {
        index: i,
        speed: d.speedKmh || 0,
        time: d.timestampMS || 0
      };
    } else if ((accel < 100 || brake > 50) && isAccelerating) {
      isAccelerating = false;
      if (accelStart) {
        const accelEnd = {
          index: i,
          speed: d.speedKmh || 0,
          time: d.timestampMS || 0
        };
        
        accelEvents.push({
          起始速度: Math.round(accelStart.speed),
          结束速度: Math.round(accelEnd.speed),
          速度提升: Math.round(accelEnd.speed - accelStart.speed),
          持续时间: accelEnd.time - accelStart.time
        });
      }
    }
  });
  
  const accelGForces = data.map(d => d.acceleration?.z || 0).filter(g => g > 0.1);
  const avgAccelG = accelGForces.length > 0 ? accelGForces.reduce((a, b) => a + b, 0) / accelGForces.length : 0;
  const maxAccelG = accelGForces.length > 0 ? Math.max(...accelGForces) : 0;
  
  const slipDuringAccel = data.filter(d => (d.controls?.accel || 0) > 200)
    .map(d => {
      const slip = d.tireCombinedSlip || {};
      return Math.max(slip.frontLeft || 0, slip.frontRight || 0, slip.rearLeft || 0, slip.rearRight || 0);
    });
  const avgSlipDuringAccel = slipDuringAccel.length > 0 ? slipDuringAccel.reduce((a, b) => a + b, 0) / slipDuringAccel.length : 0;
  
  return {
    加速事件: accelEvents.slice(0, 20),
    加速事件总数: accelEvents.length,
    平均加速G力: avgAccelG.toFixed(2),
    最大加速G力: maxAccelG.toFixed(2),
    牵引力利用率: ((1 - avgSlipDuringAccel) * 100).toFixed(0),
    平均加速打滑: avgSlipDuringAccel.toFixed(2)
  };
}

// 换挡分析
function calculateShiftAnalysis(data) {
  if (!data || data.length === 0) {
    return { 换挡点: [], 档位统计: {}, 转速利用率: 0 };
  }
  
  const shifts = [];
  let prevGear = 0;
  
  data.forEach((d, i) => {
    const gear = d.controls?.gear || 0;
    const rpm = d.currentEngineRpm || 0;
    const maxRpm = d.engineMaxRpm || 8000;
    
    if (gear !== prevGear && prevGear > 1 && gear > 1) {
      shifts.push({
        从档位: prevGear - 1,
        到档位: gear - 1,
        换挡转速: Math.round(rpm),
        转速百分比: Math.round((rpm / maxRpm) * 100),
        速度: Math.round(d.speedKmh || 0)
      });
    }
    prevGear = gear;
  });
  
  const gearUsage = {};
  data.forEach(d => {
    const gear = d.controls?.gear || 0;
    if (gear > 1) {
      const gearName = (gear - 1) + '档';
      gearUsage[gearName] = (gearUsage[gearName] || 0) + 1;
    }
  });
  
  const totalGearTime = Object.values(gearUsage).reduce((a, b) => a + b, 0);
  const gearPercentages = {};
  Object.entries(gearUsage).forEach(([gear, count]) => {
    gearPercentages[gear] = Math.round((count / totalGearTime) * 100);
  });
  
  const rpmValues = data.map(d => (d.currentEngineRpm || 0) / (d.engineMaxRpm || 8000) * 100);
  const avgRpmPercent = rpmValues.length > 0 ? rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length : 0;
  
  return {
    换挡事件: shifts.slice(0, 30),
    换挡总数: shifts.length,
    档位使用: gearPercentages,
    平均换挡转速: shifts.length > 0 ? Math.round(shifts.reduce((a, b) => a + b.换挡转速, 0) / shifts.length) : 0,
    平均转速利用率: Math.round(avgRpmPercent)
  };
}

// 赛道分段分析
function calculateSectorAnalysis(data, positions) {
  if (!data || data.length === 0 || !positions || positions.length === 0) {
    return { 分段: [] };
  }
  
  // 基于位置将赛道分成多个段落
  const sectorCount = 5;
  const sectorLength = Math.floor(positions.length / sectorCount);
  const sectors = [];
  
  for (let i = 0; i < sectorCount; i++) {
    const startIdx = i * sectorLength;
    const endIdx = i === sectorCount - 1 ? positions.length - 1 : (i + 1) * sectorLength;
    
    const sectorPositions = positions.slice(startIdx, endIdx + 1);
    const sectorData = data.filter(d => {
      const pos = d.position;
      if (!pos) return false;
      
      // 检查位置是否在段落范围内
      const startX = sectorPositions[0]?.x || 0;
      const startZ = sectorPositions[0]?.z || 0;
      const endX = sectorPositions[sectorPositions.length - 1]?.x || 0;
      const endZ = sectorPositions[sectorPositions.length - 1]?.z || 0;
      
      const minX = Math.min(startX, endX) - 50;
      const maxX = Math.max(startX, endX) + 50;
      const minZ = Math.min(startZ, endZ) - 50;
      const maxZ = Math.max(startZ, endZ) + 50;
      
      return pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ;
    });
    
    const speeds = sectorData.map(d => d.speedKmh || 0).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    
    const drivingLines = sectorPositions.map(p => Math.abs(p.drivingLine || 0));
    const goodLines = drivingLines.filter(dl => dl < 30).length;
    const lineScore = drivingLines.length > 0 ? Math.round((goodLines / drivingLines.length) * 100) : 0;
    
    sectors.push({
      段落: i + 1,
      平均速度: Math.round(avgSpeed),
      最高速度: Math.round(maxSpeed),
      走线评分: lineScore,
      数据点数: sectorData.length
    });
  }
  
  return {
    分段数: sectorCount,
    分段: sectors
  };
}

// 赛道分段计时分析（按距离分割，支持自定义sector数，只分析最佳圈）
function analyzeSectors(positions, numSectors = 3, bestLapHint = 0) {
  if (!positions || positions.length < 10) return null;

  // 按lapNum分组，过滤不完整圈，选择最佳圈
  const laps = new Map();
  for (const p of positions) {
    const ln = p.lapNum || 0;
    if (!laps.has(ln)) laps.set(ln, []);
    laps.get(ln).push(p);
  }

  // 收集所有完整圈的数据
  const lapCandidates = [];
  for (const [ln, lapPos] of laps) {
    if (lapPos.length < 500) continue; // 过滤不完整圈（需要更多数据点）
    const times = lapPos.map(p => p.lapTime || 0).filter(t => t > 0);
    if (times.length < 2) continue;
    const duration = Math.max(...times) - Math.min(...times);
    if (duration <= 15) continue; // 过滤过短圈（至少15秒）
    lapCandidates.push({ ln, lapPos, duration });
  }

  let bestLapPositions = positions;
  if (lapCandidates.length > 0) {
    if (bestLapHint > 15) {
      // 使用hint选择最接近的圈
      const best = lapCandidates.reduce((min, c) =>
        Math.abs(c.duration - bestLapHint) < Math.abs(min.duration - bestLapHint) ? c : min
      );
      bestLapPositions = best.lapPos;
    } else {
      // 无hint时，选择duration最长的完整圈（最可能是完整数据）
      const best = lapCandidates.reduce((max, c) => c.duration > max.duration ? c : max);
      bestLapPositions = best.lapPos;
    }
  }

  const pos = bestLapPositions;

  let totalDist = 0;
  const dists = [0];
  for (let i = 1; i < pos.length; i++) {
    const dx = pos[i].x - pos[i - 1].x;
    const dz = pos[i].z - pos[i - 1].z;
    totalDist += Math.sqrt(dx * dx + dz * dz);
    dists.push(totalDist);
  }

  const sectorLength = totalDist / numSectors;
  const sectors = [];

  for (let s = 0; s < numSectors; s++) {
    const startDist = s * sectorLength;
    const endDist = (s + 1) * sectorLength;

    let startIdx = 0, endIdx = pos.length - 1;
    for (let i = 0; i < dists.length; i++) {
      if (dists[i] >= startDist) { startIdx = i; break; }
    }
    for (let i = dists.length - 1; i >= 0; i--) {
      if (dists[i] <= endDist) { endIdx = i; break; }
    }
    if (startIdx >= endIdx) endIdx = Math.min(startIdx + 1, pos.length - 1);

    const slice = pos.slice(startIdx, endIdx + 1);
    if (slice.length === 0) continue;

    const startTime = slice[0].lapTime || 0;
    const endTime = slice[slice.length - 1].lapTime || 0;
    const sectorTime = endTime - startTime;

    let maxSpeed = 0, sumSpeed = 0, sumAccel = 0, sumBrake = 0;
    slice.forEach(p => {
      if (p.speed > maxSpeed) maxSpeed = p.speed;
      sumSpeed += p.speed || 0;
      sumAccel += p.accel || 0;
      sumBrake += p.brake || 0;
    });

    sectors.push({
      sectorIndex: s + 1,
      startDist,
      endDist,
      sectorTime: sectorTime > 0 ? sectorTime : 0,
      maxSpeed,
      avgSpeed: slice.length > 0 ? sumSpeed / slice.length : 0,
      avgAccel: slice.length > 0 ? sumAccel / slice.length : 0,
      avgBrake: slice.length > 0 ? sumBrake / slice.length : 0,
      dataPoints: slice.length
    });
  }

  return {
    numSectors,
    totalDist,
    sectors,
    totalSectorTime: sectors.reduce((sum, s) => sum + s.sectorTime, 0)
  };
}

// 驾驶建议系统
function generateDrivingAdvice(analysis) {
  const advice = [];
  
  // 走线建议
  if (analysis.走线分析 && analysis.走线分析.偏差比例 > 30) {
    advice.push({
      类型: '走线',
      严重程度: 'high',
      消息: '走线偏差较大，建议练习参考线',
      具体: '偏差比例' + analysis.走线分析.偏差比例 + '%，良好比例仅' + analysis.走线分析.良好比例 + '%'
    });
  }
  
  // 刹车建议
  if (analysis.制动分析 && analysis.制动分析.平均刹车G力) {
    const brakeG = parseFloat(analysis.制动分析.平均刹车G力);
    if (brakeG < 0.8) {
      advice.push({
        类型: '刹车',
        严重程度: 'medium',
        消息: '刹车力度不足，可以更晚更重地刹车',
        具体: '刹车G力平均仅' + brakeG + 'G，车辆极限可达1.5G'
      });
    }
  }
  
  // 轮胎管理建议
  if (analysis.轮胎分析 && analysis.轮胎分析.温度分布) {
    const tempDiff = analysis.轮胎分析.温度分布.最高温差;
    if (tempDiff > 20) {
      advice.push({
        类型: '轮胎',
        严重程度: 'medium',
        消息: '轮胎温度不均匀，检查悬挂调校',
        具体: '前后温差' + tempDiff + '°，建议增加前轮负外倾角'
      });
    }
  }
  
  // 加速建议
  if (analysis.加速分析 && analysis.加速分析.平均加速打滑) {
    const slip = parseFloat(analysis.加速分析.平均加速打滑);
    if (slip > 0.3) {
      advice.push({
        类型: '加速',
        严重程度: 'low',
        消息: '出弯打滑较多，油门控制需要更细腻',
        具体: '平均轮胎打滑' + slip.toFixed(2) + '，建议渐进加油'
      });
    }
  }
  
  // 换挡建议
  if (analysis.换挡分析 && analysis.换挡分析.平均转速利用率) {
    const rpmUtil = analysis.换挡分析.平均转速利用率;
    if (rpmUtil < 70) {
      advice.push({
        类型: '换挡',
        严重程度: 'low',
        消息: '转速利用率偏低，可以延迟换挡',
        具体: '平均转速利用率仅' + rpmUtil + '%，建议在90%以上换挡'
      });
    }
  }
  
  if (advice.length === 0) {
    advice.push({
      类型: '综合',
      严重程度: 'info',
      消息: '驾驶表现良好',
      具体: '各项指标均在合理范围内'
    });
  }
  
  return advice;
}

// 调校-遥测智能诊断引擎
function generateTuneDiagnosis(session, tune) {
  const diagnoses = [];
  const data = session.data || [];
  if (data.length === 0 || !tune) return diagnoses;

  // 计算遥测统计
  const temps = { fl: [], fr: [], rl: [], rr: [] };
  const suspensions = { fl: [], fr: [], rl: [], rr: [] };
  const slips = { fl: [], fr: [], rl: [], rr: [] };
  const slipAngles = { fl: [], fr: [], rl: [], rr: [] };
  let understeerCount = 0;
  let oversteerCount = 0;
  let brakingFrameCount = 0;
  let accelFrameCount = 0;

  data.forEach(frame => {
    // 轮胎温度
    if (frame.tireTemp) {
      temps.fl.push(frame.tireTemp.frontLeft || 0);
      temps.fr.push(frame.tireTemp.frontRight || 0);
      temps.rl.push(frame.tireTemp.rearLeft || 0);
      temps.rr.push(frame.tireTemp.rearRight || 0);
    }
    // 悬挂
    if (frame.suspension) {
      suspensions.fl.push(frame.suspension.frontLeft || 0.5);
      suspensions.fr.push(frame.suspension.frontRight || 0.5);
      suspensions.rl.push(frame.suspension.rearLeft || 0.5);
      suspensions.rr.push(frame.suspension.rearRight || 0.5);
    }
    // 打滑
    if (frame.tireCombinedSlip) {
      slips.fl.push(frame.tireCombinedSlip.frontLeft || 0);
      slips.fr.push(frame.tireCombinedSlip.frontRight || 0);
      slips.rl.push(frame.tireCombinedSlip.rearLeft || 0);
      slips.rr.push(frame.tireCombinedSlip.rearRight || 0);
    }
    // 侧偏角
    if (frame.tireSlipAngle) {
      slipAngles.fl.push(frame.tireSlipAngle.frontLeft || 0);
      slipAngles.fr.push(frame.tireSlipAngle.frontRight || 0);
      slipAngles.rl.push(frame.tireSlipAngle.rearLeft || 0);
      slipAngles.rr.push(frame.tireSlipAngle.rearRight || 0);
    }
    // 转向不足/过度检测
    const accel = frame.acceleration || {};
    if (Math.abs(accel.x || 0) > 1.5) {
      if ((accel.x || 0) > 0) oversteerCount++;
      else understeerCount++;
    }
    // 刹车/加速帧计数
    if (frame.controls) {
      if (frame.controls.brake > 50) brakingFrameCount++;
      if (frame.controls.accel > 200) accelFrameCount++;
    }
  });

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgTemp = { fl: avg(temps.fl), fr: avg(temps.fr), rl: avg(temps.rl), rr: avg(temps.rr) };
  const avgSusp = { fl: avg(suspensions.fl), fr: avg(suspensions.fr), rl: avg(suspensions.rl), rr: avg(suspensions.rr) };
  const avgSlip = { fl: avg(slips.fl), fr: avg(slips.fr), rl: avg(slips.rl), rr: avg(slips.rr) };
  const frontTemp = (avgTemp.fl + avgTemp.fr) / 2;
  const rearTemp = (avgTemp.rl + avgTemp.rr) / 2;
  const frontSusp = (avgSusp.fl + avgSusp.fr) / 2;
  const rearSusp = (avgSusp.rl + avgSusp.rr) / 2;
  const totalFrames = data.length;

  // 1. 轮胎温度诊断
  if (frontTemp > rearTemp + 15) {
    diagnoses.push({ 类别: '轮胎', 严重程度: 'high', 问题: '前轮温度明显高于后轮', 数据: `前${frontTemp.toFixed(1)}°F vs 后${rearTemp.toFixed(1)}°F`, 建议: '降低前胎压 1-2 PSI 或 增加后胎压 1-2 PSI', 调整方向: { 'tires.frontPressure': -1, 'tires.rearPressure': +1 } });
  } else if (rearTemp > frontTemp + 15) {
    diagnoses.push({ 类别: '轮胎', 严重程度: 'high', 问题: '后轮温度明显高于前轮', 数据: `后${rearTemp.toFixed(1)}°F vs 前${frontTemp.toFixed(1)}°F`, 建议: '增加前胎压 1-2 PSI 或 降低后胎压 1-2 PSI', 调整方向: { 'tires.frontPressure': +1, 'tires.rearPressure': -1 } });
  }

  const leftTemp = (avgTemp.fl + avgTemp.rl) / 2;
  const rightTemp = (avgTemp.fr + avgTemp.rr) / 2;
  if (Math.abs(leftTemp - rightTemp) > 10) {
    diagnoses.push({ 类别: '轮胎', 严重程度: 'medium', 问题: '左右轮胎温度不均', 数据: `左${leftTemp.toFixed(1)}°F vs 右${rightTemp.toFixed(1)}°F`, 建议: '检查束角(Toe)设置，温度高的一侧应增加负束角', 调整方向: {} });
  }

  // 2. 悬挂诊断
  if (frontSusp < 0.35) {
    diagnoses.push({ 类别: '悬挂', 严重程度: 'high', 问题: '前悬挂过度压缩', 数据: `平均压缩${(frontSusp * 100).toFixed(0)}%`, 建议: '提高前车身高度 2-3cm 或 降低前弹簧硬度 5-10', 调整方向: { 'suspension.frontSpring': -5, 'suspension.frontRideHeight': +2 } });
  }
  if (rearSusp < 0.35) {
    diagnoses.push({ 类别: '悬挂', 严重程度: 'high', 问题: '后悬挂过度压缩', 数据: `平均压缩${(rearSusp * 100).toFixed(0)}%`, 建议: '提高后车身高度 2-3cm 或 降低后弹簧硬度 5-10', 调整方向: { 'suspension.rearSpring': -5, 'suspension.rearRideHeight': +2 } });
  }
  if (frontSusp > 0.65) {
    diagnoses.push({ 类别: '悬挂', 严重程度: 'medium', 问题: '前悬挂过度伸展', 数据: `平均伸展${(frontSusp * 100).toFixed(0)}%`, 建议: '降低前车身高度 2-3cm 或 增加前弹簧硬度 5-10', 调整方向: { 'suspension.frontSpring': +5, 'suspension.frontRideHeight': -2 } });
  }
  if (rearSusp > 0.65) {
    diagnoses.push({ 类别: '悬挂', 严重程度: 'medium', 问题: '后悬挂过度伸展', 数据: `平均伸展${(rearSusp * 100).toFixed(0)}%`, 建议: '降低后车身高度 2-3cm 或 增加后弹簧硬度 5-10', 调整方向: { 'suspension.rearSpring': +5, 'suspension.rearRideHeight': -2 } });
  }

  // 刹车时重心前移诊断
  if (data.length > 0) {
    let noseDiveCount = 0;
    data.forEach(frame => {
      if (frame.controls && frame.controls.brake > 100 && frame.suspension) {
        if (frame.suspension.frontLeft < 0.35 && frame.suspension.frontRight < 0.35 && frame.suspension.rearLeft > 0.55 && frame.suspension.rearRight > 0.55) {
          noseDiveCount++;
        }
      }
    });
    if (noseDiveCount > totalFrames * 0.05) {
      diagnoses.push({ 类别: '悬挂', 严重程度: 'medium', 问题: '刹车时车头下沉严重', 数据: `严重帧占比${(noseDiveCount / totalFrames * 100).toFixed(1)}%`, 建议: '增加后弹簧硬度 5-10 或 增加后防倾杆 3-5', 调整方向: { 'suspension.rearSpring': +5, 'suspension.rearARB': +3 } });
    }
  }

  // 3. 差速器诊断
  if (understeerCount > oversteerCount * 2 && understeerCount > totalFrames * 0.03) {
    diagnoses.push({ 类别: '传动', 严重程度: 'medium', 问题: '转向不足倾向明显', 数据: `不足${understeerCount}次 vs 过度${oversteerCount}次`, 建议: '增加差速器加速值 5-10% 以改善出弯牵引力', 调整方向: { 'drivetrain.diffAccel': +5 } });
  }
  if (oversteerCount > understeerCount * 2 && oversteerCount > totalFrames * 0.03) {
    diagnoses.push({ 类别: '传动', 严重程度: 'medium', 问题: '转向过度倾向明显', 数据: `过度${oversteerCount}次 vs 不足${understeerCount}次`, 建议: '降低差速器减速值 5-10% 以改善入弯稳定性', 调整方向: { 'drivetrain.diffDecel': -5 } });
  }

  // 4. 空气动力学诊断
  if (understeerCount > totalFrames * 0.02) {
    diagnoses.push({ 类别: '空气动力学', 严重程度: 'low', 问题: '高速弯可能存在转向不足', 数据: `不足事件${understeerCount}次`, 建议: '增加前下压力 20-50kg 以增加前轴抓地力', 调整方向: { 'aero.frontDownforce': +20 } });
  }

  return diagnoses;
}

// 新增分析API端点
app.get('/api/analysis/:sessionId/tires', (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(calculateTireAnalysis(session.data || []));
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate tire analysis' });
  }
});

app.get('/api/analysis/:sessionId/braking', (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(calculateBrakingAnalysis(session.data || [], session.positions || []));
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate braking analysis' });
  }
});

app.get('/api/analysis/:sessionId/accel', (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(calculateAccelerationAnalysis(session.data || []));
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate acceleration analysis' });
  }
});

app.get('/api/analysis/:sessionId/shifts', (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(calculateShiftAnalysis(session.data || []));
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate shift analysis' });
  }
});

// CSV字段头
const CSV_HEADERS = [
  'timestamp', 'speed_kmh', 'rpm', 'gear', 'throttle', 'brake', 'steer', 'clutch', 'handbrake',
  'pos_x', 'pos_y', 'pos_z', 'yaw', 'pitch', 'roll',
  'g_long', 'g_lat', 'g_vert',
  'susp_fl', 'susp_fr', 'susp_rl', 'susp_rr',
  'slip_ratio_fl', 'slip_ratio_fr', 'slip_ratio_rl', 'slip_ratio_rr',
  'slip_angle_fl', 'slip_angle_fr', 'slip_angle_rl', 'slip_angle_rr',
  'combined_slip_fl', 'combined_slip_fr', 'combined_slip_rl', 'combined_slip_rr',
  'temp_fl', 'temp_fr', 'temp_rl', 'temp_rr',
  'wheel_speed_fl', 'wheel_speed_fr', 'wheel_speed_rl', 'wheel_speed_rr',
  'power_hp', 'torque', 'boost', 'fuel', 'distance',
  'current_lap', 'best_lap', 'last_lap', 'race_time', 'race_position', 'lap_number',
  'driving_line', 'rumble_fl', 'rumble_fr', 'rumble_rl', 'rumble_rr',
  'puddle_fl', 'puddle_fr', 'puddle_rl', 'puddle_rr'
];

// 展平遥测数据为CSV行
function flattenTelemetry(d) {
  return [
    d._recordedAt || '',
    d.speedKmh || 0,
    d.currentEngineRpm || 0,
    (d.controls?.gear || 0) - 1,
    d.controls?.accel || 0,
    d.controls?.brake || 0,
    d.controls?.steer || 0,
    d.controls?.clutch || 0,
    d.controls?.handBrake || 0,
    d.position?.x || 0,
    d.position?.y || 0,
    d.position?.z || 0,
    d.yaw || 0,
    d.pitch || 0,
    d.roll || 0,
    d.acceleration?.z || 0,
    d.acceleration?.x || 0,
    d.acceleration?.y || 0,
    d.suspension?.frontLeft || 0,
    d.suspension?.frontRight || 0,
    d.suspension?.rearLeft || 0,
    d.suspension?.rearRight || 0,
    d.tireSlipRatio?.frontLeft || 0,
    d.tireSlipRatio?.frontRight || 0,
    d.tireSlipRatio?.rearLeft || 0,
    d.tireSlipRatio?.rearRight || 0,
    d.tireSlipAngle?.frontLeft || 0,
    d.tireSlipAngle?.frontRight || 0,
    d.tireSlipAngle?.rearLeft || 0,
    d.tireSlipAngle?.rearRight || 0,
    d.tireCombinedSlip?.frontLeft || 0,
    d.tireCombinedSlip?.frontRight || 0,
    d.tireCombinedSlip?.rearLeft || 0,
    d.tireCombinedSlip?.rearRight || 0,
    d.tireTemp?.frontLeft || 0,
    d.tireTemp?.frontRight || 0,
    d.tireTemp?.rearLeft || 0,
    d.tireTemp?.rearRight || 0,
    d.wheelRotationSpeed?.frontLeft || 0,
    d.wheelRotationSpeed?.frontRight || 0,
    d.wheelRotationSpeed?.rearLeft || 0,
    d.wheelRotationSpeed?.rearRight || 0,
    d.powerHP || 0,
    d.torque || 0,
    d.boost || 0,
    d.fuel || 0,
    d.distanceTraveled || 0,
    d.currentLap || 0,
    d.bestLap || 0,
    d.lastLap || 0,
    d.currentRaceTime || 0,
    d.racePosition || 0,
    d.lapNumber || 0,
    d.drivingLine || 0,
    d.onRumbleStrip?.frontLeft || 0,
    d.onRumbleStrip?.frontRight || 0,
    d.onRumbleStrip?.rearLeft || 0,
    d.onRumbleStrip?.rearRight || 0,
    d.puddleDepth?.frontLeft || 0,
    d.puddleDepth?.frontRight || 0,
    d.puddleDepth?.rearLeft || 0,
    d.puddleDepth?.rearRight || 0
  ].map(v => typeof v === 'string' ? v : (typeof v === 'number' ? v.toFixed(4) : v));
}

// CSV导出API
app.get('/api/export/csv/:sessionId', (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="forza_telemetry_' + session.id + '.csv"');
    
    // 写入CSV头
    res.write(CSV_HEADERS.join(',') + '\n');
    
    // 流式写入数据
    const data = session.data || [];
    for (let i = 0; i < data.length; i++) {
      const row = flattenTelemetry(data[i]);
      res.write(row.join(',') + '\n');
    }
    
    res.end();
  } catch (e) {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// JSON导出API
app.get('/api/export/json/:sessionId', (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="forza_telemetry_' + session.id + '.json"');
    
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: 'Failed to export JSON' });
  }
});

// HTML报告生成器 (v3 - with debug markers)
function generateHTMLReport(session) {
  const analysis = {
    走线分析: calculateDrivingLineAnalysis(session.positions || []),
    驾驶风格: calculateDrivingStyle(session.data || []),
    轮胎分析: calculateTireAnalysis(session.data || []),
    制动分析: calculateBrakingAnalysis(session.data || [], session.positions || []),
    加速分析: calculateAccelerationAnalysis(session.data || []),
    换挡分析: calculateShiftAnalysis(session.data || []),
    分段分析: calculateSectorAnalysis(session.data || [], session.positions || [])
  };
  analysis.建议 = generateDrivingAdvice(analysis);
  analysis.驾驶评分 = calculateDrivingScore(session); // V10 集成 V5 评分

  const vehicle = session.vehicle || {};
  const laps = session.laps || {};
  const score = analysis.驾驶评分 || {};
  
  // V10 补充：本地时间格式化函数（原代码调用了不存在的 fmtTime）
  const fmtTime = (seconds) => {
    if (!seconds || seconds === 0) return '--:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + secs.toFixed(3).padStart(6, '0');
  };
  
  return '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Forza Horizon 5 赛后分析报告</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#c9d1d9;padding:20px}' +
    '.header{text-align:center;padding:20px 0;border-bottom:1px solid #30363d;margin-bottom:20px}' +
    '.header h1{font-size:24px;color:#58a6ff;margin-bottom:8px}' +
    '.header p{color:#8b949e;font-size:14px}' +
    '.card{background:#161b22;border-radius:8px;padding:16px;margin-bottom:16px;border:1px solid #30363d}' +
    '.card h2{font-size:16px;color:#58a6ff;margin-bottom:12px;border-bottom:1px solid #30363d;padding-bottom:8px}' +
    '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}' +
    '.stat{text-align:center;padding:12px;background:#0d1117;border-radius:6px}' +
    '.stat .label{font-size:11px;color:#8b949e;text-transform:uppercase}' +
    '.stat .value{font-size:24px;font-weight:700;color:#3fb950;margin-top:4px}' +
    '.stat .value.warn{color:#d29922}' +
    '.stat .value.danger{color:#f85149}' +
    '.advice{padding:12px;border-radius:6px;margin-bottom:8px}' +
    '.advice.high{background:rgba(248,81,73,0.1);border:1px solid #f85149}' +
    '.advice.medium{background:rgba(210,153,34,0.1);border:1px solid #d29922}' +
    '.advice.low{background:rgba(88,166,255,0.1);border:1px solid #58a6ff}' +
    '.advice.info{background:rgba(63,185,80,0.1);border:1px solid #3fb950}' +
    '.advice .type{font-weight:600;margin-bottom:4px}' +
    '.advice .msg{font-size:14px;margin-bottom:4px}' +
    '.advice .detail{font-size:12px;color:#8b949e}' +
    'table{width:100%;border-collapse:collapse}' +
    'th,td{padding:8px;text-align:left;border-bottom:1px solid #21262d;font-size:13px}' +
    'th{color:#8b949e;font-size:11px;text-transform:uppercase}' +
    // V10 走线热力图专用样式
    '.heatmap-tabs{display:flex;gap:6px;margin-bottom:8px}' +
    '.heatmap-tab{padding:4px 12px;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit}' +
    '.heatmap-tab.active{background:#58a6ff;color:#0d1117;border-color:#58a6ff;font-weight:700}' +
    '.heatmap-canvas{width:100%;height:420px;background:#0d1117;border-radius:4px;display:block}' +
    '.heatmap-legend{display:flex;align-items:center;gap:14px;margin-top:8px;font-size:11px;color:#8b949e}' +
    '.heatmap-legend .swatch{display:inline-block;width:12px;height:8px;border-radius:1px}' +
    '.heatmap-legend .bar{height:8px;border-radius:4px}' +
    '</style></head><body>' +
    '<div class="header">' +
    '<h1>Forza Horizon 5 赛后分析报告</h1>' +
    '<p>赛道: ' + (session.trackName || '未知') + ' | 车辆: ' + (vehicle.name || 'Car #' + (vehicle.ordinal || '未知')) + ' | 日期: ' + new Date(session.savedAt).toLocaleDateString('zh-CN') + '</p>' +
    '</div>' +
    
    // V10 新增：驾驶综合评分（V5 数据）
    '<div class="card" style="background:linear-gradient(135deg,rgba(0,120,255,0.08) 0%,rgba(0,200,150,0.08) 100%);border:1px solid #58a6ff">' +
    '<h2>驾驶综合评分</h2>' +
    '<div style="display:flex;align-items:center;justify-content:center;gap:16px;padding:8px 0">' +
    '<div style="font-size:48px;font-weight:900;color:#58a6ff;font-family:monospace">' + (score.总分 || 0) + '</div>' +
    '<div style="font-size:24px;font-weight:700;padding:6px 14px;border-radius:6px;background:' + 
      ((score.总分 || 0) >= 80 ? '#3fb950' : (score.总分 || 0) >= 60 ? '#d29922' : '#f85149') + ';color:#000">' + (score.等级 || 'N/A') + '</div>' +
    '</div>' +
    '<div class="stats">' +
    Object.entries(score.维度 || {}).map(([name, dim]) => {
      const ratio = (dim.分数 || 0) / (dim.满分 || 1);
      const c = ratio >= 0.8 ? '#3fb950' : ratio >= 0.6 ? '#d29922' : '#f85149';
      return '<div class="stat"><div class="label">' + name + '</div><div class="value" style="color:' + c + '">' + (dim.分数 || 0) + '/' + (dim.满分 || 0) + '</div></div>';
    }).join('') +
    '</div>' +
    ((score.建议 && score.建议.length > 0) ? 
      '<div style="margin-top:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;border-left:3px solid #58a6ff">' +
      score.建议.map(function(t){ return '<div style="font-size:13px;margin:4px 0;color:#c9d1d9">• ' + t + '</div>'; }).join('') +
      '</div>' : '') +
    '</div>' +
    
    // V10 新增：走线/油门/刹车热力图
    '<div class="card"><h2>赛道热力图</h2>' +
    '<div class="heatmap-tabs">' +
    '<button class="heatmap-tab active" data-mode="line" onclick="switchHeatmap(\'line\')">走线</button>' +
    '<button class="heatmap-tab" data-mode="throttle" onclick="switchHeatmap(\'throttle\')">油门</button>' +
    '<button class="heatmap-tab" data-mode="brake" onclick="switchHeatmap(\'brake\')">刹车</button>' +
    '<button class="heatmap-tab" data-mode="speed" onclick="switchHeatmap(\'speed\')">速度</button>' +
    '</div>' +
    '<canvas id="heatmap" class="heatmap-canvas" width="1200" height="500"></canvas>' +
    '<div class="heatmap-legend" id="heatmap-legend"></div>' +
    '</div>' +
    
    '<div class="card"><h2>成绩统计</h2><div class="stats">' +
    '<div class="stat"><div class="label">最快圈速</div><div class="value">' + (laps.best ? fmtTime(laps.best) : '--:--.---') + '</div></div>' +
    '<div class="stat"><div class="label">上一圈速</div><div class="value">' + (laps.last ? fmtTime(laps.last) : '--:--.---') + '</div></div>' +
    '<div class="stat"><div class="label">圈数</div><div class="value">' + (laps.count || 0) + '</div></div>' +
    '<div class="stat"><div class="label">总时长</div><div class="value">' + Math.round((session.summary?.duration || 0) / 1000) + 's</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>走线分析</h2><div class="stats">' +
    '<div class="stat"><div class="label">评分</div><div class="value' + (analysis.走线分析.评分 < 70 ? ' warn' : '') + '">' + analysis.走线分析.评分 + '%</div></div>' +
    '<div class="stat"><div class="label">良好比例</div><div class="value">' + analysis.走线分析.良好比例 + '%</div></div>' +
    '<div class="stat"><div class="label">偏差比例</div><div class="value warn">' + analysis.走线分析.偏差比例 + '%</div></div>' +
    '<div class="stat"><div class="label">严重偏离</div><div class="value danger">' + analysis.走线分析.严重偏离 + '%</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>驾驶风格</h2><div class="stats">' +
    '<div class="stat"><div class="label">油门控制</div><div class="value">' + analysis.驾驶风格.油门控制 + '%</div></div>' +
    '<div class="stat"><div class="label">刹车控制</div><div class="value">' + analysis.驾驶风格.刹车控制 + '%</div></div>' +
    '<div class="stat"><div class="label">转向平顺性</div><div class="value">' + analysis.驾驶风格.转向平顺性 + '%</div></div>' +
    '<div class="stat"><div class="label">最大纵向G</div><div class="value">' + (analysis.驾驶风格.G力分布?.最大纵向 || 0) + 'G</div></div>' +
    '<div class="stat"><div class="label">最大横向G</div><div class="value">' + (analysis.驾驶风格.G力分布?.最大横向 || 0) + 'G</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>轮胎分析</h2>' +
    '<div class="stats">' +
    '<div class="stat"><div class="label">平均温度</div><div class="value">' + analysis.轮胎分析.温度分布.平均温度 + '°F</div></div>' +
    '<div class="stat"><div class="label">最高温差</div><div class="value' + (analysis.轮胎分析.温度分布.最高温差 > 20 ? ' warn' : '') + '">' + analysis.轮胎分析.温度分布.最高温差 + '°F</div></div>' +
    '<div class="stat"><div class="label">打滑时间</div><div class="value">' + analysis.轮胎分析.打滑统计.打滑时间比例 + '%</div></div>' +
    '<div class="stat"><div class="label">最大打滑</div><div class="value">' + analysis.轮胎分析.打滑统计.最大打滑 + '</div></div>' +
    '</div>' +
    '<table><tr><th>轮胎</th><th>温度</th><th>平均打滑</th><th>侧偏角</th></tr>' +
    '<tr><td>前左</td><td>' + analysis.轮胎分析.温度分布.前左 + '°F</td><td>' + analysis.轮胎分析.打滑统计.前左平均 + '</td><td>' + analysis.轮胎分析.侧偏角分析.前左平均 + '°</td></tr>' +
    '<tr><td>前右</td><td>' + analysis.轮胎分析.温度分布.前右 + '°F</td><td>' + analysis.轮胎分析.打滑统计.前右平均 + '</td><td>' + analysis.轮胎分析.侧偏角分析.前右平均 + '°</td></tr>' +
    '<tr><td>后左</td><td>' + analysis.轮胎分析.温度分布.后左 + '°F</td><td>' + analysis.轮胎分析.打滑统计.后左平均 + '</td><td>' + analysis.轮胎分析.侧偏角分析.后左平均 + '°</td></tr>' +
    '<tr><td>后右</td><td>' + analysis.轮胎分析.温度分布.后右 + '°F</td><td>' + analysis.轮胎分析.打滑统计.后右平均 + '</td><td>' + analysis.轮胎分析.侧偏角分析.后右平均 + '°</td></tr>' +
    '</table></div>' +
    
    '<div class="card"><h2>制动分析</h2><div class="stats">' +
    '<div class="stat"><div class="label">刹车事件</div><div class="value">' + analysis.制动分析.刹车事件总数 + '</div></div>' +
    '<div class="stat"><div class="label">平均刹车力度</div><div class="value">' + analysis.制动分析.平均刹车力度 + '%</div></div>' +
    '<div class="stat"><div class="label">平均刹车G力</div><div class="value">' + analysis.制动分析.平均刹车G力 + 'G</div></div>' +
    '<div class="stat"><div class="label">刹车效率</div><div class="value">' + analysis.制动分析.刹车效率 + '%</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>加速分析</h2><div class="stats">' +
    '<div class="stat"><div class="label">加速事件</div><div class="value">' + analysis.加速分析.加速事件总数 + '</div></div>' +
    '<div class="stat"><div class="label">平均加速G力</div><div class="value">' + analysis.加速分析.平均加速G力 + 'G</div></div>' +
    '<div class="stat"><div class="label">最大加速G力</div><div class="value">' + analysis.加速分析.最大加速G力 + 'G</div></div>' +
    '<div class="stat"><div class="label">牵引力利用率</div><div class="value">' + analysis.加速分析.牵引力利用率 + '%</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>换挡分析</h2><div class="stats">' +
    '<div class="stat"><div class="label">换挡总数</div><div class="value">' + analysis.换挡分析.换挡总数 + '</div></div>' +
    '<div class="stat"><div class="label">平均换挡转速</div><div class="value">' + analysis.换挡分析.平均换挡转速 + 'RPM</div></div>' +
    '<div class="stat"><div class="label">转速利用率</div><div class="value">' + analysis.换挡分析.平均转速利用率 + '%</div></div>' +
    '</div>' +
    '<table><tr><th>档位</th><th>使用比例</th></tr>';
  
  const gearUsage = analysis.换挡分析.档位使用 || {};
  Object.entries(gearUsage).forEach(([gear, percent]) => {
    html += '<tr><td>' + gear + '</td><td>' + percent + '%</td></tr>';
  });
  html += '</table></div>';
  
  console.error('DEBUG: before sectors, html len=' + html.length);
  html += '<div class="card"><h2>赛道分段</h2><table><tr><th>段落</th><th>平均速度</th><th>最高速度</th><th>走线评分</th></tr>';
  const sectors = analysis.分段分析.分段 || [];
  sectors.forEach(s => {
    html += '<tr><td>段落' + s.段落 + '</td><td>' + s.平均速度 + 'km/h</td><td>' + s.最高速度 + 'km/h</td><td>' + s.走线评分 + '%</td></tr>';
  });
  html += '</table></div>';
  console.error('DEBUG: after sectors, html len=' + html.length);
  
  html += '<div class="card"><h2>驾驶建议</h2>';
  const advice = analysis.建议 || [];
  advice.forEach(a => {
    html += '<div class="advice ' + a.严重程度 + '">' +
      '<div class="type">' + a.类型 + '</div>' +
      '<div class="msg">' + a.消息 + '</div>' +
      '<div class="detail">' + a.具体 + '</div>' +
      '</div>';
  });
  html += '</div>';
  console.error('DEBUG: after advice, html len=' + html.length);
  
  html += '<div style="text-align:center;padding:20px;color:#8b949e;font-size:12px">' +
    'Forza Horizon 5 遥测系统 | 报告生成时间: ' + new Date().toLocaleString('zh-CN') +
    '</div>' +
    
    // V10 嵌入positions数据 + 热力图脚本
    '<script>var HEATMAP_POSITIONS = ' + JSON.stringify((session.positions || []).map(function(p){ 
      return { x: p.x, y: p.y, z: p.z, drivingLine: p.drivingLine, speed: p.speed, accel: p.accel, brake: p.brake }; 
    })) + ';</script>' +
    '<script>' +
    'var currentHeatmapMode = "line";' +
    'function lerpColor(a, b, t) { t = Math.max(0, Math.min(1, t)); return "rgb(" + Math.round(a[0] + (b[0]-a[0])*t) + "," + Math.round(a[1] + (b[1]-a[1])*t) + "," + Math.round(a[2] + (b[2]-a[2])*t) + ")"; }' +
    'function switchHeatmap(mode) {' +
      'currentHeatmapMode = mode;' +
      'document.querySelectorAll(".heatmap-tab").forEach(function(b){ b.classList.toggle("active", b.dataset.mode === mode); });' +
      'drawHeatmap();' +
    '}' +
    'function drawHeatmap() {' +
      'var canvas = document.getElementById("heatmap");' +
      'if (!canvas) return;' +
      'var ctx = canvas.getContext("2d");' +
      'var pts = HEATMAP_POSITIONS;' +
      'if (!pts || pts.length < 2) { ctx.fillStyle = "#0d1117"; ctx.fillRect(0,0,canvas.width,canvas.height); return; }' +
      'var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;' +
      'pts.forEach(function(p){ if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x; if (p.z<minZ) minZ=p.z; if (p.z>maxZ) maxZ=p.z; });' +
      'var pad = 30, w = canvas.width - pad*2, h = canvas.height - pad*2;' +
      'var scale = Math.min(w/(maxX-minX||1), h/(maxZ-minZ||1));' +
      'var offX = pad + (w - (maxX-minX)*scale)/2, offY = pad + (h - (maxZ-minZ)*scale)/2;' +
      'var toScreen = function(p) { return { x: offX + (p.x-minX)*scale, y: offY + (maxZ-p.z)*scale }; };' +
      'ctx.fillStyle = "#0d1117"; ctx.fillRect(0,0,canvas.width,canvas.height);' +
      '// 灰底赛道' +
      'ctx.strokeStyle = "#21262d"; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.lineJoin = "round";' +
      'ctx.beginPath(); pts.forEach(function(p,i){ var s=toScreen(p); if(i===0) ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y); }); ctx.closePath(); ctx.stroke();' +
      '// 找最大速度' +
      'var maxSpeed = 0; pts.forEach(function(p){ if (p.speed > maxSpeed) maxSpeed = p.speed; });' +
      '// 彩色轨迹' +
      'ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.lineJoin = "round";' +
      'for (var i = 1; i < pts.length; i++) {' +
        'var p1 = pts[i-1], p2 = pts[i]; var s1 = toScreen(p1), s2 = toScreen(p2);' +
        'var color;' +
        'if (currentHeatmapMode === "line") {' +
          'var dl = Math.abs(p1.drivingLine || 0);' +
          'if (dl < 20) color = "rgb(63,185,80)";' +
          'else if (dl < 50) color = "rgb(210,153,34)";' +
          'else color = "rgb(248,81,73)";' +
        '} else if (currentHeatmapMode === "throttle") {' +
          'color = lerpColor([40,40,40], [0,200,80], (p1.accel||0)/255);' +
        '} else if (currentHeatmapMode === "brake") {' +
          'color = lerpColor([40,40,40], [220,50,50], (p1.brake||0)/255);' +
        '} else {' +
          'color = lerpColor([30,30,60], [120,200,255], maxSpeed>0 ? (p1.speed||0)/maxSpeed : 0);' +
        '}' +
        'ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(s1.x,s1.y); ctx.lineTo(s2.x,s2.y); ctx.stroke();' +
      '}' +
      '// 起点' +
      'var start = toScreen(pts[0]);' +
      'ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(start.x, start.y, 6, 0, Math.PI*2); ctx.fill();' +
      'ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke();' +
      '// 图例' +
      'var leg = document.getElementById("heatmap-legend");' +
      'if (currentHeatmapMode === "line") {' +
        'leg.innerHTML = "<span><span class=\\"swatch\\" style=\\"background:#3fb950\\"></span> 理想</span><span><span class=\\"swatch\\" style=\\"background:#d29922\\"></span> 偏离</span><span><span class=\\"swatch\\" style=\\"background:#f85149\\"></span> 严重</span>";' +
      '} else if (currentHeatmapMode === "throttle") {' +
        'leg.innerHTML = "<span>低</span><span class=\\"bar\\" style=\\"flex:1;max-width:200px;background:linear-gradient(to right,rgb(40,40,40),rgb(0,200,80))\\"></span><span>高</span>";' +
      '} else if (currentHeatmapMode === "brake") {' +
        'leg.innerHTML = "<span>低</span><span class=\\"bar\\" style=\\"flex:1;max-width:200px;background:linear-gradient(to right,rgb(40,40,40),rgb(220,50,50))\\"></span><span>高</span>";' +
      '} else {' +
        'leg.innerHTML = "<span>低</span><span class=\\"bar\\" style=\\"flex:1;max-width:200px;background:linear-gradient(to right,rgb(30,30,60),rgb(120,200,255))\\"></span><span>高</span>";' +
      '}' +
    '}' +
    // 等待 DOM ready 后绘制
    'window.addEventListener("DOMContentLoaded", function(){ setTimeout(drawHeatmap, 50); });' +
    '</script>' +
    '</body></html>';
  
  console.error('GEN_DEBUG: Final html.length=' + html.length + ', ends with: ' + JSON.stringify(html.slice(-50)));
  return html;
}

// 测试端点
app.get('/api/test/report/:sessionId', (req, res) => {
  try {
    const sessionsDir = DATA_DIR + '/sessions';
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const file = files.find(f => f.includes(req.params.sessionId));
    if (!file) return res.status(404).json({ error: 'Session not found' });
    const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
    console.error('TEST: session loaded, positions=' + ((session.positions || []).length));
    console.error('TEST: analysis start');
    const analysis = {
      走线分析: calculateDrivingLineAnalysis(session.positions || []),
      驾驶风格: calculateDrivingStyle(session.data || []),
      详细统计: calculateDetailedStats(session.data || []),
      轮胎分析: calculateTireAnalysis(session.data || []),
      制动分析: calculateBrakingAnalysis(session.data || []),
      加速分析: calculateAccelerationAnalysis(session.data || []),
      换挡分析: calculateShiftAnalysis(session.data || []),
      分段分析: calculateSectorAnalysis(session.data || [], session.positions || [])
    };
    analysis.建议 = generateDrivingAdvice(analysis);
    analysis.驾驶评分 = calculateDrivingScore(session);
    console.error('TEST: analysis done, sectors=' + (analysis.分段分析.分段 || []).length);
    console.error('TEST: html build start');
    const html = generateHTMLReport(session);
    console.error('TEST: html done, len=' + html.length);
    console.error('TEST: html.slice(7500,7600):', JSON.stringify(html.slice(7500, 7600)));
    res.json({ htmlLen: html.length, hasHeatmap: html.includes('HEATMAP_POSITIONS'), hasSectors: html.includes('赛道分段'), hasAdvice: html.includes('驾驶建议'), sample: html.slice(7500, 7550) });
  } catch (e) {
    console.error('TEST ERROR:', e && e.message, (e && e.stack || '').split('\n')[1]);
    res.status(500).json({ error: e.message });
  }
});

// HTML报告导出API
app.get('/api/export/report/:sessionId', (req, res) => {
  try {
    const sessionsDir = DATA_DIR + '/sessions';
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const file = files.find(f => f.includes(req.params.sessionId));
    if (!file) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
    
    const html = generateHTMLReport(session);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'attachment; filename="forza_report_' + session.id + '.html"');

    res.send(html);
  } catch (e) {
    console.error('报告生成失败:', e && e.message, e && e.stack);
    try {
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate report: ' + e.message });
    } catch(_) {}
  }
});

app.get('/api/analysis/:sessionId/sectors', (req, res) => {
  try {
    const session = loadSessionById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const numSectors = parseInt(req.query.sectors) || 3;
    const result = analyzeSectors(session.positions || [], numSectors, session.laps?.best || 0);
    if (!result) return res.json({ error: 'Insufficient position data' });
    res.json(result);
  } catch (e) {
    console.error('[Sector Analysis] Error:', e);
    res.status(500).json({ error: 'Failed to analyze sectors' });
  }
});

app.get('/api/analysis/:sessionId/advice', (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const analysis = {
      走线分析: calculateDrivingLineAnalysis(session.positions || []),
      轮胎分析: calculateTireAnalysis(session.data || []),
      制动分析: calculateBrakingAnalysis(session.data || [], session.positions || []),
      加速分析: calculateAccelerationAnalysis(session.data || []),
      换挡分析: calculateShiftAnalysis(session.data || [])
    };

    res.json(generateDrivingAdvice(analysis));
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate driving advice' });
  }
});

// 调校-遥测智能诊断API
app.get('/api/analysis/:sessionId/diagnosis', (req, res) => {
  try {
    const session = loadSessionById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const tune = session.tuneId ? tunes[session.tuneId] : null;
    const diagnoses = generateTuneDiagnosis(session, tune);
    res.json({ tuneId: session.tuneId, tuneName: tune?.name, diagnoses });
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate tune diagnosis' });
  }
});

// ===== 个人圈速排行榜与进步追踪 =====

// Leaderboard 缓存
let leaderboardCache = null;
let leaderboardCacheTime = 0;
const LEADERBOARD_CACHE_TTL = 30000; // 30秒缓存

function buildLeaderboard() {
  // 使用缓存
  if (leaderboardCache && (Date.now() - leaderboardCacheTime) < LEADERBOARD_CACHE_TTL) {
    return leaderboardCache;
  }

  const sessionsDir = DATA_DIR + '/sessions';
  if (!fs.existsSync(sessionsDir)) return [];
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));

  const groups = new Map(); // key: trackId + '_' + vehicleOrdinal

  files.forEach(f => {
    try {
      const s = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
      const trackId = s.trackId || 'unknown';
      const vehicleOrdinal = s.vehicle?.ordinal || 'unknown';
      const key = trackId + '_' + vehicleOrdinal;
      const bestLap = s.laps?.best || 0;
      const lastLap = s.laps?.last || 0;
      const lapCount = s.laps?.count || 0;

      if (!groups.has(key)) {
        groups.set(key, {
          trackId,
          trackName: s.trackName || '未知赛道',
          vehicleOrdinal: s.vehicle?.ordinal || null,
          vehicleClass: s.vehicle?.class || null,
          vehiclePI: s.vehicle?.performanceIndex || null,
          sessions: [],
          bestLap: Infinity,
          avgBestLap: 0,
          totalLaps: 0,
          sessionCount: 0,
          tunesUsed: new Map()
        });
      }

      const g = groups.get(key);
      g.sessions.push({
        sessionId: s.id,
        savedAt: s.savedAt,
        bestLap,
        lastLap,
        lapCount,
        tuneId: s.tuneId || null,
        tuneName: s.tuneId && tunes[s.tuneId] ? tunes[s.tuneId].name : null,
        duration: s.summary?.duration || 0
      });
      if (bestLap > 0 && bestLap < g.bestLap) g.bestLap = bestLap;
      g.totalLaps += lapCount;
      g.sessionCount += 1;

      // 记录调校使用
      if (s.tuneId) {
        const t = g.tunesUsed.get(s.tuneId) || { tuneId: s.tuneId, name: tunes[s.tuneId]?.name || '未知调校', count: 0, bestLap: Infinity };
        t.count += 1;
        if (bestLap > 0 && bestLap < t.bestLap) t.bestLap = bestLap;
        g.tunesUsed.set(s.tuneId, t);
      }
    } catch (e) { /* ignore corrupt file */ }
  });

  // 计算平均值并排序
  const result = [];
  groups.forEach(g => {
    g.sessions.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
    const validBests = g.sessions.filter(s => s.bestLap > 0).map(s => s.bestLap);
    g.avgBestLap = validBests.length > 0 ? validBests.reduce((a, b) => a + b, 0) / validBests.length : 0;

    // 进步计算：最早的最佳圈速 vs 最近的最佳圈速
    const firstBest = g.sessions.find(s => s.bestLap > 0);
    const lastBest = [...g.sessions].reverse().find(s => s.bestLap > 0);
    let improvement = 0;
    if (firstBest && lastBest && firstBest !== lastBest) {
      improvement = firstBest.bestLap - lastBest.bestLap;
    }

    result.push({
      trackId: g.trackId,
      trackName: g.trackName,
      vehicleOrdinal: g.vehicleOrdinal,
      vehicleClass: g.vehicleClass,
      vehiclePI: g.vehiclePI,
      bestLap: g.bestLap === Infinity ? 0 : g.bestLap,
      avgBestLap: g.avgBestLap,
      totalLaps: g.totalLaps,
      sessionCount: g.sessionCount,
      improvement,
      tunesUsed: Array.from(g.tunesUsed.values()).sort((a, b) => a.bestLap - b.bestLap),
      lastSessionAt: g.sessions.length > 0 ? g.sessions[g.sessions.length - 1].savedAt : null
    });
  });

  // 按最佳圈速排序（圈速越小越好）
  result.sort((a, b) => (a.bestLap || Infinity) - (b.bestLap || Infinity));

  // 写入缓存
  leaderboardCache = result;
  leaderboardCacheTime = Date.now();

  return result;
}

// 获取圈速排行榜
app.get('/api/leaderboard', (req, res) => {
  try {
    const data = buildLeaderboard();
    // 支持按trackId过滤
    const { trackId } = req.query;
    if (trackId) {
      return res.json(data.filter(d => d.trackId === trackId));
    }
    res.json(data);
  } catch (e) {
    console.error('[Leaderboard] Error:', e);
    res.status(500).json({ error: 'Failed to build leaderboard' });
  }
});

// 获取特定组合的历史趋势
app.get('/api/leaderboard/trend', (req, res) => {
  try {
    const { trackId, vehicleOrdinal } = req.query;
    if (!trackId || !vehicleOrdinal) {
      return res.status(400).json({ error: 'Missing trackId or vehicleOrdinal' });
    }

    const lb = buildLeaderboard();
    const entry = lb.find(d => d.trackId === trackId && String(d.vehicleOrdinal) === String(vehicleOrdinal));
    if (!entry) return res.json({ sessions: [], bestLap: 0, avgBestLap: 0 });

    const sessionsDir = DATA_DIR + '/sessions';
    const sessions = [];
    const allSectorData = []; // 收集所有session的sector数据用于optimal lap计算

    // 重新加载完整session列表以获取每session的详细圈速和sector数据
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
    files.forEach(f => {
      try {
        const sessionId = f.replace('_summary.json', '');
        const s = loadSession(sessionId);
        if (!s) return;
        if (s.trackId !== trackId) return;
        if (String(s.vehicle?.ordinal) !== String(vehicleOrdinal)) return;
        const sectorResult = analyzeSectors(s.positions || [], 3, s.laps?.best || 0);
        const totalSectorTime = sectorResult ? sectorResult.sectors.reduce((sum, se) => sum + se.sectorTime, 0) : 0;
        // 过滤数据质量差的session（sector times总和异常短）
        const isValid = sectorResult && totalSectorTime > 20;
        sessions.push({
          sessionId: s.id,
          savedAt: s.savedAt,
          bestLap: s.laps?.best || 0,
          lastLap: s.laps?.last || 0,
          lapCount: s.laps?.count || 0,
          tuneId: s.tuneId || null,
          tuneName: s.tuneId && tunes[s.tuneId] ? tunes[s.tuneId].name : null,
          sectors: isValid ? sectorResult.sectors.map(se => se.sectorTime) : []
        });
        if (isValid) {
          allSectorData.push(sectorResult.sectors);
        }
      } catch (e) { }
    });
    sessions.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));

    // 计算Optimal Lap：每个sector取所有session中的最短时间（使用中位数过滤异常值）
    let optimalLap = 0;
    const optimalSectors = [];
    if (allSectorData.length > 0) {
      const numSectors = allSectorData[0].length;
      for (let i = 0; i < numSectors; i++) {
        // 收集所有该sector的时间
        const times = [];
        allSectorData.forEach((sessionSectors, idx) => {
          const st = sessionSectors[i]?.sectorTime;
          if (st && st > 0) times.push({ st, sessionId: sessions[idx]?.sessionId });
        });
        if (times.length === 0) continue;
        // 中位数过滤：只保留大于中位数50%的值（过滤异常低的值）
        times.sort((a, b) => a.st - b.st);
        const median = times.length % 2 === 1
          ? times[Math.floor(times.length / 2)].st
          : (times[times.length / 2 - 1].st + times[times.length / 2].st) / 2;
        const minThreshold = median * 0.5;
        const valid = times.filter(t => t.st >= minThreshold);
        if (valid.length === 0) continue;
        // 取有效值中的最小值
        const best = valid.reduce((min, t) => t.st < min.st ? t : min, valid[0]);
        optimalSectors.push({
          sectorIndex: i + 1,
          optimalTime: best.st,
          optimalSessionId: best.sessionId
        });
        optimalLap += best.st;
      }
    }

    res.json({
      trackId,
      trackName: entry.trackName,
      vehicleOrdinal: entry.vehicleOrdinal,
      bestLap: entry.bestLap,
      avgBestLap: entry.avgBestLap,
      totalLaps: entry.totalLaps,
      sessionCount: entry.sessionCount,
      improvement: entry.improvement,
      optimalLap: optimalLap > 0 ? optimalLap : 0,
      optimalSectors,
      sessions,
      tunesUsed: entry.tunesUsed
    });
  } catch (e) {
    console.error('[Leaderboard Trend] Error:', e);
    res.status(500).json({ error: 'Failed to load trend' });
  }
});

// ===== 数据备份与恢复 =====

import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function readDirRecursive(dir) {
  const result = {};
  if (!fs.existsSync(dir)) return result;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      result[item] = readDirRecursive(fullPath);
    } else if (item.endsWith('.json')) {
      try {
        result[item] = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (e) {
        result[item] = null;
      }
    } else if (item.endsWith('.gz')) {
      try {
        const buffer = fs.readFileSync(fullPath);
        result[item] = buffer.toString('base64');
      } catch (e) {
        result[item] = null;
      }
    }
  }
  return result;
}

function writeDirRecursive(dir, data) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const [key, value] of Object.entries(data)) {
    const fullPath = path.join(dir, key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (key.endsWith('.json')) {
        fs.writeFileSync(fullPath, JSON.stringify(value, null, 2), 'utf8');
      } else {
        writeDirRecursive(fullPath, value);
      }
    } else if (key.endsWith('.gz') && typeof value === 'string') {
      fs.writeFileSync(fullPath, Buffer.from(value, 'base64'));
    }
  }
}

app.get('/api/backup/export', async (req, res) => {
  try {
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      data: readDirRecursive(DATA_DIR)
    };
    const jsonStr = JSON.stringify(backup);
    const compressed = await gzipAsync(Buffer.from(jsonStr));
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="fh5_telemetry_backup_${Date.now()}.json.gz"`);
    res.send(compressed);
  } catch (e) {
    console.error('[Backup Export] Error:', e);
    res.status(500).json({ error: 'Failed to export backup' });
  }
});

app.post('/api/backup/restore', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
  try {
    let data;
    try {
      const decompressed = await gunzipAsync(req.body);
      data = JSON.parse(decompressed.toString());
    } catch (e) {
      // 尝试直接解析JSON（未压缩）
      data = JSON.parse(req.body.toString());
    }
    if (!data || !data.data) {
      return res.status(400).json({ error: 'Invalid backup file' });
    }
    // 备份当前数据
    const backupDir = DATA_DIR + '_backup_' + Date.now();
    fs.mkdirSync(backupDir, { recursive: true });
    writeDirRecursive(backupDir, readDirRecursive(DATA_DIR));
    // 写入恢复数据
    writeDirRecursive(DATA_DIR, data.data);
    // 重新加载内存数据
    tracks = loadTracksDatabase();
    vehicles = loadJSON(DATA_DIR + '/vehicles.json');
    tunes = loadJSON(DATA_DIR + '/tunes.json');
    res.json({ success: true, message: '数据恢复成功，原数据已备份至 ' + path.basename(backupDir) });
  } catch (e) {
    console.error('[Backup Restore] Error:', e);
    res.status(500).json({ error: 'Failed to restore backup: ' + e.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'Forza Horizon 5 遥测系统 API',
    version: '2.0',
    endpoints: {
      status: '/api/status',
      current: '/api/current',
      tracks: '/api/tracks',
      vehicles: '/api/vehicles',
      sessions: '/api/sessions',
      tunes: '/api/tunes',
      analysis: '/api/analysis/:sessionId',
      leaderboard: '/api/leaderboard',
      'leaderboard-trend': '/api/leaderboard/trend?trackId=&vehicleOrdinal=',
      export: '/api/export/csv/:sessionId',
      backup: '/api/backup/export',
      restore: 'POST /api/backup/restore'
    },
    reactClient: 'http://localhost:9188'
  });
});

udpServer.bind(UDP_PORT);
httpServer.listen(HTTP_PORT, () => {
  const ips = getLocalIPs();
  console.log('Forza Horizon 5 遥测系统 API Server');
  console.log('API: http://localhost:' + HTTP_PORT);
  console.log('React Client: http://localhost:9188');
  console.log('UDP Port: ' + UDP_PORT);
  console.log('IP: ' + ips.map(i => i.address).join(', '));
});

process.on('uncaughtException', (err) => {
  console.error('[Process] 未捕获异常:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process] 未处理Promise拒绝:', reason);
});

process.on('SIGINT', () => {
  console.log('\n[Server] 正在关闭...');
  udpServer.close();
  httpServer.close(() => {
    console.log('[Server] 已关闭');
    process.exit(0);
  });
});
