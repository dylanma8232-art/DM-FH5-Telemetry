import { asyncHandler } from "../utils/asyncHandler.js";import { fileURLToPath } from 'url';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { stateManager } from '../services/state-manager.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import { saveTracksDatabase, readTrackDetail, writeTrackDetail, deleteTrackDetail, loadSession } from '../storage/session-db.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

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


function readDirRecursive(dir) {
  const result = {};
  if (!fs.existsSync(dir)) return result;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      result[item] = readDirRecursive(fullPath);
    } else if (item.endsWith('.json')) {
      try {
        result[item] = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (e) {
        result[item] = null;
      }
    } else if (item.endsWith('.gz') || item.endsWith('.br')) {
      try {
        const buffer = fs.readFileSync(fullPath);
        result[item] = buffer.toString('base64');
      } catch (e) {
        result[item] = null;
      }
    }
  }
  return result;
}

function writeDirRecursive(dir, data) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const [key, value] of Object.entries(data)) {
    const fullPath = path.join(dir, key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (key.endsWith('.json')) {
        fs.writeFileSync(fullPath, JSON.stringify(value, null, 2), 'utf8');
      } else {
        writeDirRecursive(fullPath, value);
      }
    } else if ((key.endsWith('.gz') || key.endsWith('.br')) && typeof value === 'string') {
      fs.writeFileSync(fullPath, Buffer.from(value, 'base64'));
    }
  }
}

router.get('/settings/dashscope-key', (req, res) => {
  res.json({
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    baseUrl: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.DASHSCOPE_MODEL || 'qwen3.7-plus'
  });
});

router.post('/settings/dashscope-key', express.json(), asyncHandler(async (req, res) => {

  const { apiKey, baseUrl, model } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key 不能为空' });

  process.env.DASHSCOPE_API_KEY = apiKey;
  if (baseUrl) process.env.DASHSCOPE_BASE_URL = baseUrl;
  if (model) process.env.DASHSCOPE_MODEL = model;

  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
  let envContent = '';
  if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf8');

  if (envContent.includes('DASHSCOPE_API_KEY=')) {
    envContent = envContent.replace(/DASHSCOPE_API_KEY=.*/, `DASHSCOPE_API_KEY=${apiKey}`);
  } else {
    envContent += `\nDASHSCOPE_API_KEY=${apiKey}`;
  }

  const finalUrl = baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  if (envContent.includes('DASHSCOPE_BASE_URL=')) {
    envContent = envContent.replace(/DASHSCOPE_BASE_URL=.*/, `DASHSCOPE_BASE_URL=${finalUrl}`);
  } else {
    envContent += `\nDASHSCOPE_BASE_URL=${finalUrl}`;
  }

  const finalModel = model || 'qwen3.7-plus';
  if (envContent.includes('DASHSCOPE_MODEL=')) {
    envContent = envContent.replace(/DASHSCOPE_MODEL=.*/, `DASHSCOPE_MODEL=${finalModel}`);
  } else {
    envContent += `\nDASHSCOPE_MODEL=${finalModel}`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  res.json({ status: 'ok' });




}));

router.get('/backup/export', asyncHandler(async (req, res) => {

  const backup = { version: 2, exportedAt: new Date().toISOString(), data: readDirRecursive(DATA_DIR) };
  const jsonStr = JSON.stringify(backup);
  const compressed = await gzipAsync(Buffer.from(jsonStr));
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="fh5_telemetry_backup_${Date.now()}.json.gz"`);
  res.send(compressed);




}));

router.post('/backup/restore', express.raw({ type: '*/*', limit: '100mb' }), asyncHandler(async (req, res) => {

  let data;
  try {
    const decompressed = await gunzipAsync(req.body);
    data = JSON.parse(decompressed.toString());
  } catch (e) {
    data = JSON.parse(req.body.toString());
  }
  if (!data || !data.data) return res.status(400).json({ error: 'Invalid backup file' });

  const backupDir = DATA_DIR + '_backup_' + Date.now();
  fs.mkdirSync(backupDir, { recursive: true });
  writeDirRecursive(backupDir, readDirRecursive(DATA_DIR));
  writeDirRecursive(DATA_DIR, data.data);

  const nextTracks = loadTracksDatabase();
  const nextVehicles = loadJSON(DATA_DIR + '/vehicles.json');
  const nextTunes = loadJSON(DATA_DIR + '/tunes.json');

  stateManager.onRestore(nextTracks, nextVehicles, nextTunes);
  res.json({ success: true, message: '数据恢复成功，原数据已备份至 ' + path.basename(backupDir) });




}));



export default router;