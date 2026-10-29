import { asyncHandler } from "../utils/asyncHandler.js";import { analyzeSectors } from '../services/physics-analyzer.js';
import { stateManager } from '../services/state-manager.js';
import { loadSession } from '../storage/session-db.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();



const DATA_DIR = stateManager.DATA_DIR;
const LEADERBOARD_CACHE_TTL = 30000;

async function buildLeaderboard() {
  const cached = stateManager.getLeaderboardCache ? stateManager.getLeaderboardCache() : null;
  const cacheTime = stateManager.getLeaderboardCacheTime ? stateManager.getLeaderboardCacheTime() : 0;
  if (cached && Date.now() - cacheTime < LEADERBOARD_CACHE_TTL) {
    return cached;
  }

  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));

  const groups = new Map();

  const fileContents = await Promise.all(
    files.map(f => fs.promises.readFile(sessionsDir + '/' + f, 'utf8').catch(() => null))
  );

  fileContents.forEach((content) => {
    if (!content) return;
    try {
      const s = JSON.parse(content);
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
        tuneName: s.tuneId && stateManager.tunes[s.tuneId] ? stateManager.tunes[s.tuneId].name : null,
        duration: s.summary?.duration || 0
      });
      if (bestLap > 0 && bestLap < g.bestLap) g.bestLap = bestLap;
      g.totalLaps += lapCount;
      g.sessionCount += 1;

      if (s.tuneId) {
        const t = g.tunesUsed.get(s.tuneId) || { tuneId: s.tuneId, name: stateManager.tunes[s.tuneId]?.name || '未知调校', count: 0, bestLap: Infinity };
        t.count += 1;
        if (bestLap > 0 && bestLap < t.bestLap) t.bestLap = bestLap;
        g.tunesUsed.set(s.tuneId, t);
      }
    } catch (e) {}
  });

  const result = [];
  groups.forEach((g) => {
    g.sessions.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
    const validBests = g.sessions.filter((s) => s.bestLap > 0).map((s) => s.bestLap);
    g.avgBestLap = validBests.length > 0 ? validBests.reduce((a, b) => a + b, 0) / validBests.length : 0;

    const firstBest = g.sessions.find((s) => s.bestLap > 0);
    const lastBest = [...g.sessions].reverse().find((s) => s.bestLap > 0);
    let improvement = 0;
    if (firstBest && lastBest && firstBest !== lastBest) {
      improvement = firstBest.bestLap - lastBest.bestLap;
    }

    const latestTrackName = stateManager.tracks[g.trackId]?.name || g.trackName || '未知赛道';
    const vehicleDetail = stateManager.vehicles[String(g.vehicleOrdinal)];
    const vehicleName = vehicleDetail?.name || (g.vehicleOrdinal && g.vehicleOrdinal !== 'null' && g.vehicleOrdinal !== 'undefined' ? `Car #${g.vehicleOrdinal}` : '未知车辆');

    const firstValidSession = g.sessions.find((s) => s.bestLap > 0);
    const firstLap = firstValidSession ? firstValidSession.bestLap : 0;

    const recentSessions = g.sessions.slice(-5);
    const recentBest = recentSessions.filter((s) => s.bestLap > 0).reduce((m, s) => s.bestLap < m ? s.bestLap : m, Infinity);
    const recentBreakthrough = recentBest < Infinity && recentBest === (g.bestLap === Infinity ? 0 : g.bestLap);

    const lastSession = g.sessions[g.sessions.length - 1];
    const daysSinceLastSession = lastSession ?
    Math.floor((Date.now() - new Date(lastSession.savedAt).getTime()) / (1000 * 60 * 60 * 24)) :
    999;

    result.push({
      trackId: g.trackId,
      trackName: latestTrackName,
      vehicleOrdinal: g.vehicleOrdinal,
      vehicleName,
      vehicleClass: g.vehicleClass,
      vehiclePI: g.vehiclePI,
      bestLap: g.bestLap === Infinity ? 0 : g.bestLap,
      firstLap,
      avgBestLap: g.avgBestLap,
      totalLaps: g.totalLaps,
      sessionCount: g.sessionCount,
      improvement,
      recentBreakthrough,
      daysSinceLastSession,
      tunesUsed: Array.from(g.tunesUsed.values()).sort((a, b) => a.bestLap - b.bestLap),
      lastSessionAt: g.sessions.length > 0 ? g.sessions[g.sessions.length - 1].savedAt : null,
      recentBestLaps: recentSessions.
      filter((s) => s.bestLap > 0).
      map((s, i) => ({ index: i + 1, bestLap: s.bestLap, savedAt: s.savedAt }))
    });
  });

  result.sort((a, b) => new Date(b.lastSessionAt) - new Date(a.lastSessionAt));
  if (stateManager.setLeaderboardCache) {
    stateManager.setLeaderboardCache(result);
  }
  return result;
}

