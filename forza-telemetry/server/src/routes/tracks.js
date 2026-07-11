import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

export default function(context) {
  const { 
    tracks, 
    saveTracksDatabase, 
    readTrackDetail, 
    writeTrackDetail, 
    deleteTrackDetail,
    detectTurnsEnhanced, 
    generateSectors, 
    buildRouteBook, 
    generateNavigationData, 
    validateTrackQuality, 
    buildTrackFromTrajectories,
    calculateTrackLength,
    simplifyRDP,
    calculateTurnAttributes,
    saveJSON,
    DATA_DIR, 
    stateManager, 
    io 
  } = context;

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
        trackDetail.navigation = generateNavigationData(trackDetail);
        trackDetail.quality = validateTrackQuality(trackDetail);
        
        writeTrackDetail(id, trackDetail);
        console.log(`[自愈合] 成功更新并存盘赛道 ${id} 的弯道和路书数据！`);
        
        if (tracks[id]) {
          tracks[id].turns = turns;
          tracks[id].sectors = trackDetail.sectors;
          tracks[id].routeBook = trackDetail.routeBook;
          tracks[id].quality = trackDetail.quality;
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
    for (const [id, track] of Object.entries(tracks)) {
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
        let track = tracks[id];
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
        trackDetail = tracks[id];
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

    tracks[id] = {
      id,
      name: trackDetail.name,
      length: trackDetail.length,
      pointCount: simplifiedPoints.length,
      turnCount: trackDetail.turns ? trackDetail.turns.length : 0,
      trajectoryCount: trackDetail.trajectoryCount,
      createdAt,
      updatedAt: createdAt
    };
    saveTracksDatabase(tracks);

    res.json({ status: 'ok', id });
  });

  // 删除特定赛道
  router.delete('/:id', (req, res) => {
    const id = req.params.id;
    delete tracks[id];
    saveTracksDatabase(tracks);
    
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
          if (context.clearLeaderboardCache) {
            context.clearLeaderboardCache();
          }
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
      const trackDetail = readTrackDetail(id) || tracks[id];
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
        trackDetail = tracks[id] ? { ...tracks[id] } : null;
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
      trackDetail.navigation = generateNavigationData(trackData);
      trackDetail.routeBook = trackData.routeBook;
      trackDetail.quality = validateTrackQuality(trackDetail);
      trackDetail.updatedAt = new Date().toISOString();

      writeTrackDetail(id, trackDetail);

      if (tracks[id]) {
        tracks[id].length = trackDetail.length;
        tracks[id].pointCount = trackDetail.centerline.length;
        tracks[id].turnCount = trackDetail.turns ? trackDetail.turns.length : 0;
        tracks[id].isLoop = trackDetail.isLoop || false;
        tracks[id].updatedAt = trackDetail.updatedAt;
        saveTracksDatabase(tracks);
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
      let trackDetail = readTrackDetail(id) || tracks[id];
      if (!trackDetail) return res.status(404).json({ error: 'Track not found' });
      if (!trackDetail.turns || !Array.isArray(trackDetail.turns)) return res.status(400).json({ error: 'Track has no turns' });
      
      const idx = parseInt(req.params.index, 10);
      if (isNaN(idx) || idx < 0 || idx >= trackDetail.turns.length) return res.status(400).json({ error: 'Invalid turn index' });
      
      trackDetail.turns[idx].speedHint = req.body.speedHint || '';
      trackDetail.updatedAt = new Date().toISOString();
      
      writeTrackDetail(id, trackDetail);

      tracks[id].updatedAt = trackDetail.updatedAt;
      saveTracksDatabase(tracks);

      res.json({ status: 'ok', turnIndex: idx, speedHint: trackDetail.turns[idx].speedHint });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update speedHint' });
    }
  });

  // 批量更新/编辑弯道与备注路书
  router.put('/:id/turns', express.json(), (req, res) => {
    const id = req.params.id;
    try {
      let trackDetail = readTrackDetail(id) || tracks[id];
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
      
      if (tracks[id]) {
        tracks[id].turnCount = newTurns.length;
        tracks[id].updatedAt = trackDetail.updatedAt;
        saveTracksDatabase(tracks);
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

  // 合并赛道：将源赛道的轨迹合并到目标赛道
  router.post('/merge', express.json(), async (req, res) => {
    const { sourceTrackId, targetTrackId } = req.body;
    
    if (!sourceTrackId || !targetTrackId) {
      return res.status(400).json({ error: 'sourceTrackId and targetTrackId are required' });
    }
    
    if (!tracks[sourceTrackId] || !tracks[targetTrackId]) {
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
        targetDetail.navigation = generateNavigationData(trackData);
      }

      deleteTrackDetail(sourceTrackId);

      writeTrackDetail(targetTrackId, targetDetail);

      delete tracks[sourceTrackId];
      tracks[targetTrackId] = {
        id: targetTrackId,
        name: targetDetail.name || '未命名赛道',
        length: targetDetail.length || 0,
        pointCount: targetDetail.points ? targetDetail.points.length : 0,
        turnCount: targetDetail.turns ? targetDetail.turns.length : 0,
        trajectoryCount: mergedTrajectories.length,
        isLoop: targetDetail.isLoop || false,
        createdAt: targetDetail.createdAt || (tracks[targetTrackId] ? tracks[targetTrackId].createdAt : null) || new Date().toISOString(),
        updatedAt: targetDetail.updatedAt
      };
      saveTracksDatabase(tracks);

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
            if (context.clearLeaderboardCache) {
              context.clearLeaderboardCache();
            }
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
      res.status(500).json({ error: 'Failed to merge tracks' });
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
    
    res.json({ status: 'ok', track: trackDetail });
  });

  // 更新赛道属性并同步会话
  router.put('/:id', express.json(), (req, res) => {
    const id = req.params.id;
    if (!tracks[id]) {
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

      tracks[id] = {
        id,
        name: updatedDetail.name || '未命名赛道',
        length: updatedDetail.length || 0,
        pointCount: updatedDetail.points ? updatedDetail.points.length : 0,
        turnCount: updatedDetail.turns ? updatedDetail.turns.length : 0,
        trajectoryCount: updatedDetail.trajectories ? updatedDetail.trajectories.length : (updatedDetail.trajectoryCount || 1),
        createdAt: updatedDetail.createdAt || trackDetail.createdAt || new Date().toISOString(),
        updatedAt: updatedDetail.updatedAt
      };
      saveTracksDatabase(tracks);

      io.emit('trackUpdated', { trackId: id, name: tracks[id].name });
      
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
            
            tracks[trackId] = {
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
      
      saveTracksDatabase(tracks);
      
      res.json({ 
        status: 'ok', 
        importedCount,
        results
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to import sessions' });
    }
  });

  return router;
}
