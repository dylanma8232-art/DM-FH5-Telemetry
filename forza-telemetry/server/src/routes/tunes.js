import { asyncHandler } from '../utils/asyncHandler.js';
import { stateManager } from '../services/state-manager.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import { validateTunePayload } from '../services/upgrade-catalog.js';
import { saveTuneSchema, formatZodError } from '../utils/schemas.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sqliteDb } from '../storage/sqlite-db.js';
import { predictBuildPi } from '../services/pi-model.js';
import { resolveUpgradeProfile } from '../services/upgrade-catalog.js';

const router = express.Router();

const selectionSignature = (selections = {}) => Object.entries(selections)
  .map(([slotId, selection]) => [slotId, selection?.optionId || selection?.tier || 'stock'])
  .filter(([, optionId]) => optionId !== 'stock')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([slotId, optionId]) => `${slotId}=${optionId}`)
  .join('|');

function saveCombinationObservation(vehicleId, confirmedPi, estimate, normalizedParts, piConfirmed) {
  if (!piConfirmed || !vehicleId || !Number.isFinite(Number(confirmedPi))) return;
  sqliteDb.savePiObservation({
    vehicleId,
    signature: selectionSignature(normalizedParts),
    confirmedPi,
    estimatedPi: estimate,
    source: '玩家游戏内实测'
  });
}



const DATA_DIR = stateManager.DATA_DIR;
const LEADERBOARD_CACHE_TTL = 30000;
const upgradesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/upgrades');

const loadUpgradeProfile = vehicleId => {
  const profilePath = path.join(upgradesDir, `${vehicleId}.json`);
  return fs.existsSync(profilePath) ? { ...loadJSON(profilePath), id: String(vehicleId) } : null;
};

const nestedTuneKeys = ['tires', 'suspension', 'drivetrain', 'brakes', 'aero'];
const mergeTunePayload = (current, patch) => {
  const merged = { ...current, ...patch };
  for (const key of nestedTuneKeys) merged[key] = { ...(current?.[key] || {}), ...(patch?.[key] || {}) };
  return merged;
};

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

  const parsed = saveTuneSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: '数据格式校验失败', errors: formatZodError(parsed.error) });
  }
  const body = parsed.data;
  const validation = validateTunePayload(loadUpgradeProfile(body.vehicleId), body);
  if (!validation.valid) return res.status(422).json({ error: '改装或调教校验失败', errors: validation.errors, warnings: validation.warnings });

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
    basePi: validation.computed.basePi,
    targetPi: body.generationMode === 'ai' ? body.targetPi : null,
    totalPi: validation.computed.confirmedPi,
    estimatedPi: validation.computed.unknownPiCount ? null : validation.computed.estimate,
    piUpperEstimate: validation.computed.upperEstimate,
    piStatus: validation.computed.status,
    piConfirmed: body.piConfirmed === true,
    validationWarnings: validation.warnings,
    generationMode: body.generationMode === 'ai' ? 'ai' : 'manual',
    raceType: body.generationMode === 'ai' ? body.raceType || 'road' : null,
    driveType: ['fwd', 'rwd', 'awd'].includes(body.driveType) ? body.driveType : validation.resolved.effectiveDriveType,
    createdAt: now,
    updatedAt: now,
    params: body.params || {},
    tires: body.tires || null,
    suspension: body.suspension || null,
    drivetrain: body.drivetrain || null,
    brakes: body.brakes || null,
    aero: body.aero || null,
    parts: validation.normalizedParts
  };

  // 触发 PI 增量自学习校准
  saveCombinationObservation(
    body.vehicleId, 
    validation.computed.confirmedPi, 
    validation.computed.estimate, 
    validation.normalizedParts,
    body.piConfirmed
  );

  stateManager.tunes[tuneId] = tune;
  saveJSON(DATA_DIR + '/tunes.json', stateManager.tunes);
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
  const parsed = saveTuneSchema.partial().safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: '数据格式校验失败', errors: formatZodError(parsed.error) });
  }
  const body = parsed.data;
  const candidate = mergeTunePayload(tune, body);
  const validation = validateTunePayload(loadUpgradeProfile(candidate.vehicleId), candidate);
  if (!validation.valid) return res.status(422).json({ error: '改装或调教校验失败', errors: validation.errors, warnings: validation.warnings });
  if (body.name !== undefined) tune.name = body.name;
  if (body.description !== undefined) tune.description = body.description;
  if (body.tags !== undefined) tune.tags = body.tags;
  if (body.carOrdinal !== undefined) tune.carOrdinal = body.carOrdinal;
  if (body.vehicleId !== undefined) {
    tune.vehicleId = body.vehicleId;
    tune.carOrdinal = body.vehicleId;
  }
  tune.basePi = validation.computed.basePi;
  tune.targetPi = candidate.generationMode === 'ai' ? candidate.targetPi : null;
  tune.totalPi = validation.computed.confirmedPi;
  tune.estimatedPi = validation.computed.unknownPiCount ? null : validation.computed.estimate;
  tune.piUpperEstimate = validation.computed.upperEstimate;
  tune.piStatus = validation.computed.status;
  if (body.piConfirmed !== undefined) tune.piConfirmed = body.piConfirmed === true;
  tune.validationWarnings = validation.warnings;
  tune.generationMode = candidate.generationMode === 'ai' ? 'ai' : 'manual';
  tune.raceType = candidate.generationMode === 'ai' ? candidate.raceType || 'road' : null;
  tune.driveType = ['fwd', 'rwd', 'awd'].includes(candidate.driveType) ? candidate.driveType : validation.resolved.effectiveDriveType;
  if (body.params !== undefined) tune.params = body.params;
  if (body.tires !== undefined) tune.tires = body.tires;
  if (body.suspension !== undefined) tune.suspension = body.suspension;
  if (body.drivetrain !== undefined) tune.drivetrain = body.drivetrain;
  if (body.brakes !== undefined) tune.brakes = body.brakes;
  if (body.aero !== undefined) tune.aero = body.aero;
  if (body.parts !== undefined) tune.parts = body.parts;
  if (body.notes !== undefined) tune.notes = body.notes;
  if (body.freeMode !== undefined) tune.freeMode = body.freeMode;
  tune.parts = validation.normalizedParts;
  tune.updatedAt = new Date().toISOString();
  
  // 触发 PI 增量自学习校准
  saveCombinationObservation(
    tune.vehicleId, 
    validation.computed.confirmedPi, 
    validation.computed.estimate, 
    validation.normalizedParts,
    candidate.piConfirmed === true
  );

  stateManager.tunes[req.params.tuneId] = tune;
  saveJSON(DATA_DIR + '/tunes.json', stateManager.tunes);
  res.json({ status: 'ok', tune });



}));

// 删除调校
router.delete('/:tuneId', asyncHandler(async (req, res) => {

  if (!stateManager.tunes[req.params.tuneId]) {
    return res.status(404).json({ error: 'Tune not found' });
  }
  delete stateManager.tunes[req.params.tuneId];
  saveJSON(DATA_DIR + '/tunes.json', stateManager.tunes);
  res.json({ status: 'ok' });



}));



export default router;
