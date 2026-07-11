import express from 'express';
import { checkAndAnnounceTurn, resetAnnouncedTurnIndex } from '../services/navigator.js';
import { recognizeTrack } from '../services/track-recognizer.js';

const router = express.Router();

export default function(context) {
  const { 
    tracks, 
    readTrackDetail, 
    io, 
    getTrackMode, 
    setTrackMode, 
    getLastRecognitionResult, 
    setLastRecognitionResult,
    getRecognitionHistory,
    pushToRecognitionHistory
  } = context;

  // 测试播报API
  router.post('/test/announce', express.json(), async (req, res) => {
    const { x, z } = req.body;
    const trackMode = getTrackMode();
    if (!trackMode || !tracks[trackMode.trackId]) {
      return res.json({ error: '未进入赛道模式' });
    }
    const track = tracks[trackMode.trackId];
    if (!track.turns || track.turns.length === 0) {
      return res.json({ error: '赛道无弯道数据' });
    }
    const position = { x: x || 0, y: 100, z: z || 0 };
    console.log(`[测试播报] 模拟位置: (${position.x}, ${position.z})`);
    await checkAndAnnounceTurn(position, track.turns, track.points, { io });
    res.json({ status: 'ok', position, turnCount: track.turns.length });
  });

  // 赛道模式启动
  router.post('/trackMode/start', express.json(), (req, res) => {
    const { trackId } = req.body;
    if (!trackId || !tracks[trackId]) return res.status(400).json({ error: '无效的赛道ID' });
    
    const newMode = { trackId: trackId, trackName: tracks[trackId].name };
    setTrackMode(newMode);
    resetAnnouncedTurnIndex(-1);
    
    const trackDetail = readTrackDetail(trackId);
    const turns = trackDetail?.turns || [];
    
    console.log(`[赛道模式] 已选择赛道: ${newMode.trackName}, 弯道数: ${turns.length}`);
    res.json({ status: 'ok', trackId: trackId, trackName: newMode.trackName, turns: turns });
  });

  // 赛道模式停止
  router.post('/trackMode/stop', (req, res) => {
    setTrackMode(null);
    resetAnnouncedTurnIndex(-1);
    console.log('[赛道模式] 已退出赛道模式');
    res.json({ status: 'ok' });
  });

  // 赛道模式状态
  router.get('/trackMode/status', (req, res) => {
    const trackMode = getTrackMode();
    let turns = [];
    if (trackMode && trackMode.trackId) {
      const trackDetail = readTrackDetail(trackMode.trackId);
      turns = trackDetail?.turns || [];
    }
    res.json({ active: !!trackMode, trackId: trackMode?.trackId || null, trackName: trackMode?.trackName || null, turns });
  });

  // 当前赛道识别结果
  router.get('/trackRecognition/current', (req, res) => {
    res.json({ result: getLastRecognitionResult(), history: getRecognitionHistory() });
  });

  // 确认识别
  router.post('/trackRecognition/confirm', express.json(), (req, res) => {
    const { trackId, isCorrect } = req.body;
    if (!trackId) return res.status(400).json({ error: 'trackId is required' });
    
    if (isCorrect) {
      if (tracks[trackId]) {
        const newMode = { trackId: trackId, trackName: tracks[trackId].name };
        setTrackMode(newMode);
        console.log(`[赛道识别] 用户确认赛道: ${tracks[trackId].name}`);
        io.emit('trackRecognitionConfirmed', { trackId, trackName: tracks[trackId].name, autoEntered: true });
        res.json({ status: 'ok', trackId, trackName: tracks[trackId].name });
      } else {
        res.status(404).json({ error: 'Track not found' });
      }
    } else {
      console.log(`[赛道识别] 用户反馈识别错误: ${trackId}`);
      io.emit('trackRecognitionFeedback', { trackId, correct: false });
      res.json({ status: 'ok', feedback: 'recorded' });
    }
  });

  // 手动选择赛道
  router.post('/trackRecognition/select', express.json(), (req, res) => {
    const { trackId } = req.body;
    if (!trackId || !tracks[trackId]) return res.status(400).json({ error: 'Invalid trackId' });
    
    const newMode = { trackId: trackId, trackName: tracks[trackId].name };
    setTrackMode(newMode);
    resetAnnouncedTurnIndex(-1);
    console.log(`[赛道识别] 手动选择赛道: ${tracks[trackId].name}`);
    io.emit('trackModeChanged', { active: true, trackId, trackName: tracks[trackId].name });
    res.json({ status: 'ok', trackId, trackName: tracks[trackId].name });
  });

  return router;
}
