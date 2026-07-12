import express from 'express';
import fs from 'fs';
import path from 'path';
import { 
  calculateDrivingLineAnalysis,
  calculateDrivingStyle,
  calculateDetailedStats,
  calculateDrivingScore,
  calculateSectorAnalysis,
  analyzeSectors,
  generateDrivingAdvice,
  getBestLapNum,
  findClosestPoint
} from '../services/physics-analyzer.js';

const router = express.Router();

export default function(context) {
  const { loadSession, tracks, tunes, DATA_DIR, saveJSON, leaderboardCache, setLeaderboardCache } = context;

  // 获取比赛记录列表
  router.get('/api/sessions', (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
      const sessions = files.map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
          const tune = data.tuneId && tunes[data.tuneId] ? tunes[data.tuneId] : null;
          const trackName = (typeof tracks !== 'undefined' && data.trackId && tracks[data.trackId])
            ? tracks[data.trackId].name
            : (data.trackName || '未知赛道');
          return {
            id: data.id,
            filename: f,
            trackName: trackName,
            trackId: data.trackId || null,
            vehicle: data.vehicle || null,
            laps: data.laps || {},
            summary: data.summary || {},
            savedAt: data.savedAt,
            tuneId: data.tuneId || null,
            tuneName: tune ? tune.name : null,
            hasDetail: data.hasDetail ?? false
          };
        } catch (e) {
          return null;
        }
      }).filter(s => s !== null);

      sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      res.json(sessions);
    } catch (e) {
      res.json([]);
    }
  });

  // 获取全赛道最佳圈速与历史排名
  router.get('/api/sessions/leaderboards', (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
      
      const leaderboards = {};
      
      files.forEach(file => {
        try {
          const summary = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
          if (summary.bestLap > 0 && summary.trackId) {
            if (!leaderboards[summary.trackId]) {
              leaderboards[summary.trackId] = [];
            }
            leaderboards[summary.trackId].push({
              sessionId: summary.id,
              carOrdinal: summary.car?.ordinal || 0,
              carClass: summary.car?.class || 0,
              carPI: summary.car?.performanceIndex || 0,
              bestLap: summary.bestLap,
              timestamp: summary.timestamp
            });
          }
        } catch(e) {}
      });
      
      // Sort each track's leaderboard by bestLap ascending
      Object.keys(leaderboards).forEach(trackId => {
        leaderboards[trackId].sort((a, b) => a.bestLap - b.bestLap);
      });
      
      res.json(leaderboards);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch leaderboards' });
    }
  });


  // 获取比赛记录详情
  router.get('/api/sessions/:id', (req, res) => {
    try {
      const session = loadSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load session' });
    }
  });

  // 获取比赛记录的遥测数据
  router.get('/api/sessions/:id/telemetry', (req, res) => {
    try {
      const session = loadSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session.data || []);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load session telemetry' });
    }
  });

  // 删除比赛记录
  router.delete('/api/sessions/:id', (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const summaryPath = path.join(sessionsDir, `${req.params.id}_summary.json`);
      const hifiPath = path.join(sessionsDir, `${req.params.id}_detail_hifi.json.br`);
      const lowfiPath = path.join(sessionsDir, `${req.params.id}_detail_lowfi.json.br`);
      const brPath = path.join(sessionsDir, `${req.params.id}_detail.json.br`);
      const gzPath = path.join(sessionsDir, `${req.params.id}_detail.json.gz`);
      
      let deleted = false;
      if (fs.existsSync(summaryPath)) {
        fs.unlinkSync(summaryPath);
        deleted = true;
      }
      if (fs.existsSync(hifiPath)) {
        fs.unlinkSync(hifiPath);
        deleted = true;
      }
      if (fs.existsSync(lowfiPath)) {
        fs.unlinkSync(lowfiPath);
        deleted = true;
      }
      if (fs.existsSync(brPath)) {
        fs.unlinkSync(brPath);
        deleted = true;
      }
      if (fs.existsSync(gzPath)) {
        fs.unlinkSync(gzPath);
        deleted = true;
      }
      
      if (!deleted) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      if (context.clearLeaderboardCache) {
        context.clearLeaderboardCache();
      }
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // 编辑比赛记录的赛道名称
  router.put('/api/sessions/:id/track', express.json(), (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const filePath = path.join(sessionsDir, `${req.params.id}_summary.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const newTrackName = req.body.trackName;
      if (!newTrackName) {
        return res.status(400).json({ error: 'trackName is required' });
      }
      
      data.trackName = newTrackName;
      if (req.body.trackId) {
        data.trackId = req.body.trackId;
      }
      
      saveJSON(filePath, data);
      res.json({ status: 'ok', trackName: newTrackName });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // 批量更新比赛记录的赛道名称
  router.put('/api/sessions/batch/track', express.json(), (req, res) => {
    try {
      const { sessionIds, trackName, trackId } = req.body;
      if (!sessionIds || !Array.isArray(sessionIds) || !trackName) {
        return res.status(400).json({ error: 'sessionIds array and trackName are required' });
      }
      
      const sessionsDir = DATA_DIR + '/sessions';
      let updatedCount = 0;
      
      sessionIds.forEach(sessionId => {
        const filePath = path.join(sessionsDir, `${sessionId}_summary.json`);
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          data.trackName = trackName;
          if (trackId) data.trackId = trackId;
          saveJSON(filePath, data);
          updatedCount++;
        }
      });
      
      res.json({ status: 'ok', updatedCount });
    } catch (e) {
      res.status(500).json({ error: 'Failed to batch update sessions' });
    }
  });

  return router;
}
