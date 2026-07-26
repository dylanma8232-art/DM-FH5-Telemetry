import { asyncHandler } from "../utils/asyncHandler.js";
import { stateManager } from '../services/state-manager.js';
import {
  writeTrackDetail,
  healTrackIfNeeded,
  getTrackDetail,
  createTrack,
  deleteTrack,
  getEnrichedTracks
} from '../services/track-service.js';
import { readTrackDetail, saveTracksDatabase, deleteTrackDetail } from '../storage/session-db.js';
import {
  detectTurnsEnhanced,
  generateSectors,
  buildRouteBook,
  validateTrackQuality,
  buildTrackFromTrajectories,
  calculateTurnAttributes,
  remapLockedTurns
} from '../track-builder.js';
import { simplifyRDP } from '../utils/rdp.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

const DATA_DIR = stateManager.DATA_DIR;
const router = express.Router();
const LEADERBOARD_CACHE_TTL = 30000;

// 赛道列表增强 - 从 stateManager 内存快速缓存返回，避免 I/O 带来的严重延迟
router.get('/', (req, res) => {
  res.json(getEnrichedTracks());
});

// 获取赛道详情 - 从独立小分包文件读取几何坐标点
router.get('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  const trackDetail = getTrackDetail(id);
  if (trackDetail) {
    res.json(trackDetail);
  } else {
    res.status(404).json({ error: 'Track not found' });
  }
}));

// 获取赛道导航中线点数据
router.get('/:id/navigation', asyncHandler(async (req, res) => {
  const id = req.params.id;
  const trackDetail = getTrackDetail(id);
  if (!trackDetail) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json({
    trackId: trackDetail.id,
    trackName: trackDetail.name,
    centerline: trackDetail.centerline || [],
    turns: trackDetail.turns || [],
    sectors: trackDetail.sectors || [],
    navigation: trackDetail.navigation || [],
    length: trackDetail.length || 0,
    trajectoryCount: trackDetail.trajectories ? trackDetail.trajectories.length : trackDetail.trajectoryCount || 0
  });
}));

