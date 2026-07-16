import fs from 'fs';
import path from 'path';
import { stateManager } from './state-manager.js';
import {
  saveTracksDatabase,
  readTrackDetail,
  writeTrackDetail as _writeTrackDetail,
  deleteTrackDetail
} from '../storage/session-db.js';
import {
  detectTurnsEnhanced,
  generateSectors,
  buildRouteBook,
  validateTrackQuality
} from '../track-builder.js';
import { simplifyRDP } from '../utils/rdp.js';

const DATA_DIR = stateManager.DATA_DIR;

export function getEnrichedTracks() {
  const enriched = {};
  for (const [id, track] of Object.entries(stateManager.tracks)) {
    enriched[id] = {
      ...track,
      sessionCount: stateManager.sessionCounts[id] || 0,
      lastUsedAt: stateManager.lastUsedMap[id] || track.updatedAt || track.createdAt || null
    };
  }
  return enriched;
}

export function writeTrackDetail(id, trackDetail) {
  _writeTrackDetail(id, trackDetail);
  const currentMode = stateManager.getTrackMode();
  if (currentMode && currentMode.trackId === id) {
    currentMode.detail = trackDetail;
    stateManager.setTrackMode(currentMode);
    console.log(`[同步] 赛道 ${id} 的最新路书数据已热更新到播报内存`);
  }
}

export function healTrackIfNeeded(trackDetail, id) {
  if (!trackDetail) return trackDetail;

  const hasNoTurns = !trackDetail.turns || trackDetail.turns.length === 0;
  if (hasNoTurns && trackDetail.centerline && trackDetail.centerline.length > 0) {
    console.log(`[自愈合] 发现赛道 ${id} 无弯道数据，正在触发实时重算...`);
    try {
      const turns = detectTurnsEnhanced(trackDetail.centerline);
      trackDetail.turns = turns;
      trackDetail.sectors = generateSectors(trackDetail.centerline, turns);

      const allPoints = [];
      if (trackDetail.trajectories) {
        trackDetail.trajectories.forEach((t) => {
          if (t.points) allPoints.push(...t.points);
        });
      }
      trackDetail.routeBook = buildRouteBook(trackDetail.centerline, turns, allPoints.length > 0 ? allPoints : trackDetail.centerline);
      trackDetail.quality = validateTrackQuality(trackDetail);

      writeTrackDetail(id, trackDetail);
      console.log(`[自愈合] 成功更新并存盘赛道 ${id} 的弯道和路书数据！`);

      if (stateManager.tracks[id]) {
        stateManager.tracks[id].turns = turns;
        stateManager.tracks[id].sectors = trackDetail.sectors;
        stateManager.tracks[id].routeBook = trackDetail.routeBook;
        stateManager.tracks[id].quality = trackDetail.quality;
        saveTracksDatabase();
      }
    } catch (err) {
      console.error(`[自愈合] 修复赛道 ${id} 弯道失败:`, err.message);
    }
  }
  return trackDetail;
}

export function getTrackDetail(id) {
  let trackDetail = readTrackDetail(id);
  if (trackDetail) {
    trackDetail = healTrackIfNeeded(trackDetail, id);
    return trackDetail;
  }
  let track = stateManager.tracks[id];
  if (!track) return null;
  track = healTrackIfNeeded(track, id);
  return track;
}

export function createTrack(rawBody) {
  const id = 'track_' + Date.now();
  const createdAt = new Date().toISOString();
  const simplifiedPoints = simplifyRDP(rawBody.points || [], 0.25);

  const trackDetail = {
    id,
    name: rawBody.name || '未命名赛道',
    points: simplifiedPoints,
    pointCount: simplifiedPoints.length,
    length: rawBody.length || 0,
    trajectories: rawBody.trajectories ? rawBody.trajectories.map((t) => simplifyRDP(t, 0.25)) : [simplifiedPoints],
    trajectoryCount: rawBody.trajectories ? rawBody.trajectories.length : 1,
    centerline: rawBody.centerline || simplifiedPoints,
    turns: rawBody.turns || [],
    sectors: rawBody.sectors || [],
    navigation: rawBody.navigation || null,
    createdAt,
    updatedAt: createdAt
  };

  writeTrackDetail(id, trackDetail);

  stateManager.tracks[id] = {
    id,
    name: trackDetail.name,
    length: trackDetail.length,
    pointCount: simplifiedPoints.length,
    turnCount: trackDetail.turns ? trackDetail.turns.length : 0,
    trajectoryCount: trackDetail.trajectoryCount,
    createdAt,
    updatedAt: createdAt
  };
  saveTracksDatabase(stateManager.tracks);
  return id;
}

export function deleteTrack(id) {
  if (!stateManager.tracks[id]) return false;

  delete stateManager.tracks[id];
  saveTracksDatabase(stateManager.tracks);
  deleteTrackDetail(id);

  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const sessionFiles = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));
    sessionFiles.forEach((file) => {
      try {
        const filePath = path.join(sessionsDir, file);
        const session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (session.trackId === id) {
          const sessionId = session.id;
          const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
          const hifiPath = path.join(sessionsDir, `${sessionId}_detail_hifi.json.br`);
          
          if (fs.existsSync(summaryPath)) fs.unlinkSync(summaryPath);
          if (fs.existsSync(hifiPath)) fs.unlinkSync(hifiPath);
        }
      } catch (err) {
        console.error(`[删除赛道] 清除关联比赛 Session 失败:`, err.message);
      }
    });
  }
  return true;
}
