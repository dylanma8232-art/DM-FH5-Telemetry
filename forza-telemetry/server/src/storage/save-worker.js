import { parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { simplifyRDP } from '../utils/rdp.js';
import { buildTrackFromTrajectories, buildRouteBook, generateSectors } from '../track-builder.js';
import { sqliteDb } from './sqlite-db.js';

const brotliCompress = promisify(zlib.brotliCompress);

// 事件提取与骨架生成
function generateLowfiTelemetry(hifiData, hifiPositions) {
  if (!hifiData || hifiData.length === 0) {
    return { data: [], positions: hifiPositions || [] };
  }

  const lowfiData = [];
  const keepIndices = new Set();
  const len = hifiData.length;

  // 1. 每隔 12 帧 (约 200ms) 取一帧作为基础骨架
  for (let i = 0; i < len; i += 12) {
    keepIndices.add(i);
  }
  // 确保最后一帧被包含
  keepIndices.add(len - 1);

  // 2. 遍历并检测关键事件，并在事件帧前后各保留 10 帧 (高频切片)
  let lastGear = hifiData[0]?.controls?.gear;
  for (let i = 0; i < len; i++) {
    const frame = hifiData[i];
    if (!frame) continue;

    let isEvent = false;

    // A. 换挡检测
    const currentGear = frame.controls?.gear;
    if (currentGear !== undefined && currentGear !== lastGear) {
      isEvent = true;
      lastGear = currentGear;
    }

    // B. ABS / TCS 触发检测 (根据滑移率绝对值大于 0.15 判断)
    const tireSlip = frame.tireSlipRatio || {};
    if (
      Math.abs(tireSlip.frontLeft || 0) > 0.15 ||
      Math.abs(tireSlip.frontRight || 0) > 0.15 ||
      Math.abs(tireSlip.rearLeft || 0) > 0.15 ||
      Math.abs(tireSlip.rearRight || 0) > 0.15
    ) {
      isEvent = true;
    }

    // C. 刹车踩下检测 (控制量中 brake 从低变高或保持高负荷)
    const brake = frame.controls?.brake || 0;
    if (brake > 50) { // 刹车开度大于 50%
      isEvent = true;
    }

    // D. 极限 G 力检测 (横向或纵向加速度绝对值大于 1.2G，即米每二次方秒 > 11.7)
    const accel = frame.acceleration || {};
    if (Math.abs(accel.x || 0) > 11.7 || Math.abs(accel.z || 0) > 11.7) {
      isEvent = true;
    }

    if (isEvent) {
      // 保留当前帧前后各 10 帧
      const start = Math.max(0, i - 10);
      const end = Math.min(len - 1, i + 10);
      for (let j = start; j <= end; j++) {
        keepIndices.add(j);
      }
    }
  }

  // 3. 根据索引提取并排序
  const sortedIndices = Array.from(keepIndices).sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    lowfiData.push(hifiData[idx]);
  }

  // 4. positions 降采样 (5Hz 已经非常丝滑)
  const lowfiPositions = [];
  if (hifiPositions && hifiPositions.length > 0) {
    for (let i = 0; i < hifiPositions.length; i += 5) {
      lowfiPositions.push(hifiPositions[i]);
    }
    // 确保包含最后一个点
    if ((hifiPositions.length - 1) % 5 !== 0) {
      lowfiPositions.push(hifiPositions[hifiPositions.length - 1]);
    }
  }

  return { data: lowfiData, positions: lowfiPositions };
}

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

function trimTrajectories(trajectories, maxCount = 5) {
  if (!trajectories || trajectories.length <= maxCount) return trajectories;
  return trajectories.slice(-maxCount);
}