// 创建新赛道
router.post('/', express.json(), (req, res) => {
  try {
    const id = createTrack(req.body);
    res.json({ status: 'ok', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 删除特定赛道
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  const success = deleteTrack(id);
  if (success) {
    res.json({ status: 'ok' });
  } else {
    res.status(404).json({ error: 'Track not found' });
  }
}));


// 赛道数据质量验证
router.get('/:id/validate', asyncHandler(async (req, res) => {
  const id = req.params.id;

  const trackDetail = readTrackDetail(id) || stateManager.tracks[id];
  if (!trackDetail) return res.status(404).json({ error: 'Track not found' });
  const result = validateTrackQuality(trackDetail);
  res.json(result);



}));

// 采用每次比赛生成的候选地图。候选生成不改正式路书；只有此操作才会提升它。
router.post('/:id/adopt-candidate', asyncHandler(async (req, res) => {
  const id = req.params.id;
  const trackDetail = readTrackDetail(id) || stateManager.tracks[id];
  if (!trackDetail) return res.status(404).json({ error: 'Track not found' });

  const candidate = trackDetail.geometryCandidate;
  if (!candidate?.centerline?.length || !candidate?.turns?.length) {
    return res.status(400).json({ error: '没有可采用的候选地图。请先完成一场该赛道的比赛。' });
  }

  trackDetail.points = candidate.centerline;
  trackDetail.centerline = candidate.centerline;
  trackDetail.turns = candidate.turns;
  trackDetail.length = candidate.length || 0;
  trackDetail.isLoop = candidate.isLoop || false;
  trackDetail.sectors = candidate.sectors || generateSectors(candidate.centerline, candidate.turns);
  trackDetail.routeBook = candidate.routeBook || buildRouteBook(candidate.centerline, candidate.turns, candidate.centerline);
  trackDetail.referenceGeometry = {
    schemaVersion: candidate.schemaVersion || 2,
    algorithm: candidate.algorithm || 'rdp-fit-v1',
    status: 'active',
    revision: (trackDetail.referenceGeometry?.revision || 0) + 1,
    sourceTrajectoryCount: candidate.sourceTrajectoryCount || trackDetail.trajectoryCount || 1,
    activatedAt: new Date().toISOString(),
    adoptedFromCandidateAt: candidate.generatedAt || new Date().toISOString()
  };
  delete trackDetail.geometryCandidate;
  trackDetail.quality = validateTrackQuality(trackDetail);
  trackDetail.updatedAt = new Date().toISOString();
  writeTrackDetail(id, trackDetail);

  if (stateManager.tracks[id]) {
    Object.assign(stateManager.tracks[id], {
      length: trackDetail.length,
      pointCount: trackDetail.centerline.length,
      turnCount: trackDetail.turns.length,
      isLoop: trackDetail.isLoop,
      updatedAt: trackDetail.updatedAt
    });
    saveTracksDatabase(stateManager.tracks);
  }

  res.json({
    status: 'ok',
    trackId: id,
    length: trackDetail.length,
    pointCount: trackDetail.centerline.length,
    turnCount: trackDetail.turns.length
  });
}));

// 重建赛道中心线和弯道数据
router.post('/:id/rebuild', asyncHandler(async (req, res) => {
  const id = req.params.id;

  let trackDetail = readTrackDetail(id);
  if (!trackDetail) {
    trackDetail = stateManager.tracks[id] ? { ...tracks[id] } : null;
  }
  if (!trackDetail) return res.status(404).json({ error: 'Track not found' });

  const availableTrajectories = trackDetail.trajectories && trackDetail.trajectories.length > 0 ?
  trackDetail.trajectories :
  trackDetail.points && trackDetail.points.length > 0 ? [trackDetail.points] : null;

  if (!availableTrajectories) {
    return res.status(400).json({ error: '无可用轨迹数据，无法重建' });
  }

  const trackData = buildTrackFromTrajectories(availableTrajectories, {
    oldTurns: trackDetail.turns || [],
    isPaceNoteLocked: trackDetail.isPaceNoteLocked || false,
    deletedTurns: trackDetail.deletedTurns || []
  });
  if (!trackData) {
    return res.status(400).json({ error: '轨迹数据不足，无法构建中心线' });
  }

  const oldTurnCount = (trackDetail.turns || []).length;
  const oldCenterlineLen = (trackDetail.centerline || []).length;

  trackDetail.centerline = trackData.centerline;
  trackDetail.turns = trackData.turns;
  trackDetail.length = trackData.length;
  trackDetail.isLoop = trackData.isLoop || false;
  trackDetail.sectors = generateSectors(trackData.centerline, trackData.turns);
  trackDetail.routeBook = trackData.routeBook;
  trackDetail.referenceGeometry = {
    ...trackData.geometry,
    status: 'active',
    revision: (trackDetail.referenceGeometry?.revision || 0) + 1,
    activatedAt: new Date().toISOString()
  };
  delete trackDetail.geometryCandidate;
  trackDetail.quality = validateTrackQuality(trackDetail);
  trackDetail.updatedAt = new Date().toISOString();

  writeTrackDetail(id, trackDetail);

  if (stateManager.tracks[id]) {
    stateManager.tracks[id].length = trackDetail.length;
    stateManager.tracks[id].pointCount = trackDetail.centerline.length;
    stateManager.tracks[id].turnCount = trackDetail.turns ? trackDetail.turns.length : 0;
    stateManager.tracks[id].isLoop = trackDetail.isLoop || false;
    stateManager.tracks[id].updatedAt = trackDetail.updatedAt;
    saveTracksDatabase(stateManager.tracks);
  }

  console.log(`[重建] 赛道 ${id} 重建完成：中心线 ${oldCenterlineLen} → ${trackData.centerline.length} 点，弯道 ${oldTurnCount} → ${trackData.turns.length} 个`);
  res.json({
    status: 'ok',
    before: { centerlineLength: oldCenterlineLen, turnCount: oldTurnCount },
    after: { centerlineLength: trackData.centerline.length, turnCount: trackData.turns.length, length: trackData.length },
    quality: trackDetail.quality
  });




}));

// 更新弯道推荐速度
router.put('/:id/turns/:index/speedHint', express.json(), asyncHandler(async (req, res) => {
  const id = req.params.id;

  let trackDetail = readTrackDetail(id) || stateManager.tracks[id];
  if (!trackDetail) return res.status(404).json({ error: 'Track not found' });
  if (!trackDetail.turns || !Array.isArray(trackDetail.turns)) return res.status(400).json({ error: 'Track has no turns' });

  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= trackDetail.turns.length) return res.status(400).json({ error: 'Invalid turn index' });

  trackDetail.turns[idx].speedHint = req.body.speedHint || '';
  trackDetail.updatedAt = new Date().toISOString();

  writeTrackDetail(id, trackDetail);

  stateManager.tracks[id].updatedAt = trackDetail.updatedAt;
  saveTracksDatabase(stateManager.tracks);

  res.json({ status: 'ok', turnIndex: idx, speedHint: trackDetail.turns[idx].speedHint });



}));

// 批量更新/编辑弯道与备注路书
router.put('/:id/turns', express.json(), asyncHandler(async (req, res) => {
  const id = req.params.id;

  let trackDetail = readTrackDetail(id) || stateManager.tracks[id];
  if (!trackDetail) return res.status(404).json({ error: 'Track not found' });

  const newTurns = req.body.turns;
  if (!Array.isArray(newTurns)) {
    return res.status(400).json({ error: 'Invalid turns data' });
  }

  if (req.body.isPaceNoteLocked !== undefined) {
    trackDetail.isPaceNoteLocked = req.body.isPaceNoteLocked;
  }
  if (Array.isArray(req.body.deletedTurns)) {
    trackDetail.deletedTurns = req.body.deletedTurns;
  }

  trackDetail.turns = newTurns;
  trackDetail.updatedAt = new Date().toISOString();

  const centerline = trackDetail.centerline || [];
  trackDetail.routeBook = buildRouteBook(centerline, newTurns, centerline);
  trackDetail.quality = validateTrackQuality(trackDetail);

  writeTrackDetail(id, trackDetail);

  if (stateManager.tracks[id]) {
    stateManager.tracks[id].turnCount = newTurns.length;
    stateManager.tracks[id].updatedAt = trackDetail.updatedAt;
    saveTracksDatabase(stateManager.tracks);
  }

  res.json({
    status: 'ok',
    turns: trackDetail.turns,
    routeBook: trackDetail.routeBook,
    turnCount: newTurns.length
  });




}));



// 高级编辑器：在顶点拆分一个弯道
router.post('/:id/turns/split', express.json(), asyncHandler(async (req, res) => {
  const id = req.params.id;

  let trackDetail = readTrackDetail(id) || stateManager.tracks[id];
  if (!trackDetail || !trackDetail.turns) return res.status(404).json({ error: 'Track or turns not found' });

  const index = parseInt(req.body.turnIndex, 10);
  if (isNaN(index) || index < 0 || index >= trackDetail.turns.length) return res.status(400).json({ error: 'Invalid index' });

  const t = trackDetail.turns[index];
  if (t.endIdx - t.startIdx < 4) {
    return res.status(400).json({ error: 'Turn is too short to split' });
  }

  const apexIndex = req.body.splitIdx != null ? parseInt(req.body.splitIdx, 10) : t.index != null ? t.index : Math.floor((t.startIdx + t.endIdx) / 2);
  const t1 = calculateTurnAttributes(trackDetail.centerline, t.startIdx, apexIndex - 1, t.id + '_1');
  const t2 = calculateTurnAttributes(trackDetail.centerline, apexIndex, t.endIdx, t.id + '_2');

  if (!t1 || !t2) return res.status(400).json({ error: 'Failed to split turn' });

  trackDetail.turns.splice(index, 1, t1, t2);


  const rebuiltRouteBook = buildRouteBook(trackDetail.centerline, trackDetail.turns, trackDetail.centerline);
  trackDetail.routeBook = rebuiltRouteBook;
  trackDetail.updatedAt = new Date().toISOString();

  writeTrackDetail(id, trackDetail);

  if (stateManager.tracks[id]) {
    stateManager.tracks[id].turnCount = trackDetail.turns.length;
    stateManager.tracks[id].updatedAt = trackDetail.updatedAt;
    stateManager.tracks[id].turns = trackDetail.turns;
    stateManager.tracks[id].routeBook = trackDetail.routeBook;
    saveTracksDatabase(stateManager.tracks);
  }

  if (req.app.get('stateManager.io')) req.app.get('stateManager.io').emit('trackUpdated', { trackId: id, name: stateManager.tracks[id].name });
  res.json({ status: 'ok', turns: trackDetail.turns, routeBook: trackDetail.routeBook });



}));

// 高级编辑器：修改弯道起止边界（拉扯）
router.put('/:id/turns/:index/bounds', express.json(), asyncHandler(async (req, res) => {
  const id = req.params.id;

  let trackDetail = readTrackDetail(id) || stateManager.tracks[id];
  if (!trackDetail || !trackDetail.turns) return res.status(404).json({ error: 'Track or turns not found' });

  const index = parseInt(req.params.index, 10);
  if (isNaN(index) || index < 0 || index >= trackDetail.turns.length) return res.status(400).json({ error: 'Invalid index' });

  const { startIdx, endIdx } = req.body;
  if (startIdx === undefined || endIdx === undefined || startIdx >= endIdx) return res.status(400).json({ error: 'Invalid bounds' });

  const t = trackDetail.turns[index];

  if (index > 0 && startIdx <= trackDetail.turns[index - 1].endIdx) {
    trackDetail.turns[index - 1].endIdx = Math.max(0, startIdx - 1);
    const updatedPrev = calculateTurnAttributes(trackDetail.centerline, trackDetail.turns[index - 1].startIdx, trackDetail.turns[index - 1].endIdx, trackDetail.turns[index - 1].id);
    if (updatedPrev) trackDetail.turns[index - 1] = updatedPrev;
  }
  if (index < trackDetail.turns.length - 1 && endIdx >= trackDetail.turns[index + 1].startIdx) {
    trackDetail.turns[index + 1].startIdx = Math.min(trackDetail.centerline.length - 1, endIdx + 1);
    const updatedNext = calculateTurnAttributes(trackDetail.centerline, trackDetail.turns[index + 1].startIdx, trackDetail.turns[index + 1].endIdx, trackDetail.turns[index + 1].id);
    if (updatedNext) trackDetail.turns[index + 1] = updatedNext;
  }

  const updatedT = calculateTurnAttributes(trackDetail.centerline, startIdx, endIdx, t.id);
  if (!updatedT) return res.status(400).json({ error: 'Failed to recalculate bounds' });
  if (t.customNote) updatedT.customNote = t.customNote;

  trackDetail.turns[index] = updatedT;


  const rebuiltRouteBook = buildRouteBook(trackDetail.centerline, trackDetail.turns, trackDetail.centerline);
  trackDetail.routeBook = rebuiltRouteBook;
  trackDetail.updatedAt = new Date().toISOString();

  writeTrackDetail(id, trackDetail);

  if (stateManager.tracks[id]) {
    stateManager.tracks[id].turnCount = trackDetail.turns.length;
    stateManager.tracks[id].updatedAt = trackDetail.updatedAt;
    stateManager.tracks[id].turns = trackDetail.turns;
    stateManager.tracks[id].routeBook = trackDetail.routeBook;
    saveTracksDatabase(stateManager.tracks);
  }

  if (req.app.get('stateManager.io')) req.app.get('stateManager.io').emit('trackUpdated', { trackId: id, name: stateManager.tracks[id].name });
  res.json({ status: 'ok', turns: trackDetail.turns, routeBook: trackDetail.routeBook });



}));

// 合并赛道：将源赛道的轨迹合并到目标赛道 (即时响应，异步处理重型几何)
router.post('/merge', express.json(), asyncHandler(async (req, res) => {
  const { sourceTrackId, targetTrackId } = req.body;

  if (!sourceTrackId || !targetTrackId) {
    return res.status(400).json({ error: 'sourceTrackId and targetTrackId are required' });
  }

  if (!stateManager.tracks[sourceTrackId] || !stateManager.tracks[targetTrackId]) {
    return res.status(404).json({ error: 'Track not found' });
  }

  let sourceDetail = readTrackDetail(sourceTrackId);
  if (!sourceDetail) {
    sourceDetail = { ...stateManager.tracks[sourceTrackId] };
  }

  let targetDetail = readTrackDetail(targetTrackId);
  if (!targetDetail) {
    targetDetail = { ...stateManager.tracks[targetTrackId] };
  }

  const sourceTrajectories = sourceDetail.trajectories || [sourceDetail.points || []];
  const targetTrajectories = targetDetail.trajectories || [targetDetail.points || []];
  const rawMerged = [...targetTrajectories, ...sourceTrajectories];

  // 1. 优先立即更新内存数据库与列表状态（毫秒级）
  deleteTrackDetail(sourceTrackId);
  delete stateManager.tracks[sourceTrackId];

  targetDetail.trajectories = rawMerged;
  targetDetail.trajectoryCount = rawMerged.length;
  targetDetail.updatedAt = new Date().toISOString();

  stateManager.tracks[targetTrackId] = {
    id: targetTrackId,
    name: targetDetail.name || '未命名赛道',
    length: targetDetail.length || 0,
    pointCount: targetDetail.points ? targetDetail.points.length : 0,
    turnCount: targetDetail.turns ? targetDetail.turns.length : 0,
    trajectoryCount: rawMerged.length,
    isLoop: targetDetail.isLoop || false,
    createdAt: targetDetail.createdAt || (stateManager.tracks[targetTrackId] ? stateManager.tracks[targetTrackId].createdAt : null) || new Date().toISOString(),
    updatedAt: targetDetail.updatedAt
  };
  saveTracksDatabase(stateManager.tracks);

  // 立即推送 Socket 广播，通知前端更新列表
  if (stateManager.io) {
    stateManager.io.emit('trackDeleted', { trackId: sourceTrackId });
    stateManager.io.emit('trackUpdated', { trackId: targetTrackId, name: stateManager.tracks[targetTrackId].name });
  }

  // 2. 立即响应客户端，解锁 UI
  res.json({
    status: 'ok',
    targetTrackId: targetTrackId,
    trajectoryCount: rawMerged.length,
    trackLength: targetDetail.length || 0,
    processing: true
  });

  // 3. 后台异步执行高耗时中心线、弯道路书计算与文件持久化
  setImmediate(async () => {
    try {
      const mergedTrajectories = rawMerged.map((traj) => simplifyRDP(traj, 0.25));

      const trackData = buildTrackFromTrajectories(mergedTrajectories, {
        oldTurns: targetDetail.turns || [],
        isPaceNoteLocked: targetDetail.isPaceNoteLocked || false,
        deletedTurns: targetDetail.deletedTurns || []
      });

      // 重新从内存中获取 targetDetail，防止用户在异步计算期间修改了赛道名称
      const currentTargetDetail = readTrackDetail(targetTrackId) || targetDetail;
      currentTargetDetail.trajectories = mergedTrajectories;
      currentTargetDetail.trajectoryCount = mergedTrajectories.length;
      currentTargetDetail.updatedAt = new Date().toISOString();

      if (trackData) {
        currentTargetDetail.points = trackData.centerline;
        currentTargetDetail.centerline = trackData.centerline;
        currentTargetDetail.turns = trackData.turns;
        currentTargetDetail.length = trackData.length;
        currentTargetDetail.isLoop = trackData.isLoop || false;
        currentTargetDetail.sectors = generateSectors(trackData.centerline, trackData.turns);
        currentTargetDetail.routeBook = trackData.routeBook;
        currentTargetDetail.referenceGeometry = {
          ...trackData.geometry,
          status: 'active',
          revision: (currentTargetDetail.referenceGeometry?.revision || 0) + 1,
          activatedAt: new Date().toISOString()
        };
        delete currentTargetDetail.geometryCandidate;
      }

      writeTrackDetail(targetTrackId, currentTargetDetail);

      if (stateManager.tracks[targetTrackId]) {
        stateManager.tracks[targetTrackId] = {
          ...stateManager.tracks[targetTrackId],
          length: currentTargetDetail.length || 0,
          pointCount: currentTargetDetail.points ? currentTargetDetail.points.length : 0,
          turnCount: currentTargetDetail.turns ? currentTargetDetail.turns.length : 0,
          trajectoryCount: mergedTrajectories.length,
          isLoop: currentTargetDetail.isLoop || false,
          updatedAt: currentTargetDetail.updatedAt
        };
        saveTracksDatabase(stateManager.tracks);
      }

      // 同步更新关联的 sessions
      const sessionsDir = DATA_DIR + '/sessions';
      if (fs.existsSync(sessionsDir)) {
        const sessionFiles = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));
        let updatedCount = 0;
        const targetName = stateManager.tracks[targetTrackId]?.name || currentTargetDetail.name || '未命名赛道';
        sessionFiles.forEach((file) => {
          try {
            const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
            if (session.trackId === sourceTrackId) {
              session.trackId = targetTrackId;
              session.trackName = targetName;
              saveJSON(sessionsDir + '/' + file, session);
              updatedCount++;
              stateManager.incrementSessionCount(targetTrackId);
              stateManager.decrementSessionCount(sourceTrackId);
            }
          } catch (e) {
            // ignore
          }
        });
        if (updatedCount > 0) {
          console.log(`[后台异步] 已将 ${updatedCount} 个会话的赛道关联从 ${sourceTrackId} 合并至 ${targetTrackId}`);
        }
      }

      if (stateManager.io) {
        stateManager.io.emit('trackUpdated', { trackId: targetTrackId, name: stateManager.tracks[targetTrackId]?.name });
      }
    } catch (err) {
      console.error('[后台异步] 合并赛道后台几何计算失败:', err.message);
    }
  });
}));

