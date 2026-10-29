import { asyncHandler } from "../utils/asyncHandler.js";import { stateManager } from '../services/state-manager.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveUpgradeProfile, resolveTuningCapabilities, solveFormulaBuild, validateBuild, validateTunePayload } from '../services/upgrade-catalog.js';

const router = express.Router();



const DATA_DIR = stateManager.DATA_DIR;
const carsDbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/cars-database.json');
const upgradesMetadataPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/upgrades-metadata.json');
const upgradesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/upgrades');

function loadUpgradeMetadata() {
  const database = fs.existsSync(upgradesMetadataPath) ? loadJSON(upgradesMetadataPath) : {};
  return database?.profiles || {};
}

function loadSingleUpgradeProfile(vehicleId) {
  const profilePath = path.join(upgradesDir, `${vehicleId}.json`);
  return fs.existsSync(profilePath) ? { ...loadJSON(profilePath), id: String(vehicleId) } : null;
}

function getManufacturer(name) {
  const withoutYear = String(name || '').replace(/^\d{4}\s+/, '').trim();
  if (withoutYear.startsWith('Alfa Romeo ')) return 'Alfa Romeo';
  if (withoutYear.startsWith('Mercedes-Benz ')) return 'Mercedes-Benz';
  return withoutYear.split(/\s+/)[0] || '其他';
}


// 获取所有车辆
router.get('/', (req, res) => {
  res.json(stateManager.vehicles);
});

// 游戏内完整车辆目录：客户端据此区分已接收与尚未接收的车辆。
router.get('/catalog', (req, res) => {
  const cars = fs.existsSync(carsDbPath) ? loadJSON(carsDbPath) : {};
  const metadata = loadUpgradeMetadata();
  const catalog = Object.entries(cars).map(([ordinal, name]) => {
    const vMeta = metadata[String(ordinal)] || {};
    const singleProf = loadSingleUpgradeProfile(String(ordinal));
    const basePi = Number(singleProf?.basePi) || Number(vMeta.basePi) || null;
    const baseDriveType = (singleProf?.baseDriveType || vMeta.baseDriveType || 'rwd').toLowerCase();
    return {
      ordinal: String(ordinal),
      name,
      manufacturer: getManufacturer(name),
      basePi,
      baseDriveType
    };
  });
  res.json(catalog);
});

// 选择车辆后解析“通用模板 + 车辆覆盖 + 专属选项 + 当前选择联动”。
router.get('/:id/upgrades', (req, res) => {
  const vehicleId = String(req.params.id);
  const profile = loadSingleUpgradeProfile(vehicleId);
  let selections = {};
  try {
    selections = req.query.selections ? JSON.parse(req.query.selections) : {};
  } catch (_) {
    return res.status(400).json({ error: '改装选择参数格式无效。' });
  }

  // 从元数据或单车 profile 中读取该车辆的原厂基本 PI 和驱动，确保出厂属性不受当前遥测改装影响
  const metadata = loadUpgradeMetadata() || {};
  const meta = metadata[vehicleId] || {};
  const vehicleState = stateManager.vehicles[vehicleId] || {};
  const dynamicDriveType = String(vehicleState.drivetrain || '').toLowerCase();
  
  // 车辆静态原生出厂驱动 (profile -> meta -> vehicleState.baseDriveType -> dynamic -> rwd)
  const stockDrivetrain = (
    profile?.baseDriveType ||
    meta.baseDriveType ||
    vehicleState.baseDriveType ||
    (['fwd', 'rwd', 'awd'].includes(dynamicDriveType) ? dynamicDriveType : 'rwd')
  ).toLowerCase();

  // 当前激活/置换的驱动（允许前端覆盖）
  const driveType = ['fwd', 'rwd', 'awd'].includes(req.query.driveType)
    ? req.query.driveType
    : stockDrivetrain;

  // 基础原厂 PI 严禁写死 || 500；优先 profile 与静态元数据，保底 100
  const basePi = Number(profile?.basePi) || Number(meta.basePi) || Number(vehicleState.basePi) || 100;

  let capabilities = null;
  try {
    capabilities = req.query.capabilities ? JSON.parse(req.query.capabilities) : null;
  } catch (_) {
    return res.status(400).json({ error: '可调项目参数格式无效。' });
  }
  const resolved = resolveUpgradeProfile(profile, selections, { driveType, basePi });
  resolved.stockDrivetrain = stockDrivetrain;
  resolved.baseDriveType = stockDrivetrain;
  resolved.basePi = basePi;
  const capabilityResult = (capabilities && typeof capabilities === 'object')
    ? resolveTuningCapabilities(profile, capabilities, { driveType })
    : null;

  // 能力清单模式中，玩家勾选的项目是唯一权限来源。不能和常规改装
  // 解算结果并集，否则未勾选模块会被重新解锁。
  const tuneParameters = capabilityResult
    ? capabilityResult.tuneParameters
    : (resolved.tuneParameters || []);

  res.json({
    vehicleId,
    ...resolved,
    tuneParameters,
    ...(capabilityResult ? { tuningCapabilities: capabilityResult.capabilities } : {})
  });
});

