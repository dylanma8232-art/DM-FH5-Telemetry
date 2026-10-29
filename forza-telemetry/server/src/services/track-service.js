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
import {
  sessionsDirExists,
  listSummaryFileNamesSync,
  readSummaryByFileNameSync,
  deleteSummaryAndHifi
} from '../storage/session-store.js';

/**
 * A5：赛道「写详情 → 同步内存索引 → 落盘」的唯一实现。
 *
 * 调用方只提供本路由确实需要同步的字段（memoryPatch），因此各路由的
 * 写盘时序、字段集合与守卫条件都与收敛前逐字等价；replace=true 时替换整条内存索引
 * （PUT /:id 的既有语义）。
 */
export function persistTrackChanges(id, trackDetail, memoryPatch = null, { replace = false } = {}) {
  writeTrackDetail(id, trackDetail);
  if (memoryPatch) {
    if (replace) {
      stateManager.tracks[id] = memoryPatch;
      saveTracksDatabase(stateManager.tracks);
    } else if (stateManager.tracks[id]) {
      Object.assign(stateManager.tracks[id], memoryPatch);
      saveTracksDatabase(stateManager.tracks);
    }
  }
  return trackDetail;
}

/** 弯道编辑（拆分 / 拉扯边界）后统一：重建路书 → 落盘 → 同步内存缓存 */
export function persistTrackTurns(id, trackDetail) {
  trackDetail.routeBook = buildRouteBook(trackDetail.centerline, trackDetail.turns, trackDetail.centerline);
  trackDetail.updatedAt = new Date().toISOString();
  return persistTrackChanges(id, trackDetail, {
    turnCount: trackDetail.turns.length,
    updatedAt: trackDetail.updatedAt,
    turns: trackDetail.turns,
    routeBook: trackDetail.routeBook
  });
}

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

  if (sessionsDirExists()) {
    const sessionFiles = listSummaryFileNamesSync();
    sessionFiles.forEach((file) => {
      try {
        const session = readSummaryByFileNameSync(file);
        if (session.trackId === id) {
          deleteSummaryAndHifi(session.id);
        }
      } catch (err) {
        console.error(`[删除赛道] 清除关联比赛 Session 失败:`, err.message);
      }
    });
  }
  return true;
}