// 合并相邻弯道并重新计算几何属性
router.post('/:id/turns/merge', express.json(), (req, res) => {
  const { turnIndex } = req.body;
  const id = req.params.id;

  if (turnIndex === undefined || isNaN(turnIndex)) {
    return res.status(400).json({ error: 'turnIndex is required' });
  }

  const trackDetail = readTrackDetail(id);
  if (!trackDetail) return res.status(404).json({ error: 'Track not found' });

  if (!trackDetail.turns || turnIndex < 0 || turnIndex >= trackDetail.turns.length - 1) {
    return res.status(400).json({ error: 'Invalid turnIndex for merging' });
  }

  const t1 = trackDetail.turns[turnIndex];
  const t2 = trackDetail.turns[turnIndex + 1];
  const centerline = trackDetail.centerline;

  if (!centerline || centerline.length === 0) {
    return res.status(400).json({ error: 'Missing centerline data for recalculation' });
  }

  const mergedTurn = calculateTurnAttributes(centerline, t1.startIdx, t2.endIdx, t1.id);
  if (!mergedTurn) {
    return res.status(500).json({ error: 'Failed to calculate merged turn attributes' });
  }

  mergedTurn.customNote = [t1.customNote, t2.customNote].filter(Boolean).join(' | ');
  mergedTurn.isLockedByUser = true;
  mergedTurn.id = t1.id;

  trackDetail.turns.splice(turnIndex, 2, mergedTurn);
  trackDetail.turns.forEach((t, i) => t.id = 'T' + (i + 1));

  const allPoints = [];
  const trajectories = trackDetail.trajectories || (trackDetail.points ? [trackDetail.points] : []);
  trajectories.forEach((traj) => {
    if (traj) allPoints.push(...traj);
  });

  trackDetail.routeBook = buildRouteBook(centerline, trackDetail.turns, allPoints);
  trackDetail.updatedAt = new Date().toISOString();

  writeTrackDetail(id, trackDetail);

  if (req.app.get('stateManager.io')) req.app.get('stateManager.io').emit('trackUpdated', { trackId: id, name: trackDetail.name || stateManager.tracks[id]?.name });
  res.json({ status: 'ok', track: trackDetail });
});

