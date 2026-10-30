import { asyncHandler } from "../utils/asyncHandler.js";import { calculateDrivingLineAnalysis, calculateDrivingStyle, calculateDetailedStats, calculateDrivingScore, calculateGearingAnalysis, calculateSuspensionAnalysis, calculateDifferentialAnalysis, generateTuneDiagnosis, getBestLapNum, findClosestPoint } from '../services/physics-analyzer.js';
import { stateManager } from '../services/state-manager.js';
import { loadSession, readTrackDetail } from '../storage/session-db.js';
import express from 'express';
import { generateTelemetryTuningRecommendations } from '../services/physics/telemetry-tuning-recommendations.js';
import { lttbDownsample } from '../utils/lttb.js';
import { parseChannelsParam, projectChannels } from '../services/channel-projection.js';
import { formatTuneParamsForPrompt, pickTuneForPrompt } from '../services/tune-prompt.js';
import { readSummaries, listSummaryFileNames } from '../storage/session-store.js';
import { readCarsDatabase } from '../storage/reference-store.js';
import { readDiagnosisCache, writeDiagnosisCache } from '../storage/diagnosis-store.js';

const router = express.Router();

// 内存分析结果高效缓存机制
const analysisCache = new Map();
const MAX_CACHE_SIZE = 100;

function getFromCache(key) {
  return analysisCache.get(key) || null;
}

/**
 * Q4：删除会话时必须调用，清掉该会话在 analysisCache 里的全部派生结果
 * （overview_ / ai_stats_ 等前缀都包含 sessionId）。否则删掉记录后仍能读到旧分析。
 */