// 获取圈速排行榜
router.get('/', asyncHandler(async (req, res) => {

  const data = await buildLeaderboard();
  const { trackId } = req.query;
  if (trackId) {
    return res.json(data.filter((d) => d.trackId === trackId));
  }
  res.json(data);




}));

// 获取特定组合的历史趋势
router.get('/trend', asyncHandler(async (req, res) => {

  const { trackId, vehicleOrdinal } = req.query;
  if (!trackId || !vehicleOrdinal) {
    return res.status(400).json({ error: 'Missing trackId or vehicleOrdinal' });
  }

  const lb = await buildLeaderboard();
  const entry = lb.find((d) => d.trackId === trackId && String(d.vehicleOrdinal) === String(vehicleOrdinal));
  if (!entry) return res.json({ sessions: [], bestLap: 0, avgBestLap: 0 });

  const sessionsDir = path.join(DATA_DIR, 'sessions');
  const sessions = [];
  const allSectorData = [];

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));
  files.forEach((f) => {
    try {
      const sessionId = f.replace('_summary.json', '');
      const s = loadSession(sessionId);
      if (!s) return;
      if (s.trackId !== trackId) return;
      if (String(s.vehicle?.ordinal) !== String(vehicleOrdinal)) return;
      const sectorResult = analyzeSectors(s.positions || [], 3, s.laps?.best || 0);
      const totalSectorTime = sectorResult ? sectorResult.sectors.reduce((sum, se) => sum + se.sectorTime, 0) : 0;
      const isValid = sectorResult && totalSectorTime > 20;
      sessions.push({
        sessionId: s.id,
        savedAt: s.savedAt,
        bestLap: s.laps?.best || 0,
        lastLap: s.laps?.last || 0,
        lapCount: s.laps?.count || 0,
        tuneId: s.tuneId || null,
        tuneName: s.tuneId && stateManager.tunes[s.tuneId] ? stateManager.tunes[s.tuneId].name : null,
        sectors: isValid ? sectorResult.sectors.map((se) => se.sectorTime) : []
      });
      if (isValid) {
        allSectorData.push(sectorResult.sectors);
      }
    } catch (e) {}
  });
  sessions.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
  sessions.forEach((s, i) => {s.sessionIndex = i + 1;});

  let optimalLap = 0;
  const optimalSectors = [];
  if (allSectorData.length > 0) {
    const numSectors = allSectorData[0].length;
    for (let i = 0; i < numSectors; i++) {
      const times = [];
      allSectorData.forEach((sessionSectors, idx) => {
        const st = sessionSectors[i]?.sectorTime;
        if (st && st > 0) times.push({ st, sessionId: sessions[idx]?.sessionId });
      });
      if (times.length === 0) continue;
      times.sort((a, b) => a.st - b.st);
      const median = times.length % 2 === 1 ?
      times[Math.floor(times.length / 2)].st :
      (times[times.length / 2 - 1].st + times[times.length / 2].st) / 2;
      const minThreshold = median * 0.5;
      const valid = times.filter((t) => t.st >= minThreshold);
      if (valid.length === 0) continue;
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




}));



export default router;