
import { stateManager } from '../services/state-manager.js';
import { readTrackDetail } from '../storage/session-db.js';
import express from 'express';

const router = express.Router();


  




  // 赛道模式启动
  router.post('/trackMode/start', express.json(), (req, res) => {
    const { trackId } = req.body;
    if (!trackId || !stateManager.tracks[trackId]) return res.status(400).json({ error: '无效的赛道ID' });
    
    const trackDetail = readTrackDetail(trackId);
    const newMode = { trackId: trackId, trackName: stateManager.tracks[trackId].name, detail: trackDetail };
    stateManager.setTrackMode(newMode);

    
    const turns = trackDetail?.turns || [];
    
    console.log(`[赛道模式] 已选择赛道: ${newMode.trackName}, 弯道数: ${turns.length}`);
    // B11：补发 WS 广播，让仪表盘/路书与其它标签页无需刷新即可感知（与 record.js 的载荷形状一致）
    if (stateManager.io) {
      stateManager.io.emit('trackModeChanged', { active: true, trackId, trackName: newMode.trackName });
    }
    res.json({ status: 'ok', trackId: trackId, trackName: newMode.trackName, turns: turns });
  });

  // 赛道模式停止
  router.post('/trackMode/stop', (req, res) => {
    stateManager.setTrackMode(null);

    // B11：补发 WS 广播（载荷与 record.js 停止录制时的形状一致）
    if (stateManager.io) {
      stateManager.io.emit('trackModeChanged', { active: false, trackId: null, trackName: null });
    }
    console.log('[赛道模式] 已退出赛道模式');
    res.json({ status: 'ok' });
  });

  // 赛道模式状态
  router.get('/trackMode/status', (req, res) => {
    const trackMode = stateManager.getTrackMode();
    let turns = [];
    if (trackMode && trackMode.trackId) {
      const trackDetail = readTrackDetail(trackMode.trackId);
      turns = trackDetail?.turns || [];
    }
    res.json({ active: !!trackMode, trackId: trackMode?.trackId || null, trackName: trackMode?.trackName || null, turns });
  });



  

export default router;
