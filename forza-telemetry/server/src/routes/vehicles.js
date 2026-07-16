import { asyncHandler } from "../utils/asyncHandler.js";import { stateManager } from '../services/state-manager.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();



const DATA_DIR = stateManager.DATA_DIR;
const LEADERBOARD_CACHE_TTL = 30000;
const carsDbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/cars-database.json');

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
  const catalog = Object.entries(cars).map(([ordinal, name]) => ({
    ordinal: String(ordinal),
    name,
    manufacturer: getManufacturer(name)
  }));
  res.json(catalog);
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