// 辅助方法：读取 Brotli 赛道详情
function readTrackDetail(DATA_DIR, trackId) {
  const brPath = path.join(DATA_DIR, 'tracks', `${trackId}.json.br`);
  if (existsSync(brPath)) {
    try {
      const buffer = readFileSync(brPath);
      const decompressed = zlib.brotliDecompressSync(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (e) {
      console.error(`[Worker] 读取/解压赛道 ${trackId} 失败:`, e.message);
    }
  }
  return null;
}

// 辅助方法：异步压缩写文件
async function writeBrotliAsync(filepath, data, quality = 4) {
  try {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    const compressed = await brotliCompress(Buffer.from(jsonStr), {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: quality
      }
    });
    const tmpPath = `${filepath}.tmp`;
    await fs.writeFile(tmpPath, compressed);
    await fs.rename(tmpPath, filepath);
    return true;
  } catch (err) {
    console.error(`[Worker] 压缩写入 ${filepath} 失败:`, err.message);
    return false;
  }
}

async function main() {
  const {
    tempFilePath,
    positions,
    sessionDataMeta,
    DATA_DIR,
    tracks,
    trackMode
  } = workerData;

  const sessionId = sessionDataMeta.id;
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  const tracksDir = path.join(DATA_DIR, 'tracks');

  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.mkdir(tracksDir, { recursive: true });

  console.log(`[Worker] 开始异步处理会话: ${sessionId}`);

  // 1. 读取并解析临时 JSONL 遥测文件
  let hifiData = [];
  if (existsSync(tempFilePath)) {
    const content = await fs.readFile(tempFilePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          hifiData.push(JSON.parse(line));
        } catch {}
      }
    }
  }
  console.log(`[Worker] 从临时文件加载了 ${hifiData.length} 条遥测数据`);

  // 2. 生成 Lowfi 遥测详情
  const { data: lowfiData, positions: lowfiPositions } = generateLowfiTelemetry(hifiData, positions);

  // 3. 确定最终 trackId 并处理赛道整合与重构逻辑
  let finalTrackId = sessionDataMeta.trackId;
  let resultTracksUpdate = null;

  if (trackMode && trackMode.trackId) {
    const trackId = trackMode.trackId;
    const trackFilePath = path.join(DATA_DIR, 'tracks', `${trackId}.json.br`);
    // 优先读文件系统，不依赖 workerData 里可能已过时的 tracks 快照
    let trackDetail = null;
    if (existsSync(trackFilePath)) {
      trackDetail = readTrackDetail(DATA_DIR, trackId);
    }
    if (!trackDetail && tracks[trackId]) {
      trackDetail = { ...tracks[trackId] }; // 降级回退
    }

    if (trackDetail) {
      finalTrackId = trackId;

      // 精细简化新轨迹
      const simplifiedNewTraj = simplifyRDP(positions, 0.25);
      const existingTrajectories = trackDetail.trajectories || [trackDetail.points || []];
      existingTrajectories.push(simplifiedNewTraj);

      // 对历史轨迹进行简化，最多保留 5 条
      for (let i = 0; i < existingTrajectories.length - 1; i++) {
        existingTrajectories[i] = simplifyRDP(existingTrajectories[i], 0.25);
      }
      const trimmed = trimTrajectories(existingTrajectories, 5);

      // 比赛遥测只生成候选几何，不能在一次完赛后悄悄改写正在使用的地图和路书。
      const trackData = buildTrackFromTrajectories(trimmed, {
        oldTurns: trackDetail.turns || [],
        isPaceNoteLocked: trackDetail.isPaceNoteLocked || false,
        deletedTurns: trackDetail.deletedTurns || []
      });

      trackDetail.trajectories = trimmed;
      trackDetail.trajectoryCount = trimmed.length;
      trackDetail.updatedAt = new Date().toISOString();

      if (trackData) {
        trackDetail.geometryCandidate = {
          ...trackData.geometry,
          centerline: trackData.centerline,
          turns: trackData.turns,
          routeBook: trackData.routeBook,
          sectors: generateSectors(trackData.centerline, trackData.turns),
          length: trackData.length,
          pointCount: trackData.centerline.length,
          isLoop: trackData.isLoop || false,
          generatedAt: trackDetail.updatedAt
        };
        if (!trackDetail.referenceGeometry && trackDetail.centerline?.length) {
          trackDetail.referenceGeometry = {
            schemaVersion: 2,
            algorithm: 'legacy-frozen',
            revision: 1,
            activatedAt: trackDetail.updatedAt,
            sourceTrajectoryCount: Math.max(1, trimmed.length)
          };
        }
      }

      // 写入赛道详细几何包
      const brTrackPath = path.join(tracksDir, `${trackId}.json.br`);
      await writeBrotliAsync(brTrackPath, trackDetail, 4);

      resultTracksUpdate = {
        id: trackId,
        name: trackDetail.name || sessionDataMeta.trackName,
        length: trackDetail.length || 0,
        pointCount: trackDetail.points ? trackDetail.points.length : 0,
        turnCount: trackDetail.turns ? trackDetail.turns.length : 0,
        trajectoryCount: trimmed.length,
        createdAt: trackDetail.createdAt || (tracks[trackId] && tracks[trackId].createdAt) || new Date().toISOString(),
        updatedAt: trackDetail.updatedAt
      };
    } else {
      // 文件和快照都找不到，降级为普通模式（异常情况）
      console.warn(`[Worker] trackMode 赛道 ${trackId} 文件不存在，降级为新建赛道`);
    }
  }

  if (!resultTracksUpdate) {
    // 普通模式：生成新赛道
    const newTrackId = 'track_' + Date.now();
    finalTrackId = newTrackId;
    const simplifiedTraj = simplifyRDP(positions, 0.25);
    const trackLength = calculateTrackLength(simplifiedTraj);
    const trackData = buildTrackFromTrajectories([simplifiedTraj]);

    const trackDetail = {
      id: newTrackId,
      name: sessionDataMeta.trackName,
      points: simplifiedTraj,
      pointCount: simplifiedTraj.length,
      length: trackLength,
      trajectories: [simplifiedTraj],
      trajectoryCount: 1,
      centerline: trackData ? trackData.centerline : null,
      turns: trackData ? trackData.turns : null,
      isLoop: trackData ? (trackData.isLoop || false) : false,
      sectors: trackData ? generateSectors(trackData.centerline, trackData.turns) : [],
      referenceGeometry: trackData ? {
        ...trackData.geometry,
        status: 'active',
        revision: 1,
        activatedAt: new Date().toISOString()
      } : null,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 写入赛道详细几何包
    const brTrackPath = path.join(tracksDir, `${newTrackId}.json.br`);
    await writeBrotliAsync(brTrackPath, trackDetail, 4);

    resultTracksUpdate = {
      id: newTrackId,
      name: sessionDataMeta.trackName,
      length: trackLength,
      pointCount: simplifiedTraj.length,
      turnCount: trackDetail.turns ? trackDetail.turns.length : 0,
      trajectoryCount: 1,
      isLoop: trackDetail.isLoop || false,
      createdAt: trackDetail.createdAt,
      updatedAt: trackDetail.updatedAt
    };
  }


  // 4. 构建完整的 session 详情和摘要
  let finalDuration = sessionDataMeta.duration;
  if (!finalDuration && hifiData.length > 0) {
    const firstTs = hifiData[0].timestampMS || 0;
    const lastTs = hifiData[hifiData.length - 1].timestampMS || 0;
    finalDuration = lastTs - firstTs;
  }

  // 恢复丢失的圈速与最快圈计算逻辑
  const validBestLaps = hifiData.filter(d => d.bestLap !== undefined && d.bestLap > 0);
  const validLastLaps = hifiData.filter(d => d.lastLap !== undefined && d.lastLap > 0);
  const validRaceTimes = hifiData.filter(d => d.currentRaceTime !== undefined && d.currentRaceTime > 0);

  let bestLap = 0;
  if (validBestLaps.length > 0) {
    bestLap = validBestLaps[validBestLaps.length - 1].bestLap;
  } else if (validRaceTimes.length > 0) {
    bestLap = validRaceTimes[validRaceTimes.length - 1].currentRaceTime;
  }

  let lastLap = 0;
  if (validLastLaps.length > 0) {
    lastLap = validLastLaps[validLastLaps.length - 1].lastLap;
  } else if (validRaceTimes.length > 0) {
    lastLap = validRaceTimes[validRaceTimes.length - 1].currentRaceTime;
  }

  let maxLap = hifiData.length > 0 ? Math.max(...hifiData.map(d => d.lapNumber || d.lapNum || 0)) : 0;

  // 恢复丢失的车辆数据并根据静态车辆库补全名称
  let vehicleToSave = sessionDataMeta.vehicle || null;
  let carOrdinalToSave = vehicleToSave?.ordinal || 0;

  if ((!carOrdinalToSave || carOrdinalToSave === 0) && hifiData.length > 0) {
    for (const pt of hifiData) {
      if (pt.carOrdinal !== undefined && pt.carOrdinal > 0) {
        carOrdinalToSave = pt.carOrdinal;
        break;
      }
      if (pt.car && pt.car.ordinal !== undefined && pt.car.ordinal > 0) {
        carOrdinalToSave = pt.car.ordinal;
        break;
      }
    }
  }

  if (carOrdinalToSave > 0) {
    let carsDatabase = {};
    const carsDbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/cars-database.json');
    if (existsSync(carsDbPath)) {
      try { carsDatabase = JSON.parse(readFileSync(carsDbPath, 'utf8')); } catch {}
    }
    const vehiclesPath = path.join(DATA_DIR, 'vehicles.json');
    let vehiclesData = {};
    if (existsSync(vehiclesPath)) {
      try { vehiclesData = JSON.parse(readFileSync(vehiclesPath, 'utf8')); } catch {}
    }

    const vState = vehiclesData[String(carOrdinalToSave)] || {};
    const carName = vehicleToSave?.name || vState.name || carsDatabase[String(carOrdinalToSave)] || `车辆 #${carOrdinalToSave}`;
    const carClass = vehicleToSave?.class ?? vState.class ?? 0;
    const carPI = vehicleToSave?.performanceIndex ?? vState.pi ?? 0;
    const drivetrain = vehicleToSave?.drivetrain || vState.drivetrain || '';

    vehicleToSave = {
      ...(vehicleToSave || {}),
      ordinal: Number(carOrdinalToSave),
      name: carName,
      class: carClass,
      performanceIndex: carPI,
      drivetrain: drivetrain
    };
  }

  const summaryData = {
    ...sessionDataMeta,
    trackId: finalTrackId, // 确保 trackId 正确关联
    vehicle: vehicleToSave,
    summary: {
      dataCount: hifiData.length,
      positionCount: positions.length,
      duration: finalDuration
    },
    laps: {
      best: bestLap,
      last: lastLap,
      count: maxLap
    },
    hasDetail: hifiData.length > 0
  };

  const hifiPayload = {
    id: sessionId,
    data: hifiData,
    positions: positions
  };

  const lowfiPayload = {
    id: sessionId,
    data: lowfiData,
    positions: lowfiPositions
  };

  // 写入 Session 概要文件 (1KB)，时序数据细节通过 SQLite 事务写入以防崩档
  const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
  await fs.writeFile(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');

  try {
    const hifiJsonStr = JSON.stringify(hifiPayload);
    const lowfiJsonStr = JSON.stringify(lowfiPayload);
    
    // 执行后台线程中 Brotli 压缩以提速
    const hifiBr = zlib.brotliCompressSync(Buffer.from(hifiJsonStr));
    const lowfiBr = zlib.brotliCompressSync(Buffer.from(lowfiJsonStr));
    
    sqliteDb.saveSessionDetail(sessionId, hifiBr, lowfiBr);
    console.log(`[Worker] SQLite 写入时序细节成功: ${sessionId}`);
  } catch (dbErr) {
    console.error(`[Worker] SQLite 写入 ${sessionId} 细节失败:`, dbErr.message);
  }

  // 清除本地遗存的细节包
  const hifiPath = path.join(sessionsDir, `${sessionId}_detail_hifi.json.br`);
  const lowfiPath = path.join(sessionsDir, `${sessionId}_detail_lowfi.json.br`);
  const oldBrPath = path.join(sessionsDir, `${sessionId}_detail.json.br`);
  const oldGzPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);
  await fs.unlink(hifiPath).catch(() => {});
  await fs.unlink(lowfiPath).catch(() => {});
  await fs.unlink(oldBrPath).catch(() => {});
  await fs.unlink(oldGzPath).catch(() => {});

  // 发送处理成功通知
  parentPort.postMessage({
    status: 'success',
    sessionId,
    tracksUpdate: resultTracksUpdate,
    sessionSummary: summaryData
  });
}

main().catch(err => {
  console.error('[Worker Exception] 后台线程运行异常:', err);
  parentPort.postMessage({
    status: 'error',
    error: err.message
  });
});
