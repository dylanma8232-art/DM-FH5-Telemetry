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

const router = express.Router();

const selectionSignature = (selections = {}) => Object.entries(selections)
  .map(([slotId, selection]) => [slotId, selection?.optionId || selection?.tier || 'stock'])
  .filter(([, optionId]) => optionId !== 'stock')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([slotId, optionId]) => `${slotId}=${optionId}`)
  .join('|');

function saveCombinationObservation(vehicleId, confirmedPi, estimate, normalizedParts, piConfirmed) {
  if (!piConfirmed || !vehicleId || !Number.isFinite(Number(confirmedPi))) return;
  try {
    sqliteDb.savePiObservation({
      vehicleId,
      signature: selectionSignature(normalizedParts),
      confirmedPi,
      estimatedPi: estimate,
      source: '玩家游戏内实测'
    });
  } catch (err) {
    console.warn('[tunes] 保存 PI 实测观察记录失败:', err.message);
  }
}



const DATA_DIR = stateManager.DATA_DIR;
const upgradesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/upgrades');

const loadUpgradeProfile = vehicleId => {
  const profilePath = path.join(upgradesDir, `${vehicleId}.json`);
  return fs.existsSync(profilePath) ? { ...loadJSON(profilePath), id: String(vehicleId) } : null;
};

import { generateTelemetryTuningRecommendations } from '../services/physics/telemetry-tuning-recommendations.js';

function loadSessionData(sessionId) {
  if (!sessionId) return null;
  const dataDir = stateManager.DATA_DIR || path.join(process.cwd(), 'data');
  const sessionPath = path.join(dataDir, 'sessions', `${sessionId}.json`);
  if (fs.existsSync(sessionPath)) {
    try {
      return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    } catch (e) {
      console.warn('[tunes] 读取 Session 数据失败:', e.message);
    }
  }
  return stateManager.sessions?.find(s => String(s.id) === String(sessionId)) || null;
}

