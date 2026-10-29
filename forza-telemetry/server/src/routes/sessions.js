import { fileURLToPath } from 'url';
import { asyncHandler } from "../utils/asyncHandler.js";
import { stateManager } from '../services/state-manager.js';
import { loadSession } from '../storage/session-db.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const DATA_DIR = stateManager.DATA_DIR;
const carsDbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/cars-database.json');


let cachedSessionsList = null;
let lastSessionsFetchTime = 0;

let cachedLeaderboardsList = null;
let lastLeaderboardsFetchTime = 0;
const LEADERBOARDS_CACHE_TTL = 10000;

// 获取比赛记录列表
router.get('/api/sessions', asyncHandler(async (req, res) => {
  const now = Date.now();
  if (cachedSessionsList && (now - lastSessionsFetchTime < 5000)) {
    return res.json(cachedSessionsList);
  }

  const sessionsDir = DATA_DIR + '/sessions';
  const files = (await fs.promises.readdir(sessionsDir)).filter((f) => f.endsWith('_summary.json'));
  const carsDatabase = fs.existsSync(carsDbPath) ? loadJSON(carsDbPath) : {};

  const parsed = await Promise.all(files.map(async (f) => {
    try {
      const data = JSON.parse(await fs.promises.readFile(sessionsDir + '/' + f, 'utf8'));
      const tune = data.tuneId && stateManager.tunes[data.tuneId] ? stateManager.tunes[data.tuneId] : null;
      const trackName = typeof stateManager.tracks !== 'undefined' && data.trackId && stateManager.tracks[data.trackId] ?
      stateManager.tracks[data.trackId].name :
      data.trackName || '未知赛道';

      let vehicle = data.vehicle || null;
      let ordinalKey = vehicle?.ordinal || data.carOrdinal;

      // 若车辆信息缺失，自动按 savedAt 时间戳匹配 stateManager.vehicles 中最近使用的车辆
      if ((!ordinalKey || ordinalKey <= 0) && data.savedAt && stateManager.vehicles) {
        const sTime = new Date(data.savedAt).getTime();
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

      return {
        id: data.id,
        filename: f,
        trackName: trackName,
        trackId: data.trackId || null,
        vehicle: vehicle,
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
  }));
  const sessions = parsed.filter((s) => s !== null);

  sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  cachedSessionsList = sessions;
  lastSessionsFetchTime = Date.now();
  res.json(sessions);
}));

// 获取全赛道最佳圈速与历史排名
router.get('/api/sessions/leaderboards', asyncHandler(async (req, res) => {
  const now = Date.now();
  if (cachedLeaderboardsList && (now - lastLeaderboardsFetchTime < LEADERBOARDS_CACHE_TTL)) {
    return res.json(cachedLeaderboardsList);
  }

  const sessionsDir = DATA_DIR + '/sessions';
  const files = (await fs.promises.readdir(sessionsDir)).filter((f) => f.endsWith('_summary.json'));

  const leaderboards = {};

  const fileContents = await Promise.all(
    files.map((file) => fs.promises.readFile(path.join(sessionsDir, file), 'utf8').catch(() => null))
  );

  fileContents.forEach((content) => {
    if (!content) return;
    try {
      const summary = JSON.parse(content);
      if (summary.bestLap > 0 && summary.trackId) {
        if (!leaderboards[summary.trackId]) {
          leaderboards[summary.trackId] = [];
        }
        leaderboards[summary.trackId].push({
          sessionId: summary.id,
          carOrdinal: summary.car?.ordinal || 0,
          carClass: summary.car?.class || 0,
          carPI: summary.car?.performanceIndex || 0,
          bestLap: summary.bestLap,
          timestamp: summary.timestamp
        });
      }
    } catch (e) {}
  });

  // Sort each track's leaderboard by bestLap ascending
  Object.keys(leaderboards).forEach((trackId) => {
    leaderboards[trackId].sort((a, b) => a.bestLap - b.bestLap);
  });

  cachedLeaderboardsList = leaderboards;
  lastLeaderboardsFetchTime = Date.now();
  res.json(leaderboards);



}));


// 获取比赛记录详情
router.get('/api/sessions/:id', asyncHandler(async (req, res) => {

  const session = loadSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);



}));

// 获取比赛记录的遥测数据
router.get('/api/sessions/:id/telemetry', asyncHandler(async (req, res) => {

  const session = loadSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session.data || []);



}));

// 删除比赛记录
router.delete('/api/sessions/:id', asyncHandler(async (req, res) => {

  const sessionsDir = DATA_DIR + '/sessions';
  const summaryPath = path.join(sessionsDir, `${req.params.id}_summary.json`);
  const hifiPath = path.join(sessionsDir, `${req.params.id}_detail_hifi.json.br`);
  const lowfiPath = path.join(sessionsDir, `${req.params.id}_detail_lowfi.json.br`);
  const brPath = path.join(sessionsDir, `${req.params.id}_detail.json.br`);
  const gzPath = path.join(sessionsDir, `${req.params.id}_detail.json.gz`);

  let deleted = false;
  if (fs.existsSync(summaryPath)) {
    fs.unlinkSync(summaryPath);
    deleted = true;
  }
  if (fs.existsSync(hifiPath)) {
    fs.unlinkSync(hifiPath);
    deleted = true;
  }
  if (fs.existsSync(lowfiPath)) {
    fs.unlinkSync(lowfiPath);
    deleted = true;
  }
  if (fs.existsSync(brPath)) {
    fs.unlinkSync(brPath);
    deleted = true;
  }
  if (fs.existsSync(gzPath)) {
    fs.unlinkSync(gzPath);
    deleted = true;
  }

  if (!deleted) {
    return res.status(404).json({ error: 'Session not found' });
  }

  stateManager.setLeaderboardCache(null);
  cachedLeaderboardsList = null;
  lastLeaderboardsFetchTime = 0;
  res.json({ status: 'ok' });



}));

// 编辑比赛记录的赛道名称
router.put('/api/sessions/:id/track', express.json(), asyncHandler(async (req, res) => {

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



}));

// 批量更新比赛记录的赛道名称
router.put('/api/sessions/batch/track', express.json(), asyncHandler(async (req, res) => {

  const { sessionIds, trackName, trackId } = req.body;
  if (!sessionIds || !Array.isArray(sessionIds) || !trackName) {
    return res.status(400).json({ error: 'sessionIds array and trackName are required' });
  }

  const sessionsDir = DATA_DIR + '/sessions';
  let updatedCount = 0;

  await Promise.all(sessionIds.map(async (sessionId) => {
    const filePath = path.join(sessionsDir, `${sessionId}_summary.json`);
    try {
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      data.trackName = trackName;
      if (trackId) data.trackId = trackId;
      saveJSON(filePath, data);
      updatedCount++;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }));

  res.json({ status: 'ok', updatedCount });



}));



export default router;