import { asyncHandler } from "../utils/asyncHandler.js";import { stateManager } from '../services/state-manager.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveUpgradeProfile, validateBuild, validateTunePayload } from '../services/upgrade-catalog.js';

const router = express.Router();



const DATA_DIR = stateManager.DATA_DIR;
const LEADERBOARD_CACHE_TTL = 30000;
const carsDbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/cars-database.json');
const upgradesMetadataPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/upgrades-metadata.json');
const upgradesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/upgrades');

function loadUpgradeMetadata() {
  const database = fs.existsSync(upgradesMetadataPath) ? loadJSON(upgradesMetadataPath) : {};
  return database?.profiles || {};
}

function loadSingleUpgradeProfile(vehicleId) {
  const profilePath = path.join(upgradesDir, `${vehicleId}.json`);
  return fs.existsSync(profilePath) ? loadJSON(profilePath) : null;
}

function getManufacturer(name) {
  const withoutYear = String(name || '').replace(/^\d{4}\s+/, '').trim();
  if (withoutYear.startsWith('Alfa Romeo ')) return 'Alfa Romeo';
  if (withoutYear.startsWith('Mercedes-Benz ')) return 'Mercedes-Benz';
  return withoutYear.split(/\s+/)[0] || '其他';
}

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


// 获取所有车辆
router.get('/', (req, res) => {
  res.json(stateManager.vehicles);
});

// 游戏内完整车辆目录：客户端据此区分已接收与尚未接收的车辆。
router.get('/catalog', (req, res) => {
  const cars = fs.existsSync(carsDbPath) ? loadJSON(carsDbPath) : {};
  const metadata = loadUpgradeMetadata();
  const catalog = Object.entries(cars).map(([ordinal, name]) => ({
    ordinal: String(ordinal),
    name,
    manufacturer: getManufacturer(name),
    basePi: Number.isFinite(Number(metadata[String(ordinal)]?.basePi)) && Number(metadata[String(ordinal)]?.basePi) > 0
      ? Number(metadata[String(ordinal)].basePi)
      : null
  }));
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

  // 从元数据中读取该车辆的默认基本PI和驱动，用作fallback上下文
  const metadata = loadUpgradeMetadata() || {};
  const meta = metadata[vehicleId] || {};
  
  const driveType = ['fwd', 'rwd', 'awd'].includes(req.query.driveType)
    ? req.query.driveType
    : (meta.baseDriveType || 'awd').toLowerCase();

  const basePi = Number(meta.basePi) || 500;

  res.json({
    vehicleId,
    ...resolveUpgradeProfile(profile, selections, { driveType, basePi })
  });
});

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
