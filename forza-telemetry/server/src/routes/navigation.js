
import { stateManager } from '../services/state-manager.js';
import { readTrackDetail, writeTrackDetail, deleteTrackDetail, loadSession } from '../storage/session-db.js';
import express from 'express';

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
