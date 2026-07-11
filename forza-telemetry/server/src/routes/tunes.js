import express from 'express';
import fs from 'fs';

const router = express.Router();

export default function(context) {
  const { tunes, saveJSON, DATA_DIR, currentTuneId, setCurrentTuneId } = context;

  // 获取所有调校方案
  router.get('/', (req, res) => {
    try {
      const carOrdinal = req.query.carOrdinal ? parseInt(req.query.carOrdinal, 10) : null;
      const result = Object.values(tunes).filter(t => {
        if (carOrdinal !== null && carOrdinal !== undefined && !isNaN(carOrdinal)) {
          return t.carOrdinal === carOrdinal;
        }
        return true;
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load tunes' });
    }
  });

  // 设置当前活跃调校
  router.post('/active', express.json(), (req, res) => {
    try {
      const { tuneId } = req.body || {};
      if (tuneId === null || tuneId === undefined) {
        setCurrentTuneId(null);
        return res.json({ status: 'ok', currentTuneId: null });
      }
      if (!tunes[tuneId]) {
        return res.status(404).json({ error: 'Tune not found' });
      }
      setCurrentTuneId(tuneId);
      res.json({ status: 'ok', currentTuneId: tuneId, tune: tunes[tuneId] });
    } catch (e) {
      res.status(500).json({ error: 'Failed to set active tune' });
    }
  });

  // 获取当前活跃调校
  router.get('/active', (req, res) => {
    try {
      const curId = context.getCurrentTuneId ? context.getCurrentTuneId() : currentTuneId;
      if (!curId || !tunes[curId]) {
        return res.json({ currentTuneId: null, tune: null });
      }
      res.json({ currentTuneId: curId, tune: tunes[curId] });
    } catch (e) {
      res.status(500).json({ error: 'Failed to get active tune' });
    }
  });

  // 调校对比
  router.get('/compare', (req, res) => {
    try {
      const { tuneIdA, tuneIdB, trackId } = req.query;
      if (!tuneIdA || !tuneIdB || !trackId) {
        return res.status(400).json({ error: 'tuneIdA, tuneIdB and trackId are required' });
      }
      const tuneA = tunes[tuneIdA];
      const tuneB = tunes[tuneIdB];
      if (!tuneA || !tuneB) {
        return res.status(404).json({ error: 'Tune not found' });
      }
      if (tuneA.carOrdinal !== tuneB.carOrdinal) {
        return res.status(400).json({ error: 'Tunes must be for the same car' });
      }

      const sessionsDir = DATA_DIR + '/sessions';
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
      const carOrdinal = tuneA.carOrdinal;

      const sessionsA = [];
      const sessionsB = [];

      files.forEach(f => {
        try {
          const data = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
          if (data.trackId !== trackId) return;
          const sessionCarOrdinal = data.vehicle ? (data.vehicle.ordinal || data.carOrdinal) : null;
          if (sessionCarOrdinal !== carOrdinal) return;
          if (data.tuneId === tuneIdA) {
            sessionsA.push(data);
          } else if (data.tuneId === tuneIdB) {
            sessionsB.push(data);
          }
        } catch (e) {
          // ignore
        }
      });

      const calcStats = (sessions) => {
        const validLaps = sessions.filter(s => s.laps && s.laps.best > 0);
        const lapTimes = validLaps.map(s => s.laps.best);
        const bestLap = lapTimes.length > 0 ? Math.min(...lapTimes) : 0;
        const avgLap = lapTimes.length > 0 ? lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length : 0;
        const totalLaps = sessions.reduce((sum, s) => sum + (s.laps ? (s.laps.count || 0) : 0), 0);
        return {
          sessionCount: sessions.length,
          bestLap: bestLap > 0 ? Number(bestLap.toFixed(3)) : 0,
          avgLap: avgLap > 0 ? Number(avgLap.toFixed(3)) : 0,
          totalLaps
        };
      };

      res.json({
        status: 'ok',
        trackId,
        carOrdinal,
        tuneA: {
          tuneId: tuneIdA,
          name: tuneA.name,
          ...calcStats(sessionsA)
        },
        tuneB: {
          tuneId: tuneIdB,
          name: tuneB.name,
          ...calcStats(sessionsB)
        }
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to compare tunes' });
    }
  });

  // 创建新调校
  router.post('/', express.json(), (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const tuneId = 'tune_' + Date.now();
      const now = new Date().toISOString();
      const tune = {
        tuneId,
        id: tuneId,
        name: body.name,
        description: body.description || '',
        tags: body.tags || [],
        carOrdinal: body.carOrdinal || body.vehicleId || null,
        vehicleId: body.vehicleId || null,
        createdAt: now,
        updatedAt: now,
        params: body.params || {},
        tires: body.tires || null,
        suspension: body.suspension || null,
        drivetrain: body.drivetrain || null,
        aero: body.aero || null,
        parts: body.parts || null,
      };
      tunes[tuneId] = tune;
      saveJSON(DATA_DIR + '/tunes.json', tunes);
      res.json({ status: 'ok', tuneId, tune });
    } catch (e) {
      res.status(500).json({ error: 'Failed to create tune' });
    }
  });

  // 获取单个调校详情
  router.get('/:tuneId', (req, res) => {
    try {
      const tune = tunes[req.params.tuneId];
      if (!tune) {
        return res.status(404).json({ error: 'Tune not found' });
      }
      res.json(tune);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load tune' });
    }
  });

  // 更新调校
  router.put('/:tuneId', express.json(), (req, res) => {
    try {
      const tune = tunes[req.params.tuneId];
      if (!tune) {
        return res.status(404).json({ error: 'Tune not found' });
      }
      const body = req.body || {};
      if (body.name !== undefined) tune.name = body.name;
      if (body.description !== undefined) tune.description = body.description;
      if (body.tags !== undefined) tune.tags = body.tags;
      if (body.carOrdinal !== undefined) tune.carOrdinal = body.carOrdinal;
      if (body.vehicleId !== undefined) {
        tune.vehicleId = body.vehicleId;
        tune.carOrdinal = body.vehicleId;
      }
      if (body.params !== undefined) tune.params = body.params;
      if (body.tires !== undefined) tune.tires = body.tires;
      if (body.suspension !== undefined) tune.suspension = body.suspension;
      if (body.drivetrain !== undefined) tune.drivetrain = body.drivetrain;
      if (body.aero !== undefined) tune.aero = body.aero;
      if (body.parts !== undefined) tune.parts = body.parts;
      tune.updatedAt = new Date().toISOString();
      tunes[req.params.tuneId] = tune;
      saveJSON(DATA_DIR + '/tunes.json', tunes);
      res.json({ status: 'ok', tune });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update tune' });
    }
  });

  // 删除调校
  router.delete('/:tuneId', (req, res) => {
    try {
      if (!tunes[req.params.tuneId]) {
        return res.status(404).json({ error: 'Tune not found' });
      }
      delete tunes[req.params.tuneId];
      saveJSON(DATA_DIR + '/tunes.json', tunes);
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete tune' });
    }
  });

  return router;
}