// 更新赛道属性并同步会话
router.put('/:id', express.json(), asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!stateManager.tracks[id]) {
    return res.status(404).json({ error: 'Track not found' });
  }


  let trackDetail = readTrackDetail(id);
  if (!trackDetail) {
    trackDetail = { ...tracks[id] };
  }

  if (req.body.name) {
    const oldName = trackDetail.name;
    const newName = req.body.name;
    trackDetail.name = newName;

    if (oldName !== newName) {
      try {
        const sessionsDir = DATA_DIR + '/sessions';
        if (fs.existsSync(sessionsDir)) {
          const sessionFiles = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));
          let updatedCount = 0;
          sessionFiles.forEach((file) => {
            try {
              const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
              if (session.trackId === id && session.trackName !== newName) {
                session.trackName = newName;
                saveJSON(sessionsDir + '/' + file, session);
                updatedCount++;
              }
            } catch (e) {

              // ignore
            }});
          if (updatedCount > 0) {
            console.log(`赛道改名同步: "${oldName}" -> "${newName}", 已更新 ${updatedCount} 个会话记录`);
          }
        }
      } catch (e) {
        console.error('同步更新 session trackName 失败:', e.message);
      }
    }
  }

  const updatedDetail = { ...trackDetail, ...req.body, updatedAt: new Date().toISOString() };

  writeTrackDetail(id, updatedDetail);

  stateManager.tracks[id] = {
    id,
    name: updatedDetail.name || '未命名赛道',
    length: updatedDetail.length || 0,
    pointCount: updatedDetail.points ? updatedDetail.points.length : 0,
    turnCount: updatedDetail.turns ? updatedDetail.turns.length : 0,
    trajectoryCount: updatedDetail.trajectories ? updatedDetail.trajectories.length : updatedDetail.trajectoryCount || 1,
    createdAt: updatedDetail.createdAt || trackDetail.createdAt || new Date().toISOString(),
    updatedAt: updatedDetail.updatedAt
  };
  saveTracksDatabase(stateManager.tracks);

  stateManager.io.emit('trackUpdated', { trackId: id, name: stateManager.tracks[id].name });

  res.json({ status: 'ok', track: updatedDetail });



}));

// 批量导入历史比赛记录为赛道
router.post('/import-sessions', express.json(), asyncHandler(async (req, res) => {

  const sessionsDir = DATA_DIR + '/sessions';
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));

  let importedCount = 0;
  const results = [];

  files.forEach((file) => {
    try {
      const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));

      if (session.positions && session.positions.length > 10) {
        const trackId = 'track_' + Date.now() + '_' + importedCount;
        const trackName = session.trackName || '未命名赛道_' + importedCount;
        const trackLength = calculateTrackLength(session.positions);

        stateManager.tracks[trackId] = {
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

        session.trackId = trackId;
        saveJSON(sessionsDir + '/' + file, session);

        importedCount++;
        results.push({ sessionId: session.id, trackId, trackName, points: session.positions.length, length: trackLength });
      }
    } catch (e) {
      console.error(`导入 ${file} 失败:`, e.message);
    }
  });

  saveTracksDatabase(stateManager.tracks);

  res.json({
    status: 'ok',
    importedCount,
    results
  });



}));



export default router;
