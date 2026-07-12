import { asyncHandler } from "../utils/asyncHandler.js";import { stateManager } from '../services/state-manager.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import express from 'express';
import fs from 'fs';

const router = express.Router();



const DATA_DIR = stateManager.DATA_DIR;
const LEADERBOARD_CACHE_TTL = 30000;

const calculateTrackLength = (pts) => {
  if (!pts || pts.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = (pts[i].y || 0) - (pts[i - 1].y || 0);
    const dz = pts[i].z - pts[i - 1].z;
    len += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return Math.round(len);
};


// 获取所有调校方案
router.get('/', asyncHandler(async (req, res) => {

  const carOrdinal = req.query.carOrdinal ? parseInt(req.query.carOrdinal, 10) : null;
  const result = Object.values(stateManager.tunes).filter((t) => {
    if (carOrdinal !== null && carOrdinal !== undefined && !isNaN(carOrdinal)) {
      return t.carOrdinal === carOrdinal;
    }
    return true;
  });
  res.json(result);



}));

// 设置当前活跃调校
router.post('/active', express.json(), asyncHandler(async (req, res) => {

  const { tuneId } = req.body || {};
  if (tuneId === null || tuneId === undefined) {
    stateManager.setCurrentTuneId(null);
    return res.json({ status: 'ok', currentTuneId: null });
  }
  if (!stateManager.tunes[tuneId]) {
    return res.status(404).json({ error: 'Tune not found' });
  }
  stateManager.setCurrentTuneId(tuneId);
  res.json({ status: 'ok', currentTuneId: tuneId, tune: stateManager.tunes[tuneId] });



}));

// 获取当前活跃调校
router.get('/active', asyncHandler(async (req, res) => {

  const curId = context.getCurrentTuneId ? context.getCurrentTuneId() : stateManager.currentTuneId;
  if (!curId || !stateManager.tunes[curId]) {
    return res.json({ currentTuneId: null, tune: null });
  }
  res.json({ currentTuneId: curId, tune: stateManager.tunes[curId] });



}));

// 调校对比
router.get('/compare', asyncHandler(async (req, res) => {

  const { tuneIdA, tuneIdB, trackId } = req.query;
  if (!tuneIdA || !tuneIdB || !trackId) {
    return res.status(400).json({ error: 'tuneIdA, tuneIdB and trackId are required' });
  }
  const tuneA = stateManager.tunes[tuneIdA];
  const tuneB = stateManager.tunes[tuneIdB];
  if (!tuneA || !tuneB) {
    return res.status(404).json({ error: 'Tune not found' });
  }
  if (tuneA.carOrdinal !== tuneB.carOrdinal) {
    return res.status(400).json({ error: 'Tunes must be for the same car' });
  }

  const sessionsDir = DATA_DIR + '/sessions';
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));
  const carOrdinal = tuneA.carOrdinal;

  const sessionsA = [];
  const sessionsB = [];

  files.forEach((f) => {
    try {
      const data = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
      if (data.trackId !== trackId) return;
      const sessionCarOrdinal = data.vehicle ? data.vehicle.ordinal || data.carOrdinal : null;
      if (sessionCarOrdinal !== carOrdinal) return;
      if (data.tuneId === tuneIdA) {
        sessionsA.push(data);
      } else if (data.tuneId === tuneIdB) {
        sessionsB.push(data);
      }
    } catch (e) {

      // ignore
    }});

  const calcStats = (sessions) => {
    const validLaps = sessions.filter((s) => s.laps && s.laps.best > 0);
    const lapTimes = validLaps.map((s) => s.laps.best);
    const bestLap = lapTimes.length > 0 ? Math.min(...lapTimes) : 0;
    const avgLap = lapTimes.length > 0 ? lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length : 0;
    const totalLaps = sessions.reduce((sum, s) => sum + (s.laps ? s.laps.count || 0 : 0), 0);
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



}));

// 创建新调校
router.post('/', express.json(), asyncHandler(async (req, res) => {

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
    parts: body.parts || null
  };
  stateManager.tunes[tuneId] = tune;
  saveJSON(DATA_DIR + '/stateManager.tunes.json', stateManager.tunes);
  res.json({ status: 'ok', tuneId, tune });



}));

// 获取单个调校详情
router.get('/:tuneId', asyncHandler(async (req, res) => {

  const tune = stateManager.tunes[req.params.tuneId];
  if (!tune) {
    return res.status(404).json({ error: 'Tune not found' });
  }
  res.json(tune);



}));

// 更新调校
router.put('/:tuneId', express.json(), asyncHandler(async (req, res) => {

  const tune = stateManager.tunes[req.params.tuneId];
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
  stateManager.tunes[req.params.tuneId] = tune;
  saveJSON(DATA_DIR + '/stateManager.tunes.json', stateManager.tunes);
  res.json({ status: 'ok', tune });



}));

// 删除调校
router.delete('/:tuneId', asyncHandler(async (req, res) => {

  if (!stateManager.tunes[req.params.tuneId]) {
    return res.status(404).json({ error: 'Tune not found' });
  }
  delete stateManager.tunes[req.params.tuneId];
  saveJSON(DATA_DIR + '/stateManager.tunes.json', stateManager.tunes);
  res.json({ status: 'ok' });



}));



export default router;