export function invalidateAnalysisCache(sessionId) {
  if (!sessionId) return 0;
  const id = String(sessionId);
  let removed = 0;
  for (const key of [...analysisCache.keys()]) {
    if (key.includes(id)) {
      analysisCache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

function setToCache(key, data) {
  if (analysisCache.size > MAX_CACHE_SIZE) {
    const firstKey = analysisCache.keys().next().value;
    analysisCache.delete(firstKey);
  }
  analysisCache.set(key, data);
}

// 赛后分析API
router.get('/:sessionId', asyncHandler(async (req, res) => {
  const cacheKey = `overview_${req.params.sessionId}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const session = loadSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let vehicle = session.vehicle || null;
  let ordinalKey = vehicle?.ordinal || session.carOrdinal;

  if ((!ordinalKey || ordinalKey <= 0) && session.savedAt && stateManager.vehicles) {
    const sTime = new Date(session.savedAt).getTime();
    let closestOrd = null;
    let minDiff = Infinity;
    Object.entries(stateManager.vehicles).forEach(([ord, vInfo]) => {
      if (vInfo.lastUsed) {
        const diff = Math.abs(new Date(vInfo.lastUsed).getTime() - sTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestOrd = ord;
        }
      }
    });
    if (closestOrd) {
      ordinalKey = Number(closestOrd);
    }
  }

  if (ordinalKey && ordinalKey > 0) {
    const carsDatabase = readCarsDatabase();
    const vehicleFromState = stateManager.vehicles ? stateManager.vehicles[String(ordinalKey)] : null;
    const carName = vehicle?.name || vehicleFromState?.name || carsDatabase[String(ordinalKey)] || `车辆 #${ordinalKey}`;
    const carClass = vehicle?.class ?? vehicleFromState?.class ?? 0;
    const carPI = vehicle?.performanceIndex ?? vehicleFromState?.pi ?? 0;
    const drivetrain = vehicle?.drivetrain || vehicleFromState?.drivetrain || '';

    vehicle = {
      ...(vehicle || {}),
      ordinal: Number(ordinalKey),
      name: carName,
      class: carClass,
      performanceIndex: carPI,
      drivetrain: drivetrain
    };
  }

  const analysis = {
    sessionId: session.id,
    trackName: session.trackName || '未知赛道',
    trackId: session.trackId || null,
    vehicle: vehicle,
    date: session.savedAt,

    成绩: {
      最快圈速: session.laps?.best || 0,
      上一圈速: session.laps?.last || 0,
      圈数: session.laps?.count || 0,
      总时长: session.summary?.duration || 0
    },

    走线分析: calculateDrivingLineAnalysis(session.positions || []),
    驾驶风格: calculateDrivingStyle(session.data || []),
    详细统计: calculateDetailedStats(session.data || []),
    驾驶评分: calculateDrivingScore(session),
    动力齿比: calculateGearingAnalysis(session.data || []),
    底盘悬挂: calculateSuspensionAnalysis(session.data || [], session.positions || []),
    差速抓地力: calculateDifferentialAnalysis(session.data || [])
  };

  setToCache(cacheKey, analysis);
  res.json(analysis);
}));


// 合并通道遥测数据接口
router.get('/:sessionId/telemetry-channels', asyncHandler(async (req, res) => {

  const session = loadSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const rawData = session.data || [];
  if (rawData.length === 0) {
    return res.json({ lapNum: 0, channels: [] });
  }

  let targetLapNum = parseInt(req.query.lapNum);
  if (isNaN(targetLapNum) || targetLapNum < 0) {
    targetLapNum = getBestLapNum(rawData);
  }

  const lapFrames = rawData.filter((d) => (d.lapNumber || d.lapNum || 0) === targetLapNum);
  if (lapFrames.length === 0) {
    return res.json({ lapNum: targetLapNum, channels: [] });
  }

  const startDist = req.query.startDist !== undefined && req.query.startDist !== '' ? parseFloat(req.query.startDist) : null;
  const endDist = req.query.endDist !== undefined && req.query.endDist !== '' ? parseFloat(req.query.endDist) : null;
  const targetMaxPoints = parseInt(req.query.maxPoints) || 450;

  // 1. 计算累计行驶距离与全量通道帧
  let cumulativeDistance = 0;
  const allChannels = [];
  // 超长遥测轻量化预抽样步进：若帧数超万，基础构建步进适当提升
  // ?downsampleStep=N 由客户端在每次拉通道时传入，此前完全未被消费；取与基础步进的较大者生效
  const requestedStep = parseInt(req.query.downsampleStep, 10);
  const downsampleStep = Number.isFinite(requestedStep) && requestedStep > 1 ? requestedStep : 1;
  const baseStep = Math.max(downsampleStep, lapFrames.length > 20000 ? 2 : 1);

  for (let i = 0; i < lapFrames.length; i++) {
    const d = lapFrames[i];
    const px = d.position?.x || d.positionX || 0;
    const pz = d.position?.z || d.positionZ || 0;
    const py = d.position?.y || d.positionY || 0;

    if (i > 0) {
      const prev = lapFrames[i - 1];
      const pprevX = prev.position?.x || prev.positionX || 0;
      const pprevZ = prev.position?.z || prev.positionZ || 0;
      const dist = Math.sqrt((px - pprevX) ** 2 + (pz - pprevZ) ** 2);
      if (dist < 100) {
        cumulativeDistance += dist;
      }
    }

    if (i % baseStep === 0 || i === lapFrames.length - 1) {
      allChannels.push({
        distance: Math.round(cumulativeDistance * 10) / 10,
        lapTime: d.currentLap || 0,
        speed: Math.round(d.speedKmh || (d.speed ? d.speed * 3.6 : 0)),
        rpm: Math.round(d.currentEngineRpm || d.rpm || 0),
        gear: d.controls?.gear ?? d.gear ?? 0,
        torque: d.torque || 0,
        throttle: Math.round((d.controls?.accel || d.accel || 0) / 2.55),
        brake: Math.round((d.controls?.brake || d.brake || 0) / 2.55),
        steer: d.controls?.steer || d.steer || 0,
        gLong: (d.acceleration?.z || d.accelerationZ || d.gForce?.long || 0) / 9.80665,
        gLat: (d.acceleration?.x || d.accelerationX || d.gForce?.lat || 0) / 9.80665,
        x: px,
        y: py,
        z: pz,
        tempFL: Math.round(d.tireTemp?.frontLeft || d.tireTempFrontLeft || 0),
        tempFR: Math.round(d.tireTemp?.frontRight || d.tireTempFrontRight || 0),
        tempRL: Math.round(d.tireTemp?.rearLeft || d.tireTempRearLeft || 0),
        tempRR: Math.round(d.tireTemp?.rearRight || d.tireTempRearRight || 0),
        slipFL: d.tireSlipRatio?.frontLeft || d.tireSlipRatioFrontLeft || 0,
        slipFR: d.tireSlipRatio?.frontRight || d.tireSlipRatioFrontRight || 0,
        slipRL: d.tireSlipRatio?.rearLeft || d.tireSlipRatioRearLeft || 0,
        slipRR: d.tireSlipRatio?.rearRight || d.tireSlipRatioRearRight || 0,
        angleFL: d.tireSlipAngle?.frontLeft || d.tireSlipAngleFrontLeft || 0,
        angleFR: d.tireSlipAngle?.frontRight || d.tireSlipAngleFrontRight || 0,
        angleRL: d.tireSlipAngle?.rearLeft || d.tireSlipAngleRearLeft || 0,
        angleRR: d.tireSlipAngle?.rearRight || d.tireSlipAngleRearRight || 0,
        wheelSpeedFL: d.wheelRotationSpeed?.frontLeft || d.wheelRotationSpeedFrontLeft || 0,
        wheelSpeedFR: d.wheelRotationSpeed?.frontRight || d.wheelRotationSpeedFrontRight || 0,
        wheelSpeedRL: d.wheelRotationSpeed?.rearLeft || d.wheelRotationSpeedRearLeft || 0,
        wheelSpeedRR: d.wheelRotationSpeed?.rearRight || d.wheelRotationSpeedRearRight || 0,
        angularVelY: d.angularVelocity?.y || d.angularVelocityY || 0,
        roll: d.roll || 0,
        pitch: d.pitch || 0,
        yaw: d.yaw || 0,
        power: d.power || 0,
        boost: d.boost || 0,
        fuel: d.fuel || 0,
        onRumble: d.onRumbleStrip?.frontLeft || false,
        clutch: Math.round((d.controls?.clutch || d.clutch || 0) / 2.55),
        handBrake: Math.round((d.controls?.handBrake || d.handBrake || 0) / 2.55),
        suspensionFL: d.suspensionTravelMeters?.frontLeft || d.suspensionTravelMetersFrontLeft || 0,
        suspensionFR: d.suspensionTravelMeters?.frontRight || d.suspensionTravelMetersFrontRight || 0,
        suspensionRL: d.suspensionTravelMeters?.rearLeft || d.suspensionTravelMetersRearLeft || 0,
        suspensionRR: d.suspensionTravelMeters?.rearRight || d.suspensionTravelMetersRearRight || 0,
        suspensionNormFL: d.suspension?.frontLeft || d.suspensionFrontLeft || 0,
        suspensionNormFR: d.suspension?.frontRight || d.suspensionFrontRight || 0,
        suspensionNormRL: d.suspension?.rearLeft || d.suspensionRearLeft || 0,
        suspensionNormRR: d.suspension?.rearRight || d.suspensionRearRight || 0,
        puddleDepth: Math.max(
          d.wheelInPuddleDepth?.frontLeft || d.wheelInPuddleDepthFrontLeft || 0,
          d.wheelInPuddleDepth?.frontRight || d.wheelInPuddleDepthFrontRight || 0,
          d.wheelInPuddleDepth?.rearLeft || d.wheelInPuddleDepthRearLeft || 0,
          d.wheelInPuddleDepth?.rearRight || d.wheelInPuddleDepthRearRight || 0
        ),
        rumble: Math.max(
          d.surfaceRumble?.frontLeft || d.surfaceRumbleFrontLeft || 0,
          d.surfaceRumble?.frontRight || d.surfaceRumbleFrontRight || 0,
          d.surfaceRumble?.rearLeft || d.surfaceRumbleRearLeft || 0,
          d.surfaceRumble?.rearRight || d.surfaceRumbleRearRight || 0
        )
      });
    }
  }

  // 2. 起终点里程区间过滤
  let filteredChannels = allChannels;
  if (startDist !== null && !isNaN(startDist) && endDist !== null && !isNaN(endDist)) {
    filteredChannels = allChannels.filter(c => c.distance >= startDist && c.distance <= endDist);
  }

  // 3. LTTB 物理极值降采样（将数据点精准收敛在 targetMaxPoints 以内，且完整保留物理极值与拐点）
  const downsampledChannels = lttbDownsample(
    filteredChannels,
    targetMaxPoints,
    'distance',
    ['speed', 'brake', 'throttle', 'gLat', 'tempFL', 'slipFL']
  );

  // 4. 可选通道投影：?channels=speed,throttle,brake（distance 永远保留，作为横轴）
  //    仅裁剪已算好的字段，不参与任何采样/计算，未传该参数时响应与原来逐字节一致。
  const requestedChannels = parseChannelsParam(req.query.channels);
  const projection = projectChannels(downsampledChannels, requestedChannels);
  if (projection.unknown.length > 0) {
    return res.status(400).json({ error: `未知通道：${projection.unknown.join(', ')}` });
  }
  const responseChannels = projection.frames;

  res.json({
    lapNum: targetLapNum,
    totalDistance: Math.round(cumulativeDistance * 10) / 10,
    totalPoints: allChannels.length,
    channels: responseChannels
  });
}));

// 高级多圈及理论最佳分析
router.get('/:sessionId/advanced', asyncHandler(async (req, res) => {

  const session = loadSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const rawData = session.data || [];
  if (rawData.length === 0) {
    return res.json({
      usOsIndex: [],
      differential: [],
      trailBraking: { ratio: 0, count: 0, total: 0 },
      theoreticalBest: { time: 0, sectors: [] },
      consistency: { lapTimeStd: 0, sectorStd: [] },
      lossTime: [],
      powerCurve: []
    });
  }

  const numSectors = parseInt(req.query.sectors) || 3;
  const startDist = req.query.startDist !== undefined && req.query.startDist !== '' ? parseFloat(req.query.startDist) : null;
  const endDist = req.query.endDist !== undefined && req.query.endDist !== '' ? parseFloat(req.query.endDist) : null;
  const targetMaxPoints = parseInt(req.query.maxPoints) || 450;

  let cumulativeDistance = 0;
  const allUsOs = [];
  const allDiff = [];
  let trailBrakingCount = 0;
  let totalFrames = 0;
  const baseStep = rawData.length > 20000 ? 2 : 1;

  for (let i = 0; i < rawData.length; i++) {
    const d = rawData[i];
    const px = d.position?.x || d.positionX || 0;
    const pz = d.position?.z || d.positionZ || 0;

    if (i > 0) {
      const prev = rawData[i - 1];
      const pprevX = prev.position?.x || prev.positionX || 0;
      const pprevZ = prev.position?.z || prev.positionZ || 0;
      const dist = Math.sqrt((px - pprevX) ** 2 + (pz - pprevZ) ** 2);
      if (dist < 100) {
        cumulativeDistance += dist;
      }
    }

    const speedMs = (d.speedKmh || (d.speed ? d.speed * 3.6 : 0)) / 3.6;
    const lateralG = (d.acceleration?.x || d.accelerationX || d.gForce?.lat || 0) / 9.80665;
    const actualYawRate = d.angularVelocity?.y || d.angularVelocityY || 0;
    const expectedYawRate = speedMs > 0.5 ? lateralG / speedMs : 0;
    const denom = Math.max(Math.abs(expectedYawRate), 0.01);
    const usOsValue = (actualYawRate - expectedYawRate) / denom;

    const currentDist = Math.round(cumulativeDistance * 10) / 10;

    if (i % baseStep === 0 || i === rawData.length - 1) {
      allUsOs.push({
        distance: currentDist,
        value: Math.round(usOsValue * 1000) / 1000
      });
    }

    const wFL = d.wheelRotationSpeed?.frontLeft || d.wheelRotationSpeedFrontLeft || 0;
    const wFR = d.wheelRotationSpeed?.frontRight || d.wheelRotationSpeedFrontRight || 0;
    const wRL = d.wheelRotationSpeed?.rearLeft || d.wheelRotationSpeedRearLeft || 0;
    const wRR = d.wheelRotationSpeed?.rearRight || d.wheelRotationSpeedRearRight || 0;

    if (i % baseStep === 0 || i === rawData.length - 1) {
      allDiff.push({
        distance: currentDist,
        frontDiff: Math.round(Math.abs(wFL - wFR) * 100) / 100,
        rearDiff: Math.round(Math.abs(wRL - wRR) * 100) / 100
      });
    }

    const brake = d.controls?.brake || d.brake || 0;
    const steer = d.controls?.steer || d.steer || 0;
    if (brake > 10 && steer !== 0) {
      trailBrakingCount++;
    }
    totalFrames++;
  }

  // 起终点里程过滤与 LTTB 物理极值降采样
  let filteredUsOs = allUsOs;
  let filteredDiff = allDiff;
  if (startDist !== null && !isNaN(startDist) && endDist !== null && !isNaN(endDist)) {
    filteredUsOs = allUsOs.filter(c => c.distance >= startDist && c.distance <= endDist);
    filteredDiff = allDiff.filter(c => c.distance >= startDist && c.distance <= endDist);
  }

  const usOsIndex = lttbDownsample(filteredUsOs, targetMaxPoints, 'distance', 'value');
  const differential = lttbDownsample(filteredDiff, targetMaxPoints, 'distance', ['frontDiff', 'rearDiff']);

  const lapsMap = new Map();
  for (const d of rawData) {
    const ln = d.lapNumber || d.lapNum || 0;
    if (!lapsMap.has(ln)) lapsMap.set(ln, []);
    lapsMap.get(ln).push(d);
  }

  const maxLapNum = Math.max(...lapsMap.keys());
  const isSingleLap = maxLapNum <= 1;

  const lapInfos = [];
  for (const [ln, frames] of lapsMap) {
    if (!isSingleLap && ln === 0) continue;
    if (frames.length < 100) continue;
    const times = frames.map((f) => f.lapTime || f.currentLap || 0).filter((t) => t > 0);
    if (times.length < 2) continue;
    const duration = Math.max(...times) - Math.min(...times);
    if (duration < 10) continue;
    lapInfos.push({ ln, frames, duration, totalTime: Math.max(...times) });
  }

  const allSectorTimes = [];
  for (const lap of lapInfos) {
    const frames = lap.frames;
    const sectorLen = Math.floor(frames.length / numSectors);
    const sectorTimes = [];
    for (let s = 0; s < numSectors; s++) {
      const startIdx = s * sectorLen;
      const endIdx = s === numSectors - 1 ? frames.length - 1 : (s + 1) * sectorLen;
      const startTime = frames[startIdx]?.lapTime || frames[startIdx]?.currentLap || 0;
      const endTime = frames[endIdx]?.lapTime || frames[endIdx]?.currentLap || 0;
      sectorTimes.push(Math.max(0, endTime - startTime));
    }
    allSectorTimes.push({ ln: lap.ln, totalTime: lap.totalTime, sectorTimes });
  }

  const bestSectors = [];
  for (let s = 0; s < numSectors; s++) {
    let best = Infinity;
    for (const lap of allSectorTimes) {
      if (lap.sectorTimes[s] > 0 && lap.sectorTimes[s] < best) {
        best = lap.sectorTimes[s];
      }
    }
    bestSectors.push(best === Infinity ? 0 : best);
  }
  const theoreticalBestTime = bestSectors.reduce((sum, t) => sum + t, 0);

  let lapTimeStd = 0;
  if (allSectorTimes.length >= 2) {
    const lapTimesArr = allSectorTimes.map((l) => l.totalTime);
    const mean = lapTimesArr.reduce((s, t) => s + t, 0) / lapTimesArr.length;
    lapTimeStd = Math.round(Math.sqrt(lapTimesArr.reduce((s, t) => s + (t - mean) ** 2, 0) / lapTimesArr.length) * 1000) / 1000;
  }

  const sectorStd = [];
  for (let s = 0; s < numSectors; s++) {
    const vals = allSectorTimes.map((l) => l.sectorTimes[s]).filter((t) => t > 0);
    if (vals.length >= 2) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      sectorStd.push(Math.round(Math.sqrt(vals.reduce((sum, t) => sum + (t - mean) ** 2, 0) / vals.length) * 1000) / 1000);
    } else {
      sectorStd.push(0);
    }
  }

  let lossTime = [];
  const lapSectorDetails = [];
  if (allSectorTimes.length > 0) {
    lossTime = bestSectors.map((best, s) => {
      let totalLoss = 0;
      for (const lap of allSectorTimes) {
        totalLoss += lap.sectorTimes[s] - best;
      }
      const avgLoss = totalLoss / allSectorTimes.length;
      return {
        sector: s + 1,
        lossTime: Math.round(avgLoss * 1000) / 1000
      };
    });
    for (const lap of allSectorTimes) {
      lapSectorDetails.push({
        lap: lap.ln,
        totalTime: lap.totalTime,
        sectors: lap.sectorTimes.map((t, s) => ({
          sector: s + 1,
          time: Math.round(t * 1000) / 1000,
          loss: Math.round((t - bestSectors[s]) * 1000) / 1000
        }))
      });
    }
  }

  const rpmBuckets = new Map();
  for (const d of rawData) {
    const rpm = Math.round(d.currentEngineRpm || d.rpm || 0);
    const power = d.powerWatts || d.powerHP ? d.powerHP * 745.7 : d.power || 0;
    const torque = d.torque || 0;
    if (rpm <= 0) continue;
    const bucket = Math.round(rpm / 500) * 500;
    if (!rpmBuckets.has(bucket)) rpmBuckets.set(bucket, { powerSum: 0, torqueSum: 0, count: 0 });
    const entry = rpmBuckets.get(bucket);
    entry.powerSum += power;
    entry.torqueSum += torque;
    entry.count++;
  }

  const powerCurve = Array.from(rpmBuckets.entries()).
  sort(([a], [b]) => a - b).
  map(([rpm, data]) => ({
    rpm,
    avgPower: Math.round(data.powerSum / data.count),
    avgTorque: Math.round(data.torqueSum / data.count * 10) / 10
  }));

  const tireStats = calculateTireAnalysisStats(rawData);

  res.json({
    lapCount: lapInfos.length,
    numSectors,
    usOsIndex,
    differential,
    trailBraking: {
      ratio: totalFrames > 0 ? Math.round(trailBrakingCount / totalFrames * 10000) / 10000 : 0,
      count: trailBrakingCount,
      total: totalFrames
    },
    theoreticalBest: {
      time: Math.round(theoreticalBestTime * 1000) / 1000,
      sectors: bestSectors.map((t, i) => ({ sector: i + 1, bestTime: Math.round(t * 1000) / 1000 }))
    },
    consistency: { lapTimeStd, sectorStd },
    lossTime,
    lapSectorDetails,
    powerCurve,
    tempStats: {
      avgFL: tireStats.avgTempFL,
      avgFR: tireStats.avgTempFR,
      avgRL: tireStats.avgTempRL,
      avgRR: tireStats.avgTempRR,
      maxFL: tireStats.maxTempFL,
      maxFR: tireStats.maxTempFR,
      maxRL: tireStats.maxTempRL,
      maxRR: tireStats.maxTempRR
    }
  });




}));

// 弯道速度分析与历史对比接口
router.get('/:sessionId/turns', asyncHandler(async (req, res) => {
  const cacheKey = `turns_${req.params.sessionId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return res.json(cached);

  const session = loadSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const trackId = session.trackId;
  if (!trackId || !stateManager.tracks[trackId]) {
    return res.json({ turns: [] });
  }

  const trackDetail = readTrackDetail(trackId);
  const trackTurns = trackDetail && Array.isArray(trackDetail.turns) ? trackDetail.turns : [];
  if (trackTurns.length === 0) {
    return res.json({ turns: [], noTrackCorners: true, sessionId: req.params.sessionId });
  }

  const rawData = session.data || [];
  const bestLapNum = getBestLapNum(rawData);
  let currentLapFrames = rawData.filter((d) => (d.lapNumber || d.lapNum || 0) === bestLapNum);
  if (currentLapFrames.length === 0) {
    currentLapFrames = rawData;
  }

  const historySummaries = [];

  for (const { data } of await readSummaries(await listSummaryFileNames())) {
    if (!data) continue;
    if (data.trackId === trackId && data.vehicle?.ordinal === session.vehicle?.ordinal) {
      historySummaries.push(data);
    }
  }

  historySummaries.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
  const recentHistories = historySummaries.slice(-5);

  const historyLapsData = recentHistories.map((hist) => {
    const hSession = loadSession(hist.id);
    if (!hSession) return null;
    const hRaw = hSession.data || [];
    const hBestNum = getBestLapNum(hRaw);
    return {
      id: hist.id,
      savedAt: hist.savedAt,
      bestLap: hist.laps?.best || 0,
      frames: hRaw.filter((d) => (d.lapNumber || d.lapNum || 0) === hBestNum)
    };
  }).filter((h) => h !== null);

  const analysisTurns = trackTurns.map((turn, tIdx) => {
    const entryPt = findClosestPoint(turn.startX, turn.startZ, currentLapFrames);
    const apexPt = findClosestPoint(turn.x, turn.z, currentLapFrames);
    const exitPt = findClosestPoint(turn.endX, turn.endZ, currentLapFrames);
    const brakePt = findClosestPoint(turn.brakePointX || turn.startX, turn.brakePointZ || turn.startZ, currentLapFrames);

    const G = 9.81;
    const getSpd = (pt) => pt ? Math.round(pt.speedKmh || (pt.speedMs ?? pt.speed ?? 0) * 3.6) : 0;
    const entrySpeed = getSpd(entryPt);
    const apexSpeed = getSpd(apexPt);
    const exitSpeed = getSpd(exitPt);
    const brakeSpeed = getSpd(brakePt);
    const gear = apexPt?.controls?.gear || apexPt?.gear || 0;
    const peakLatG = apexPt ? Math.round(Math.abs((apexPt.acceleration?.x ?? 0) / G) * 100) / 100 : 0;
    const longBrakeG = entryPt ? Math.round(Math.abs(Math.min(0, entryPt.acceleration?.z ?? 0) / G) * 100) / 100 : 0;

    const historySeries = historyLapsData.map((h) => {
      const hEntry = findClosestPoint(turn.startX, turn.startZ, h.frames);
      const hApex = findClosestPoint(turn.x, turn.z, h.frames);
      const hExit = findClosestPoint(turn.endX, turn.endZ, h.frames);

      return {
        sessionId: h.id,
        savedAt: h.savedAt,
        bestLap: h.bestLap,
        entrySpeed: hEntry ? Math.round(hEntry.speedKmh || (hEntry.speed ? hEntry.speed * 3.6 : 0)) : 0,
        apexSpeed: hApex ? Math.round(hApex.speedKmh || (hApex.speed ? hApex.speed * 3.6 : 0)) : 0,
        exitSpeed: hExit ? Math.round(hExit.speedKmh || (hExit.speed ? hExit.speed * 3.6 : 0)) : 0
      };
    });

    const rt = trackDetail.routeBook?.turns?.[tIdx];

    return {
      index: tIdx,
      name: `T${tIdx + 1}`,
      type: turn.type,
      turnCategory: turn.turnCategory || turn.type,
      direction: turn.direction,
      speedHint: turn.speedHint || '',
      radius: turn.radius || 9999,
      recommended: {
        entrySpeed: rt?.entrySpeed || 0,
        apexSpeed: rt?.apexSpeed || 0,
        exitSpeed: rt?.exitSpeed || 0
      },
      current: {
        entrySpeed,
        apexSpeed,
        exitSpeed,
        brakeSpeed,
        gear,
        peakLatG,
        longBrakeG,
        x: apexPt?.position?.x ?? turn.x ?? 0,
        z: apexPt?.position?.z ?? turn.z ?? 0
      },
      history: historySeries
    };
  });

  const resObj = { turns: analysisTurns };
  setToCache(cacheKey, resObj);
  res.json(resObj);




}));


// 调校诊断接口
router.get('/:sessionId/diagnosis', asyncHandler(async (req, res) => {
  const cacheKey = `diagnosis_${req.params.sessionId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return res.json(cached);

  const session = loadSession(req.params.sessionId, stateManager.tracks);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // 编辑页可明确指定当前正在编辑的方案，不能误用该比赛历史关联的其它调教。
  const tune = req.body?.tuneId ? stateManager.tunes[req.body.tuneId] : (session.tuneId ? stateManager.tunes[session.tuneId] : null);
  const diagnoses = generateTuneDiagnosis(session, tune);
  const resObj = { tuneId: session.tuneId, tuneName: tune?.name, diagnoses };
  setToCache(cacheKey, resObj);
  res.json(resObj);
}));

// 无需保存调校方案的遥测调教建议。返回相对当前游戏数值的增减量；
// 客户端若能找到本地方案，再将其换算为"当前值 → 目标值"。
router.get('/:sessionId/tuning-recommendations', asyncHandler(async (req, res) => {
  const cacheKey = `tuning_rec_${req.params.sessionId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return res.json(cached);

  const session = loadSession(req.params.sessionId, stateManager.tracks);
  if (!session) return res.status(404).json({ error: '未找到比赛记录。' });
  const result = generateTelemetryTuningRecommendations(session.data || []);
  setToCache(cacheKey, result);
  res.json(result);
}));


// 辅助函数：计算轮胎温度和滑移的物理状态特征
function calculateTireAnalysisStats(rawData) {
  let maxTempFL = 0, maxTempFR = 0, maxTempRL = 0, maxTempRR = 0;
  let sumTempFL = 0, sumTempFR = 0, sumTempRL = 0, sumTempRR = 0;
  let maxSlipFL = 0, maxSlipFR = 0, maxSlipRL = 0, maxSlipRR = 0;
  const count = rawData.length;

  rawData.forEach(d => {
    const tFL = d.tireTemp?.frontLeft || d.tireTempFrontLeft || 0;
    const tFR = d.tireTemp?.frontRight || d.tireTempFrontRight || 0;
    const tRL = d.tireTemp?.rearLeft || d.tireTempRearLeft || 0;
    const tRR = d.tireTemp?.rearRight || d.tireTempRearRight || 0;

    sumTempFL += tFL;
    sumTempFR += tFR;
    sumTempRL += tRL;
    sumTempRR += tRR;

    if (tFL > maxTempFL) maxTempFL = tFL;
    if (tFR > maxTempFR) maxTempFR = tFR;
    if (tRL > maxTempRL) maxTempRL = tRL;
    if (tRR > maxTempRR) maxTempRR = tRR;

    const sFL = Math.abs(d.tireSlipRatio?.frontLeft || d.tireSlipRatioFrontLeft || 0);
    const sFR = Math.abs(d.tireSlipRatio?.frontRight || d.tireSlipRatioFrontRight || 0);
    const sRL = Math.abs(d.tireSlipRatio?.rearLeft || d.tireSlipRatioRearLeft || 0);
    const sRR = Math.abs(d.tireSlipRatio?.rearRight || d.tireSlipRatioRearRight || 0);

    if (sFL > maxSlipFL) maxSlipFL = sFL;
    if (sFR > maxSlipFR) maxSlipFR = sFR;
    if (sRL > maxSlipRL) maxSlipRL = sRL;
    if (sRR > maxSlipRR) maxSlipRR = sRR;
  });

  return {
    maxTempFL: Math.round(maxTempFL),
    maxTempFR: Math.round(maxTempFR),
    maxTempRL: Math.round(maxTempRL),
    maxTempRR: Math.round(maxTempRR),
    avgTempFL: count > 0 ? Math.round(sumTempFL / count) : 0,
    avgTempFR: count > 0 ? Math.round(sumTempFR / count) : 0,
    avgTempRL: count > 0 ? Math.round(sumTempRL / count) : 0,
    avgTempRR: count > 0 ? Math.round(sumTempRR / count) : 0,
    maxSlipFL: Number(maxSlipFL.toFixed(3)),
    maxSlipFR: Number(maxSlipFR.toFixed(3)),
    maxSlipRL: Number(maxSlipRL.toFixed(3)),
    maxSlipRR: Number(maxSlipRR.toFixed(3))
  };
}

// AI 赛后智能诊断缓存读取接口
router.get('/:sessionId/ai-diagnosis', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const keyConfigured = !!process.env.DASHSCOPE_API_KEY;
  const cached = readDiagnosisCache(sessionId);

  if (cached) {
    return res.json({ status: 'success', ...cached, keyConfigured });
  }

  res.json({ status: 'empty', keyConfigured });
}));

// AI 赛后智能诊断生成接口 (阿里云百炼平台)
router.post('/:sessionId/ai-diagnosis', express.json(), asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { problemId, customQuestion, problemDetails } = req.body || {};
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const modelName = process.env.DASHSCOPE_MODEL || 'qwen3.7-plus';

  if (!apiKey) {
    return res.status(403).json({ error: 'api_key_missing' });
  }

  const session = loadSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const tune = session.tuneId ? stateManager.tunes[session.tuneId] : null;
  const vehicle = session.vehicle || {};
  const vehicleDetail = vehicle.ordinal ? stateManager.vehicles[vehicle.ordinal] : null;
  const vehicleName = vehicleDetail?.name || vehicle.name || `车辆 #${vehicle.ordinal || '未知'}`;
  const vehicleClass = vehicleDetail?.class ?? ({ 0: 'D', 1: 'C', 2: 'B', 3: 'A', 4: 'S1', 5: 'S2', 6: 'X' }[vehicle.class] || '未知');
  const vehiclePi = vehicleDetail?.pi || vehicle.performanceIndex || '';
  const vehicleDrivetrain = vehicleDetail?.drivetrain || vehicle.drivetrain || '未知';

  // 读取物理遥测统计（内存缓存，同 session 避免重复解压与计算）
  const rawData = session.data || [];
  const statsKey = `ai_stats_${sessionId}`;
  let cachedStats = getFromCache(statsKey);
  if (!cachedStats) {
    cachedStats = {
      drivingScore: calculateDrivingScore(session),
      suspensionAnalysis: calculateSuspensionAnalysis(rawData, session.positions || []),
      tireAnalysis: calculateTireAnalysisStats(rawData)
    };
    setToCache(statsKey, cachedStats);
  }
  const { drivingScore, suspensionAnalysis, tireAnalysis } = cachedStats;


  // B04：格式化注入 Prompt 的调校参数 —— 在途草稿（body.formData）优先，其次已保存方案；
  // 片段文本模板与原实现逐字一致（见 services/tune-prompt.js）。
  const tunePromptSource = pickTuneForPrompt({ formData: req.body?.formData, savedTune: tune });
  const tuneParamsStr = formatTuneParamsForPrompt(tunePromptSource.tune);

  let issueDescription = '';
  if (problemDetails) {
    issueDescription = `
    【用户选择的问题】：${problemDetails.name}
    【典型症状】：${problemDetails.symptoms}
    【系统初步诊断物理建议】：${problemDetails.fixes ? Object.entries(problemDetails.fixes).map(([param, fix]) => `- ${param}: 调整量 ${fix.delta}, 原因: ${fix.reason}`).join('\n') : '无'}
    `;
  }
  if (customQuestion) {
    issueDescription += `\n【用户补充/自定义提问】：${customQuestion}`;
  }

  const promptContent = `
  赛道名称：${session.trackName || '未知赛道'}
  车辆名称：${vehicleName} (级别: ${vehicleClass} ${vehiclePi} PI, 驱动方式: ${vehicleDrivetrain})

  当前车辆的调校参数（来源：${tunePromptSource.sourceLabel}）：
  ${tuneParamsStr}

  车手本次比赛后反馈的操控问题或自定义提问：
  ${issueDescription}

  物理遥测数据反馈：
  - 驾驶表现综合评分：${drivingScore.总分 || 0}分 (${drivingScore.等级 || 'N/A'})
  - 严重底盘托底帧数：${suspensionAnalysis.totalBottomingTicks || 0}帧 (悬架得分: ${suspensionAnalysis.bottomingScore || 100})
  - 轮胎最高工作温度：左前 ${tireAnalysis.maxTempFL}°C, 右前 ${tireAnalysis.maxTempFR}°C, 左后 ${tireAnalysis.maxTempRL}°C, 右后 ${tireAnalysis.maxTempRR}°C
  - 轮胎平均工作温度：左前 ${tireAnalysis.avgTempFL}°C, 右前 ${tireAnalysis.avgTempFR}°C, 左后 ${tireAnalysis.avgTempRL}°C, 右后 ${tireAnalysis.avgTempRR}°C
  - 轮胎最高滑移率：左前 ${(tireAnalysis.maxSlipFL*100).toFixed(0)}%, 右前 ${(tireAnalysis.maxSlipFR*100).toFixed(0)}%, 左后 ${(tireAnalysis.maxSlipRL*100).toFixed(0)}%, 右后 ${(tireAnalysis.maxSlipRR*100).toFixed(0)}%

  请作为顶尖模拟赛车调校大师与教练，不要输出任何泛泛的文字总结，请严格按照以下 3 个核心板块输出：

  ### 1. 【核心操控问题分析】
  清晰列出 2~3 个在当前调校与遥测下暴露的最主要物理操控问题（如：中速弯推头转向不足、高强制动阶段刹车抱死、前轮胎温过高滑移）。

  ### 2. 【具体物理遥测与参数调整对比表】
  必须直接输出标准的 Markdown 表格，列出针对每个具体问题的调校参数修改项、当前数值、推荐目标数值与变化量。格式必须如下：
  | 解决的问题 | 调校项目 | 当前参数 | 推荐目标数值 | 调整变化量 | 调校物理原理 |
  |---|---|---|---|---|---|
  | (针对的具体问题) | (如：前防倾杆/前弹簧/前轮气压/减速差速锁) | (当前数值) | **(推荐目标数值)** | (变化量如 +2.5 / -0.2) | (简明调校原理) |

  ### 3. 【驾驶手法修正要领与建议】
  用 2~3 句最精炼的语言，提示车手配合该问题的驾驶手法修正要领（如刹车点释放、循迹刹车或给油节奏）。

  注意规范：
  - 必须完全使用纯正、地道的中文赛车术语。
  - 严禁在中文词汇后附加括号英文备注（如禁止出现“外倾角 (Camber)”、“防倾杆 (ARB)”、“APEX点 (弯心)”等，必须直接写为“外倾角”、“弯心”或“防倾杆”）。
  - 全部使用 Markdown 格式输出。
  `;

  const apiResponse = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: '你是一位顶尖的模拟赛车调校大师与教练。你的任务是直奔主题，针对遥测数据中发现的具体操控问题，直接给出极其具体、可操作的定量参数修改对比表（当前值->推荐目标值），拒绝泛泛无用的文字总结。' },
        { role: 'user', content: promptContent }
      ]
    })
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error('DashScope API 错误回复:', errorText);
    return res.status(apiResponse.status).json({ error: `大模型 API 请求失败: ${apiResponse.statusText}` });
  }

  const json = await apiResponse.json();
  const diagnosis = json.choices?.[0]?.message?.content || '生成报告为空';

  const cachedDiagnosis = {
    diagnosis,
    problemId: problemId || null,
    customQuestion: customQuestion || '',
    generatedAt: new Date().toISOString()
  };
  writeDiagnosisCache(sessionId, cachedDiagnosis);

  res.json({ status: 'success', ...cachedDiagnosis });




}));



export default router;
