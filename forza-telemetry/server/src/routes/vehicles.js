import { asyncHandler } from "../utils/asyncHandler.js";import { stateManager } from '../services/state-manager.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import express from 'express';

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


// 获取所有车辆
router.get('/', (req, res) => {
  res.json(stateManager.vehicles);
});

// 更新车辆信息
router.post('/:id', express.json(), asyncHandler(async (req, res) => {

  stateManager.vehicles[req.params.id] = { ...vehicles[req.params.id], ...req.body };
  saveJSON(DATA_DIR + '/stateManager.vehicles.json', stateManager.vehicles);
  res.json({ status: 'ok' });



}));

// 删除车辆信息
router.delete('/:id', asyncHandler(async (req, res) => {

  delete stateManager.vehicles[req.params.id];
  saveJSON(DATA_DIR + '/stateManager.vehicles.json', stateManager.vehicles);
  res.json({ status: 'ok' });



}));



export default router;