// 使用与改装卡片完全相同的公式模型求解，避免客户端按静态 PI 自行相加。
router.post('/:id/upgrades/solve', express.json(), (req, res) => {
  const vehicleId = String(req.params.id);
  const profile = loadSingleUpgradeProfile(vehicleId);
  if (!profile) return res.status(404).json({ error: '该车辆缺少改装资料，暂不能自动生成公式方案。' });
  const body = req.body || {};
  const driveType = ['fwd', 'rwd', 'awd'].includes(body.driveType) ? body.driveType : profile.baseDriveType;
  const result = solveFormulaBuild(profile, body.parts || {}, {
    targetPi: body.targetPi,
    raceType: body.raceType || 'road',
    segmentType: body.segmentType,
    driveType
  });
  res.json({ vehicleId, ...result });
});

// 真正的大模型改装推荐：模型只能从当前车辆已解析出的选项 ID 中选择，
// 最终方案仍必须经过本地车辆适配和 PI 校验，不能让模型直接伪造配件或 PI。
router.post('/:id/upgrades/ai-solve', express.json(), asyncHandler(async (req, res) => {
  const vehicleId = String(req.params.id);
  const profile = loadSingleUpgradeProfile(vehicleId);
  if (!profile) return res.status(404).json({ error: '该车辆缺少改装资料，暂不能使用 AI 改装。' });
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return res.status(403).json({ error: '尚未配置 AI 密钥，请先在设置中的 AI 配置里填写。' });

  const body = req.body || {};
  const targetPi = Math.min(999, Number(body.targetPi) || 800);
  const raceType = body.raceType || 'road';
  const driveType = ['fwd', 'rwd', 'awd'].includes(body.driveType) ? body.driveType : profile.baseDriveType;
  const resolved = resolveUpgradeProfile(profile, body.parts || {}, { driveType });
  const trustedPi = new Set(['exact_observed', 'exact_calibrated', 'calibrated_model']);
  const compactSlots = (resolved.slots || []).map(slot => ({
    id: slot.id,
    label: slot.label,
    options: (slot.options || []).filter(option => option.id === 'stock' || (
      option.aiEligible === true && trustedPi.has(option.piConfidence)
    )).map(option => ({
      id: option.id,
      label: option.label,
      performanceScore: option.performanceScore ?? null,
      piEstimate: option.piEstimate ?? null,
      piConfidence: option.piConfidence
    }))
  })).filter(slot => slot.options.length > 1);
  if (!compactSlots.length) {
    return res.status(422).json({ error: '该车尚无 PI 已实测或已校准的可升级配件，AI 不会用公式猜测方案。请手动改装后填写游戏实测 PI。' });
  }
  const baseUrl = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const modelName = process.env.DASHSCOPE_MODEL || 'qwen3.7-plus';
  const prompt = `你是 Forza Horizon 5 改装规划器。请为以下车辆选择目标 PI 内性价比最高的改装组合。
只能使用给出的 slot id 和 option id，禁止创造新 ID；未列出的选项不能选择。
必须输出严格 JSON，不要 Markdown：{"parts":{"slotId":{"optionId":"optionId"}},"reason":"中文简短说明"}
车辆：${profile.name}，原厂 PI：${profile.basePi}，目标 PI：${targetPi}，赛事：${raceType}，驱动：${driveType}
可用选项：${JSON.stringify(compactSlots)}`;
  const apiResponse = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你只负责在给定候选配件中做约束选择。不要估算或编造游戏不存在的配件。' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!apiResponse.ok) return res.status(apiResponse.status).json({ error: `AI 改装请求失败：${apiResponse.statusText}` });
  const json = await apiResponse.json();
  const content = json.choices?.[0]?.message?.content || '';
  let aiPlan;
  try {
    const text = String(content).replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    aiPlan = JSON.parse(text);
  } catch (_) {
    return res.status(502).json({ error: 'AI 返回的改装方案不是有效 JSON，未应用任何配件。' });
  }
  const requestedParts = aiPlan?.parts && typeof aiPlan.parts === 'object' ? aiPlan.parts : {};
  const allowed = new Map((resolved.slots || []).map(slot => [slot.id, new Set((slot.options || []).map(option => option.id))]));
  const normalizedParts = {};
  for (const [slotId, selection] of Object.entries(requestedParts)) {
    const optionId = selection?.optionId || selection?.tier;
    if (!allowed.has(slotId) || !allowed.get(slotId).has(optionId)) {
      return res.status(422).json({ error: `AI 选择了车辆不可用的配件：${slotId}/${optionId || '空值'}。` });
    }
    if (optionId !== 'stock') normalizedParts[slotId] = { optionId };
  }
  const finalResolved = resolveUpgradeProfile(profile, normalizedParts, { driveType });
  const predictedPi = Number(finalResolved.prediction?.totalPi);
  const upperPi = Number(finalResolved.prediction?.maxPi ?? predictedPi);
  if (!Number.isFinite(predictedPi) || !Number.isFinite(upperPi) || upperPi > targetPi) {
    return res.status(422).json({ error: `AI 方案未满足目标 PI：预测 ${predictedPi}，保守上限 ${upperPi}，目标 ${targetPi}。请重新生成或降低目标。` });
  }
  res.json({
    vehicleId,
    parts: finalResolved.effectiveSelections,
    prediction: finalResolved.prediction,
    slots: finalResolved.slots,
    targetPi,
    withinTarget: true,
    solverStatus: 'ai_validated',
    aiReason: String(aiPlan.reason || '')
  });
}));

router.post('/:id/upgrades/validate', express.json(), (req, res) => {
  const profile = loadSingleUpgradeProfile(String(req.params.id));
  const body = req.body || {};
  const hasTunePayload = ['tires', 'suspension', 'drivetrain', 'brakes', 'aero', 'generationMode', 'targetPi'].some(key => body[key] !== undefined);
  const result = hasTunePayload ? validateTunePayload(profile, body) : validateBuild(profile, body.parts || {});
  res.status(result.valid ? 200 : 422).json(result);
});

// 更新车辆信息
router.post('/:id', express.json(), asyncHandler(async (req, res) => {
  stateManager.vehicles[req.params.id] = { ...stateManager.vehicles[req.params.id], ...req.body };
  saveJSON(DATA_DIR + '/vehicles.json', stateManager.vehicles);
  res.json({ status: 'ok' });
}));

// 删除车辆信息
router.delete('/:id', asyncHandler(async (req, res) => {
  delete stateManager.vehicles[req.params.id];
  saveJSON(DATA_DIR + '/vehicles.json', stateManager.vehicles);
  res.json({ status: 'ok' });
}));



export default router;