router.post('/:tuneId/ai-diagnosis', express.json(), asyncHandler(async (req, res) => {
  const reqTune = req.body?.tune || stateManager.tunes[req.params.tuneId];
  const rawProblems = req.body?.problems || (req.body?.problem ? [req.body?.problem] : []);
  const problems = rawProblems.filter(p => p && p.name);

  if (problems.length === 0) return res.status(400).json({ error: '请至少选择一个驾驶体验问题。' });

  const vehicleId = reqTune?.vehicleId;
  const vehicle = stateManager.vehicles[vehicleId] || {};
  
  let sessionTelemetryMetrics = null;
  const sessionId = req.body?.sessionId;
  if (sessionId) {
    const session = loadSessionData(sessionId);
    if (session) {
      const rawData = session.data || [];
      const physicsAnalysis = generateTelemetryTuningRecommendations(rawData);
      sessionTelemetryMetrics = {
        track: session.trackName || session.track || '未知赛道',
        bestLap: session.bestLapTime ? `${session.bestLapTime}s` : '有效',
        sensorEvidence: physicsAnalysis.recommendations?.map(r => `【${r.title}】${r.evidence}`) || [],
        summary: physicsAnalysis.summary
      };
    }
  }

  const problemNamesStr = problems.map(p => p.name).join(' + ');

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    const evidenceText = sessionTelemetryMetrics?.sensorEvidence?.length > 0
      ? `• **遥测传感器实测物理证据**：\n  ${sessionTelemetryMetrics.sensorEvidence.join('\n  ')}\n`
      : '• **遥测比赛数据**：未绑定遥测记录（已基于该车已有已调物理参数分析）\n';

    return res.json({
      diagnosis: `🔬 **针对复合驾驶问题「${problemNamesStr}」的赛车工程调校诊断报告**：\n\n` +
        `• **当前已调参数关联**：前/后胎压 ${reqTune?.tires?.frontPressure || '-'}/${reqTune?.tires?.rearPressure || '-'} bar；前/后防倾杆 ${reqTune?.suspension?.frontARB || '-'}/${reqTune?.suspension?.rearARB || '-'}；前/后弹簧 ${reqTune?.suspension?.frontSpring || '-'}/${reqTune?.suspension?.rearSpring || '-'} kgf/mm；差速加速 ${reqTune?.drivetrain?.diffAccel || '-'}%。\n` +
        (sessionTelemetryMetrics ? `• **实测遥测比赛关联**：赛道 [${sessionTelemetryMetrics.track}] (最佳圈速: ${sessionTelemetryMetrics.bestLap})\n` + evidenceText : evidenceText) +
        `• **物理根因剖析**：${problems.map(p => `【${p.name}】${p.description || ''}`).join('；')}\n` +
        `• **对症调整建议**：推荐点击下方「生成拟修正对比预览」查看针对这 ${problems.length} 项问题的综合物理参数调整。`
    });
  }

  const editable = Object.entries({ ...(reqTune?.tires || {}), ...(reqTune?.suspension || {}), ...(reqTune?.drivetrain || {}), ...(reqTune?.brakes || {}), ...(reqTune?.aero || {}) })
    .filter(([, value]) => Number.isFinite(Number(value))).map(([key]) => key);

  const prompt = `【车辆信息】: ${vehicle.name || '未知车型'} (${vehicle.class || ''} ${vehicle.performanceIndex || ''})\n` +
    `【已有调校参数】: ${JSON.stringify(reqTune)}\n` +
    (sessionTelemetryMetrics ? `【赛道遥测传感器解算特征 (实测物理数据)】:\n` +
      `- 赛道名称: ${sessionTelemetryMetrics.track}\n` +
      `- 最佳圈速: ${sessionTelemetryMetrics.bestLap}\n` +
      `- 传感器抓地/悬挂/刹车实测证据:\n  • ${sessionTelemetryMetrics.sensorEvidence.join('\n  • ')}\n` : '【赛道遥测数据】: 玩家未选择绑定遥测比赛记录 (需仅基于已有参数与问题分析)\n') +
    `【玩家反馈的多项复合驾驶现象 (${problems.length}项)】:\n${problems.map((p, i) => `${i + 1}. ${p.name}: ${p.description || ''}`).join('\n')}\n` +
    `【允许建议调整的字段】: ${JSON.stringify(editable)}\n\n` +
    `请作为顶尖 FH5 赛车工程师，严格基于上述已有调校参数${sessionTelemetryMetrics ? '以及赛道遥测传感器的真实物理数据' : ''}，针对玩家选择的这 ${problems.length} 项复合驾驶问题进行权衡与深度物理分析，并给出兼顾这几项症状的权衡参数调整推荐。格式：\n1. 复合现象与物理原因分析\n2. 具体参数调整推荐（字段、当前值、建议值、调整依据）。`;

  const response = await fetch(`${process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.DASHSCOPE_MODEL || 'qwen3.7-plus', temperature: 0.2, messages: [{ role: 'system', content: '你是专业赛车工程调教诊断助手。只评估当前方案参数与遥测传感器特征，不重做改装。' }, { role: 'user', content: prompt }] })
  });

  if (!response.ok) return res.status(response.status).json({ error: `AI 诊断请求失败：${response.statusText}` });
  const json = await response.json();
  res.json({ diagnosis: json.choices?.[0]?.message?.content || 'AI 未返回诊断内容。' });
}));

const nestedTuneKeys = ['tires', 'suspension', 'drivetrain', 'brakes', 'aero'];
const mergeTunePayload = (current, patch) => {
  const merged = { ...current, ...patch };
  for (const key of nestedTuneKeys) merged[key] = { ...(current?.[key] || {}), ...(patch?.[key] || {}) };
  return merged;
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
    generationMode: body.generationMode === 'assisted' ? 'assisted' : (body.generationMode === 'ai' ? 'ai' : 'manual'),
    raceType: body.generationMode === 'ai' ? body.raceType || 'road' : null,
    segmentType: body.generationMode === 'ai' ? body.segmentType || 'balanced' : null,
    driveType: ['fwd', 'rwd', 'awd'].includes(body.driveType) ? body.driveType : validation.resolved.effectiveDriveType,
    createdAt: now,
    updatedAt: now,
    params: body.params || {},
    tires: body.tires || null,
    suspension: body.suspension || null,
    drivetrain: body.drivetrain || null,
    brakes: body.brakes || null,
    aero: body.aero || null,
    parts: validation.normalizedParts,
    tuningCapabilities: body.tuningCapabilities || null
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
  tune.generationMode = candidate.generationMode === 'assisted' ? 'assisted' : (candidate.generationMode === 'ai' ? 'ai' : 'manual');
  tune.raceType = candidate.generationMode === 'ai' ? candidate.raceType || 'road' : null;
  tune.segmentType = candidate.generationMode === 'ai' ? candidate.segmentType || 'balanced' : null;
  if (body.tuningCapabilities !== undefined) tune.tuningCapabilities = body.tuningCapabilities || null;
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
