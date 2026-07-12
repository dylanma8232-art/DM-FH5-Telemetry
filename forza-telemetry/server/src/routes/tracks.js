import { stateManager } from '../services/state-manager.js';
import { saveTracksDatabase, readTrackDetail, writeTrackDetail as _writeTrackDetail, deleteTrackDetail, loadSession } from '../storage/session-db.js';
import { detectTurnsEnhanced, generateSectors, buildRouteBook, validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';
import { simplifyRDP } from '../utils/rdp.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
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
    const dx = pts[i].x - pts[i-1].x;
    const dy = (pts[i].y || 0) - (pts[i-1].y || 0);
    const dz = pts[i].z - pts[i-1].z;
    len += Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  return Math.round(len);
};

function writeTrackDetail(id, trackDetail) {
  _writeTrackDetail(id, trackDetail);
  const currentMode = stateManager.getTrackMode();
  if (currentMode && currentMode.trackId === id) {
    currentMode.detail = trackDetail;
    stateManager.setTrackMode(currentMode);
    console.log(`[同步] 赛道 ${id} 的最新路书数据已热更新到播报内存`);
  }
}

  // 自动愈合老旧赛道的弯道和路书数据（如果弯道缺失，触发重算并存盘）
  function healTrackIfNeeded(trackDetail, id) {
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
          trackDetail.trajectories.forEach(t => {
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

  // 赛道列表增强 - 从 stateManager 内存快速缓存返回，避免 I/O 带来的严重延迟
  router.get('/', (req, res) => {
    const enriched = {};
    for (const [id, track] of Object.entries(stateManager.tracks)) {
      enriched[id] = {
        ...track,
        sessionCount: stateManager.sessionCounts[id] || 0,
        lastUsedAt: stateManager.lastUsedMap[id] || track.updatedAt || track.createdAt || null
      };
    }
    res.json(enriched);
  });

  // 获取赛道详情 - 从独立小分包文件读取几何坐标点
  router.get('/:id', (req, res) => {
    const id = req.params.id;
    try {
      let trackDetail = readTrackDetail(id);
      if (trackDetail) {
        trackDetail = healTrackIfNeeded(trackDetail, id);
        res.json(trackDetail);
      } else {
        let track = stateManager.tracks[id];
        if (!track) return res.status(404).json({ error: 'Track not found' });
        track = healTrackIfNeeded(track, id);
        res.json(track);
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to read track detail' });
    }
  });

  // 获取赛道导航中线点数据
  router.get('/:id/navigation', (req, res) => {
    const id = req.params.id;
    try {
      let trackDetail = readTrackDetail(id);
      if (trackDetail) {
        trackDetail = healTrackIfNeeded(trackDetail, id);
      } else {
        trackDetail = stateManager.tracks[id];
        if (trackDetail) {
          trackDetail = healTrackIfNeeded(trackDetail, id);
        }
      }
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
        trajectoryCount: trackDetail.trajectories ? trackDetail.trajectories.length : (trackDetail.trajectoryCount || 0)
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read track navigation' });
    }
  });

  // 创建新赛道
  router.post('/', express.json(), (req, res) => {
    const id = 'track_' + Date.now();
    const rawBody = req.body || {};
    const createdAt = new Date().toISOString();
    
    const simplifiedPoints = simplifyRDP(rawBody.points || [], 0.25);

    const trackDetail = {
      id,
      name: rawBody.name || '未命名赛道',
      points: simplifiedPoints,
      pointCount: simplifiedPoints.length,
      length: rawBody.length || 0,
      trajectories: rawBody.trajectories ? rawBody.trajectories.map(t => simplifyRDP(t, 0.25)) : [simplifiedPoints],
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

    res.json({ status: 'ok', id });
  });

  // 删除特定赛道
  router.delete('/:id', (req, res) => {
    const id = req.params.id;
    delete stateManager.tracks[id];
    saveTracksDatabase(stateManager.tracks);
    
    deleteTrackDetail(id);

    try {
      const sessionsDir = DATA_DIR + '/sessions';
      if (fs.existsSync(sessionsDir)) {
        const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
        let deletedCount = 0;
        sessionFiles.forEach(file => {
          try {
            const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
            if (session.trackId === id) {
              const sessionId = session.id;
              const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
              const hifiPath = path.join(sessionsDir, `${sessionId}_detail_hifi.json.br`);
              const lowfiPath = path.join(sessionsDir, `${sessionId}_detail_lowfi.json.br`);
              const brPath = path.join(sessionsDir, `${sessionId}_detail.json.br`);
              const gzPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);
              if (fs.existsSync(summaryPath)) fs.unlinkSync(summaryPath);
              if (fs.existsSync(hifiPath)) fs.unlinkSync(hifiPath);
              if (fs.existsSync(lowfiPath)) fs.unlinkSync(lowfiPath);
              if (fs.existsSync(brPath)) fs.unlinkSync(brPath);
              if (fs.existsSync(gzPath)) fs.unlinkSync(gzPath);
              deletedCount++;
            }
          } catch (e) {
            // ignore
          }
        });
        if (deletedCount > 0) {
          console.log(`已同步删除关联赛道 ${id} 的 ${deletedCount} 个会话记录`);
        }
      }
    } catch (e) {
      console.error('删除赛道关联会话失败:', e.message);
    }

    res.json({ status: 'ok' });
  });

  // 赛道数据质量验证
  router.get('/:id/validate', (req, res) => {
    const id = req.params.id;
    try {
      const trackDetail = readTrackDetail(id) || stateManager.tracks[id];
      if (!trackDetail) return res.status(404).json({ error: 'Track not found' });
      const result = validateTrackQuality(trackDetail);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to validate track' });
    }
  });

  // 重建赛道中心线和弯道数据
  router.post('/:id/rebuild', (req, res) => {
    const id = req.params.id;
    try {
      let trackDetail = readTrackDetail(id);
      if (!trackDetail) {
        trackDetail = stateManager.tracks[id] ? { ...tracks[id] } : null;
      }
      if (!trackDetail) return res.status(404).json({ error: 'Track not found' });

      const availableTrajectories = (trackDetail.trajectories && trackDetail.trajectories.length > 0)
        ? trackDetail.trajectories
        : (trackDetail.points && trackDetail.points.length > 0 ? [trackDetail.points] : null);

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
    } catch (err) {
      console.error(`[重建] 赛道 ${id} 重建失败:`, err.message);
      res.status(500).json({ error: '重建失败: ' + err.message });
    }
  });

  // 更新弯道推荐速度
  router.put('/:id/turns/:index/speedHint', express.json(), (req, res) => {
    const id = req.params.id;
    try {
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
    } catch (err) {
      res.status(500).json({ error: 'Failed to update speedHint' });
    }
  });

  // 批量更新/编辑弯道与备注路书
  router.put('/:id/turns', express.json(), (req, res) => {
    const id = req.params.id;
    try {
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
    } catch (err) {
      console.error('Failed to update turns:', err);
      res.status(500).json({ error: 'Failed to update turns: ' + err.message });
    }
  });


  // 高级编辑器：合并两个相邻的弯道
  router.post('/:id/turns/merge', express.json(), (req, res) => {
    const id = req.params.id;
    try {
      let trackDetail = readTrackDetail(id) || stateManager.tracks[id];
      if (!trackDetail || !trackDetail.turns) return res.status(404).json({ error: 'Track or turns not found' });
      
      const { index1, index2 } = req.body;
      if (index1 === undefined || index2 === undefined || index1 >= index2 || index2 >= trackDetail.turns.length) {
        return res.status(400).json({ error: 'Invalid indices' });
      }

      const t1 = trackDetail.turns[index1];
      const t2 = trackDetail.turns[index2];
      
      const newStartIdx = Math.min(t1.startIdx, t2.startIdx);
      const newEndIdx = Math.max(t1.endIdx, t2.endIdx);
      
      const newTurn = calculateTurnAttributes(trackDetail.centerline, newStartIdx, newEndIdx, t1.id);
      if (!newTurn) return res.status(400).json({ error: 'Failed to calculate merged turn attributes' });

      if (t1.customNote) newTurn.customNote = t1.customNote;
      
      trackDetail.turns.splice(index1, 2, newTurn);
      
       
      const rebuiltRouteBook = buildRouteBook(trackDetail.turns, trackDetail.centerline);
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
    } catch (err) {
      res.status(500).json({ error: 'Failed to merge turns: ' + err.message });
    }
  });

  // 高级编辑器：在顶点拆分一个弯道
  router.post('/:id/turns/split', express.json(), (req, res) => {
    const id = req.params.id;
    try {
      let trackDetail = readTrackDetail(id) || stateManager.tracks[id];
      if (!trackDetail || !trackDetail.turns) return res.status(404).json({ error: 'Track or turns not found' });
      
      const index = parseInt(req.body.turnIndex, 10);
      if (isNaN(index) || index < 0 || index >= trackDetail.turns.length) return res.status(400).json({ error: 'Invalid index' });

      const t = trackDetail.turns[index];
      if (t.endIdx - t.startIdx < 4) {
        return res.status(400).json({ error: 'Turn is too short to split' });
      }

      const apexIndex = req.body.splitIdx != null ? parseInt(req.body.splitIdx, 10) : (t.index != null ? t.index : Math.floor((t.startIdx + t.endIdx) / 2));
      const t1 = calculateTurnAttributes(trackDetail.centerline, t.startIdx, apexIndex - 1, t.id + '_1');
      const t2 = calculateTurnAttributes(trackDetail.centerline, apexIndex, t.endIdx, t.id + '_2');
      
      if (!t1 || !t2) return res.status(400).json({ error: 'Failed to split turn' });

      trackDetail.turns.splice(index, 1, t1, t2);
      
       
      const rebuiltRouteBook = buildRouteBook(trackDetail.turns, trackDetail.centerline);
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
    } catch (err) {
      res.status(500).json({ error: 'Failed to split turn: ' + err.message });
    }
  });

  // 高级编辑器：修改弯道起止边界（拉扯）
  router.put('/:id/turns/:index/bounds', express.json(), (req, res) => {
    const id = req.params.id;
    try {
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
      
       
      const rebuiltRouteBook = buildRouteBook(trackDetail.turns, trackDetail.centerline);
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
    } catch (err) {
      res.status(500).json({ error: 'Failed to adjust bounds: ' + err.message });
    }
  });

  // 合并赛道：将源赛道的轨迹合并到目标赛道
  router.post('/merge', express.json(), async (req, res) => {
    const { sourceTrackId, targetTrackId } = req.body;
    
    if (!sourceTrackId || !targetTrackId) {
      return res.status(400).json({ error: 'sourceTrackId and targetTrackId are required' });
    }
    
    if (!stateManager.tracks[sourceTrackId] || !stateManager.tracks[targetTrackId]) {
      return res.status(404).json({ error: 'Track not found' });
    }

    try {
      let sourceDetail = readTrackDetail(sourceTrackId);
      if (!sourceDetail) {
        sourceDetail = { ...tracks[sourceTrackId] };
      }

      let targetDetail = readTrackDetail(targetTrackId);
      if (!targetDetail) {
        targetDetail = { ...tracks[targetTrackId] };
      }

      const sourceTrajectories = sourceDetail.trajectories || [sourceDetail.points || []];
      const targetTrajectories = targetDetail.trajectories || [targetDetail.points || []];
      const rawMerged = [...targetTrajectories, ...sourceTrajectories];

      const mergedTrajectories = rawMerged.map(traj => simplifyRDP(traj, 0.25));

      const trackData = buildTrackFromTrajectories(mergedTrajectories);

      targetDetail.trajectories = mergedTrajectories;
      targetDetail.trajectoryCount = mergedTrajectories.length;
      targetDetail.updatedAt = new Date().toISOString();

      if (trackData) {
        targetDetail.points = trackData.centerline;
        targetDetail.centerline = trackData.centerline;
        targetDetail.turns = trackData.turns;
        targetDetail.length = trackData.length;
        targetDetail.isLoop = trackData.isLoop || false;
        targetDetail.sectors = generateSectors(trackData.centerline, trackData.turns);
      }

      deleteTrackDetail(sourceTrackId);

      writeTrackDetail(targetTrackId, targetDetail);

      delete stateManager.tracks[sourceTrackId];
      stateManager.tracks[targetTrackId] = {
        id: targetTrackId,
        name: targetDetail.name || '未命名赛道',
        length: targetDetail.length || 0,
        pointCount: targetDetail.points ? targetDetail.points.length : 0,
        turnCount: targetDetail.turns ? targetDetail.turns.length : 0,
        trajectoryCount: mergedTrajectories.length,
        isLoop: targetDetail.isLoop || false,
        createdAt: targetDetail.createdAt || (stateManager.tracks[targetTrackId] ? stateManager.tracks[targetTrackId].createdAt : null) || new Date().toISOString(),
        updatedAt: targetDetail.updatedAt
      };
      saveTracksDatabase(stateManager.tracks);

      try {
        const sessionsDir = DATA_DIR + '/sessions';
        if (fs.existsSync(sessionsDir)) {
          const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
          let updatedCount = 0;
          const targetName = targetDetail.name || '未命名赛道';
          sessionFiles.forEach(file => {
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
            console.log(`已将 ${updatedCount} 个会话的赛道关联从 ${sourceTrackId} 合并至 ${targetTrackId}`);
          }
        }
      } catch (e) {
        console.error('合并赛道同步更新会话失败:', e.message);
      }

      res.json({ 
        status: 'ok', 
        targetTrackId: targetTrackId,
        trajectoryCount: mergedTrajectories.length,
        trackLength: targetDetail.length || 0
      });
    } catch (err) {
      console.error('[Track Merge Route] Failed:', err);
      res.status(500).json({ error: 'Failed to merge stateManager.tracks' });
    }
  });

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
    trajectories.forEach(traj => {
      if (traj) allPoints.push(...traj);
    });
    
    trackDetail.routeBook = buildRouteBook(centerline, trackDetail.turns, allPoints);
    trackDetail.updatedAt = new Date().toISOString();
    
    writeTrackDetail(id, trackDetail);
    
    if (req.app.get('stateManager.io')) req.app.get('stateManager.io').emit('trackUpdated', { trackId: id, name: trackDetail.name || stateManager.tracks[id]?.name });
    res.json({ status: 'ok', track: trackDetail });
  });

  // 更新赛道属性并同步会话
  router.put('/:id', express.json(), (req, res) => {
    const id = req.params.id;
    if (!stateManager.tracks[id]) {
      return res.status(404).json({ error: 'Track not found' });
    }

    try {
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
              const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
              let updatedCount = 0;
              sessionFiles.forEach(file => {
                try {
                  const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
                  if (session.trackId === id && session.trackName !== newName) {
                    session.trackName = newName;
                    saveJSON(sessionsDir + '/' + file, session);
                    updatedCount++;
                  }
                } catch (e) {
                  // ignore
                }
              });
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
        trajectoryCount: updatedDetail.trajectories ? updatedDetail.trajectories.length : (updatedDetail.trajectoryCount || 1),
        createdAt: updatedDetail.createdAt || trackDetail.createdAt || new Date().toISOString(),
        updatedAt: updatedDetail.updatedAt
      };
      saveTracksDatabase(stateManager.tracks);

      stateManager.io.emit('trackUpdated', { trackId: id, name: stateManager.tracks[id].name });
      
      res.json({ status: 'ok', track: updatedDetail });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update track' });
    }
  });

  // 批量导入历史比赛记录为赛道
  router.post('/import-sessions', express.json(), (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
      
      let importedCount = 0;
      const results = [];
      
      files.forEach(file => {
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
    } catch (e) {
      res.status(500).json({ error: 'Failed to import sessions' });
    }
  });

  

export default router;
