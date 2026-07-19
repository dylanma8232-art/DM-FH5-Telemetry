import { asyncHandler } from "../utils/asyncHandler.js";import { calculateDrivingLineAnalysis, calculateDrivingStyle, calculateDetailedStats, calculateDrivingScore, calculateGearingAnalysis, calculateSuspensionAnalysis, calculateDifferentialAnalysis, generateTuneDiagnosis, getBestLapNum, findClosestPoint } from '../services/physics-analyzer.js';
import { stateManager } from '../services/state-manager.js';
import { loadSession, readTrackDetail, writeTrackDetail, deleteTrackDetail } from '../storage/session-db.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { generateTelemetryTuningRecommendations } from '../services/physics/telemetry-tuning-recommendations.js';

const router = express.Router();



const DATA_DIR = stateManager.DATA_DIR;
const LEADERBOARD_CACHE_TTL = 30000;

const calculateTrackLength = (pts) => {
  if (!pts || pts.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = (pts[i].y || 0) - (pts[i - 1].y || 0);
    const dz = pts[i].z - pts[i - 1].z;
    len += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return Math.round(len);
};


// 赛后分析API
router.get('/:sessionId', asyncHandler(async (req, res) => {

  const session = loadSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const analysis = {
    sessionId: session.id,
    trackName: session.trackName || '未知赛道',
    trackId: session.trackId || null,
    vehicle: session.vehicle || null,
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

  const step = parseInt(req.query.downsampleStep) || 4;
  let cumulativeDistance = 0;
  const channels = [];

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

    if (i % step === 0 || i === lapFrames.length - 1) {
      channels.push({
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

  res.json({
    lapNum: targetLapNum,
    channels
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

  let cumulativeDistance = 0;
  const usOsIndex = [];
  const differential = [];
  let trailBrakingCount = 0;
  let totalFrames = 0;

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

    if (i % 4 === 0 || i === rawData.length - 1) {
      usOsIndex.push({
        distance: Math.round(cumulativeDistance * 10) / 10,
        value: Math.round(usOsValue * 1000) / 1000
      });
    }

    const wFL = d.wheelRotationSpeed?.frontLeft || d.wheelRotationSpeedFrontLeft || 0;
    const wFR = d.wheelRotationSpeed?.frontRight || d.wheelRotationSpeedFrontRight || 0;
    const wRL = d.wheelRotationSpeed?.rearLeft || d.wheelRotationSpeedRearLeft || 0;
    const wRR = d.wheelRotationSpeed?.rearRight || d.wheelRotationSpeedRearRight || 0;

    if (i % 4 === 0 || i === rawData.length - 1) {
      differential.push({
        distance: Math.round(cumulativeDistance * 10) / 10,
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
  const currentLapFrames = rawData.filter((d) => (d.lapNumber || d.lapNum || 0) === bestLapNum);

  const sessionsDir = path.join(DATA_DIR, 'sessions');
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));
  const historySummaries = [];

  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
      if (data.trackId === trackId && data.vehicle?.ordinal === session.vehicle?.ordinal) {
        historySummaries.push(data);
      }
    } catch (e) {}
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

  res.json({ turns: analysisTurns });




}));


// 调校诊断接口
router.get('/:sessionId/diagnosis', asyncHandler(async (req, res) => {

  const session = loadSession(req.params.sessionId, stateManager.tracks);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const tune = session.tuneId ? stateManager.tunes[session.tuneId] : null;
  const diagnoses = generateTuneDiagnosis(session, tune);
  res.json({ tuneId: session.tuneId, tuneName: tune?.name, diagnoses });



}));

// 无需保存调校方案的遥测调教建议。返回相对当前游戏数值的增减量；
// 客户端若能找到本地方案，再将其换算为“当前值 → 目标值”。
router.get('/:sessionId/tuning-recommendations', asyncHandler(async (req, res) => {
  const session = loadSession(req.params.sessionId, stateManager.tracks);
  if (!session) return res.status(404).json({ error: '未找到比赛记录。' });
  res.json(generateTelemetryTuningRecommendations(session.data || []));
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
  const diagnosisDir = path.join(DATA_DIR, 'diagnoses');
  const cachePath = path.join(diagnosisDir, `${sessionId}.json`);
  const keyConfigured = !!process.env.DASHSCOPE_API_KEY;

  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      return res.json({ status: 'success', ...cached, keyConfigured });
    } catch (e) {
      // 忽略解析错误，视为未缓存
    }
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

  // 读取物理遥测统计
  const rawData = session.data || [];
  const drivingScore = calculateDrivingScore(session);
  const suspensionAnalysis = calculateSuspensionAnalysis(rawData, session.positions || []);
  const tireAnalysis = calculateTireAnalysisStats(rawData);

  // 格式化当前车辆的调校参数明细
  const tuneParamsStr = tune ? `
  - 轮胎气压：前轮 ${tune.tires?.frontPressure || '未设置'} PSI, 后轮 ${tune.tires?.rearPressure || '未设置'} PSI
  - 轮胎外倾角：前轮 ${tune.tires?.frontCamber || '未设置'}°, 后轮 ${tune.tires?.rearCamber || '未设置'}°
  - 轮胎束角：前轮 ${tune.tires?.frontToe || '未设置'}°, 后轮 ${tune.tires?.rearToe || '未设置'}°
  - 悬架弹簧刚度：前部 ${tune.suspension?.frontSpring || '未设置'}, 后部 ${tune.suspension?.rearSpring || '未设置'}
  - 防倾杆硬度：前部 ${tune.suspension?.frontARB || '未设置'}, 后部 ${tune.suspension?.rearARB || '未设置'}
  - 车身高度：前部 ${tune.suspension?.frontRideHeight || '未设置'} cm, 后部 ${tune.suspension?.rearRideHeight || '未设置'} cm
  - 避震阻尼：前侧压缩 ${tune.suspension?.frontDamping || '未设置'}, 后侧压缩 ${tune.suspension?.rearDamping || '未设置'}
  - 差速器锁：加速锁 ${tune.drivetrain?.diffAccel || '未设置'}%, 减速锁 ${tune.drivetrain?.diffDecel || '未设置'}%, 中央分配 ${tune.drivetrain?.diffCenter || '未设置'}%
  - 空气动力学下压力：前部 ${tune.aero?.frontDownforce || '未设置'} lbs, 后部 ${tune.aero?.rearDownforce || '未设置'} lbs
  ` : '该车辆目前使用的是未改动的原厂设定，没有可用的自定义调校参数。';

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

  当前车辆的调校参数：
  ${tuneParamsStr}

  车手在本次比赛后反馈的操控问题或自定义提问：
  ${issueDescription}

  物理数据反馈：
  - 驾驶表现综合评分：${drivingScore.总分 || 0}分 (${drivingScore.等级 || 'N/A'})
  - 严重底盘托底帧数：${suspensionAnalysis.totalBottomingTicks || 0}帧 (悬架得分: ${suspensionAnalysis.bottomingScore || 100})
  - 轮胎最高工作温度：左前 ${tireAnalysis.maxTempFL}°C, 右前 ${tireAnalysis.maxTempFR}°C, 左后 ${tireAnalysis.maxTempRL}°C, 右后 ${tireAnalysis.maxTempRR}°C
  - 轮胎平均工作温度：左前 ${tireAnalysis.avgTempFL}°C, 右前 ${tireAnalysis.avgTempFR}°C, 左后 ${tireAnalysis.avgTempRL}°C, 右后 ${tireAnalysis.avgTempRR}°C
  - 轮胎最高滑移率：左前 ${(tireAnalysis.maxSlipFL*100).toFixed(0)}%, 右前 ${(tireAnalysis.maxSlipFR*100).toFixed(0)}%, 左后 ${(tireAnalysis.maxSlipRL*100).toFixed(0)}%, 右后 ${(tireAnalysis.maxSlipRR*100).toFixed(0)}%

  请作为一名顶尖的模拟赛车调校大师与教练，针对车手所遇到的特定操控问题或自定义疑问，结合当前车辆的具体调校参数与遥测物理数据，提供深度的、定量的分析与改进建议：
  1. 【物理分析】：分析为什么在当前调校参数与行驶状态下，极易产生或加剧此操控问题。
  2. 【调校调整方案】：给出具体且定量的调校修改方案。如果当前车辆有具体的参数数值，请给出调整后的目标数值（例如：“将前弹簧从 800 磅降低至 750 磅”），如果使用的是原厂设定，请给出相对的调整方向和幅度。
  3. 【驾驶行为改善建议】：分析是否有驾驶动作（如刹车过晚、给油过急、打方向过猛等）导致了该问题，并给出可执行的驾驶习惯改善建议。

  注意规范：
  - 必须完全使用纯正、地道的中文赛车术语。
  - 严禁在中文词汇后附加括号英文备注（如禁止出现“外倾角 (Camber)”、“前轮后倾角 (Caster)”、“防倾杆 (ARB)”、“APEX点 (弯心)”、“尾迹制动 (Trail Braking)”等，应当直接写为“外倾角”、“弯心”或“APEX点”、“循迹刹车”或“尾迹制动”）。
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
        { role: 'system', content: '你是一位顶尖的模拟赛车调校大师与教练。请根据车手的物理数据和当前调校配置，针对其具体的操控问题进行深度剖析，并提供极其专业、具体的定量调校建议和驾驶技巧改善建议。' },
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

  const diagnosisDir = path.join(DATA_DIR, 'diagnoses');
  fs.mkdirSync(diagnosisDir, { recursive: true });
  const cachePath = path.join(diagnosisDir, `${sessionId}.json`);
  const cachedDiagnosis = {
    diagnosis,
    problemId: problemId || null,
    customQuestion: customQuestion || '',
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(cachePath, JSON.stringify(cachedDiagnosis, null, 2), 'utf8');

  res.json({ status: 'success', ...cachedDiagnosis });




}));



export default router;
