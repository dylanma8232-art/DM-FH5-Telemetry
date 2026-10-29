
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
    res.json({ status: 'ok', trackId: trackId, trackName: newMode.trackName, turns: turns });
  });

  // 赛道模式停止
  router.post('/trackMode/stop', (req, res) => {
    stateManager.setTrackMode(null);

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
