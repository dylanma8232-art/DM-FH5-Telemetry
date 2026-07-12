import { asyncHandler } from "../utils/asyncHandler.js";import { calculateDrivingLineAnalysis, calculateDrivingStyle, calculateDetailedStats, calculateDrivingScore, calculateGearingAnalysis, calculateSuspensionAnalysis, calculateDifferentialAnalysis, generateTuneDiagnosis, getBestLapNum, findClosestPoint } from '../services/physics-analyzer.js';
import { stateManager } from '../services/state-manager.js';
import { loadSession, readTrackDetail, writeTrackDetail, deleteTrackDetail } from '../storage/session-db.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

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
    powerCurve
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

// AI 驾驶教练缓存读取接口
router.get('/:sessionId/ai-coach', asyncHandler(async (req, res) => {

  const { sessionId } = req.params;
  const sessionDir = path.join(DATA_DIR, 'sessions');
  const reportPath = path.join(sessionDir, `${sessionId}_ai_coach.md`);
  const keyConfigured = !!process.env.DASHSCOPE_API_KEY;

  if (fs.existsSync(reportPath)) {
    const report = fs.readFileSync(reportPath, 'utf8');
    return res.json({ status: 'success', report, keyConfigured });
  }

  res.json({ status: 'empty', keyConfigured });



}));

// AI 驾驶教练诊断生成接口 (阿里云百炼平台)
router.post('/:sessionId/ai-coach', express.json(), asyncHandler(async (req, res) => {

  const { sessionId } = req.params;
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

  const laps = session.laps || {};
  const drivingScore = calculateDrivingScore(session);

  const trackId = session.trackId;
  let turnsSummary = [];
  if (trackId && stateManager.tracks[trackId]) {
    const trackTurns = stateManager.tracks[trackId].turns || [];
    const rawData = session.data || [];
    const bestLapNum = getBestLapNum(rawData);
    const currentLapFrames = rawData.filter((d) => (d.lapNumber || d.lapNum || 0) === bestLapNum);

    turnsSummary = trackTurns.map((turn, tIdx) => {
      const entryPt = findClosestPoint(turn.startX, turn.startZ, currentLapFrames);
      const apexPt = findClosestPoint(turn.x, turn.z, currentLapFrames);
      const exitPt = findClosestPoint(turn.endX, turn.endZ, currentLapFrames);

      const entrySpeed = entryPt ? Math.round(entryPt.speedKmh || (entryPt.speed ? entryPt.speed * 3.6 : 0)) : 0;
      const apexSpeed = apexPt ? Math.round(apexPt.speedKmh || (apexPt.speed ? apexPt.speed * 3.6 : 0)) : 0;
      const exitSpeed = exitPt ? Math.round(exitPt.speedKmh || (exitPt.speed ? exitPt.speed * 3.6 : 0)) : 0;
      const gear = apexPt ? apexPt.gear || 0 : 0;

      return {
        name: `T${tIdx + 1}`,
        type: turn.turnCategory || turn.type || '常规弯',
        direction: turn.direction === 'left' ? '左' : '右',
        radius: turn.radius ? Math.round(turn.radius) : '未知',
        entrySpeed,
        apexSpeed,
        exitSpeed,
        gear
      };
    });
  }

  const formattedBestLap = (() => {
    const sec = laps.best || 0;
    if (!sec) return '无记录';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round(sec % 1 * 1000);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  })();

  const vehicleDetail = session.vehicle?.ordinal ? stateManager.vehicles[session.vehicle.ordinal] : null;
  const vehicleName = vehicleDetail?.name || (session.vehicle?.ordinal ? 'Car #' + session.vehicle.ordinal : '未知车辆');
  const vehicleClass = vehicleDetail?.class ?? ({ 0: 'D', 1: 'C', 2: 'B', 3: 'A', 4: 'S1', 5: 'S2', 6: 'X' }[session.vehicle?.class] || '未知');
  const vehiclePi = vehicleDetail?.pi || session.vehicle?.performanceIndex || '';

  const suspensionAnalysis = calculateSuspensionAnalysis(rawData, session.positions || []);

  const promptContent = `
赛道名称：${session.trackName || '未知赛道'}
车辆名称：${vehicleName} (级别: ${vehicleClass} ${vehiclePi} PI)
最佳圈速：${formattedBestLap}
总出赛圈数：${laps.count || 0} 圈

驾驶行为综合打分（满分 100 分，当前得分：${drivingScore.总分 || 0} 分，评价等级：${drivingScore.等级 || 'N/A'}）：
- 圈速节奏分：${drivingScore.维度?.圈速?.分数 || 0} / 20
- 刹车控制分：${drivingScore.维度?.刹车?.分数 || 0} / 20
- 弯中油门分：${drivingScore.维度?.油门?.分数 || 0} / 20
- 路线走线分：${drivingScore.维度?.走线?.分数 || 0} / 20
- 圈速一致分：${drivingScore.维度?.一致性?.分数 || 0} / 20

底盘与悬挂健康度：
- 悬挂健康得分：${suspensionAnalysis.bottomingScore || 100} / 100
- 严重触底帧数：${suspensionAnalysis.totalBottomingTicks || 0} 帧

基础诊断建议：
${drivingScore.建议 ? drivingScore.建议.map((s) => `- ${s}`).join('\n') : '无'}

弯道遥测细分数据（各弯角的入弯速度、弯心最低速、出弯速度及弯心档位）：
${turnsSummary.map((t) => `- 弯道 ${t.name} (${t.type}, ${t.direction}弯, 半径 ${t.radius}米): 入弯车速 ${t.entrySpeed}km/h, 弯心车速 ${t.apexSpeed}km/h, 出弯车速 ${t.exitSpeed}km/h, 弯中档位 ${t.gear}档`).join('\n')}

请作为一名专业的模拟赛车教练，为我详细分析这场比赛的遥测表现，指出最需要优先改进的 2 个弯道和具体的驾驶操作短板，并给出一个明确的“下一步提升行动清单”。
注意：请完全使用纯正、地道的中文赛车术语（例如用“尾迹制动”或“循迹刹车”，而非带有英文括号备注的形式；用“弯心”或“APEX点”）。不要在中文词汇后面使用括号做任何英文的备注或说明。
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
      { role: 'system', content: '你是一位专业的模拟赛车驾驶教练。请根据车手的遥测数据，给出中肯、精确的驾驶建议，指出短板并给出行动清单。使用专业的赛车工程 and 驾驶术语（如：刹车尾迹/循迹制动，弯心/APEX点，重力加速度等）。不要在中文技术术语后面用括号附加英文备注。全部使用 Markdown 格式输出。' },
      { role: 'user', content: promptContent }]

    })
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error('DashScope API 错误回复:', errorText);
    return res.status(apiResponse.status).json({ error: `大模型 API 请求失败: ${apiResponse.statusText}` });
  }

  const json = await apiResponse.json();
  const report = json.choices?.[0]?.message?.content || '生成报告为空';

  const sessionDir = path.join(DATA_DIR, 'sessions');
  const reportPath = path.join(sessionDir, `${sessionId}_ai_coach.md`);
  fs.writeFileSync(reportPath, report, 'utf8');

  res.json({ status: 'success', report });




}));



export default router;