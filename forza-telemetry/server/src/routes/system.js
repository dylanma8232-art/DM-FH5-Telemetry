import { asyncHandler } from "../utils/asyncHandler.js";import { fileURLToPath } from 'url';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { stateManager } from '../services/state-manager.js';
import { loadJSON } from '../utils/helpers.js';
import { loadTracksDatabase } from '../storage/session-db.js';
import { invalidateSummaryCache } from '../storage/session-store.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const router = express.Router();
// A2：settings / backup 各自独立路由器（各自只被 http-app 挂载一次）
export const settingsRouter = express.Router();
export const backupRouter = express.Router();



const getDataDir = () => stateManager.DATA_DIR;

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

function writeDirRecursive(dir, data, baseDir = dir) {
  const resolvedBase = path.resolve(baseDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;

  for (const [key, value] of Object.entries(data)) {
    if (typeof key !== 'string' || !key || key.includes('/') || key.includes('\\') || key.includes('\0') || key.includes('..')) {
      throw new Error(`Invalid or suspicious backup key: ${key}`);
    }
    const fullPath = path.resolve(dir, key);
    const relativeToBase = path.relative(resolvedBase, fullPath);
    if (relativeToBase.startsWith('..') || path.isAbsolute(relativeToBase) || (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase)) {
      throw new Error(`Path traversal attempt blocked: ${key}`);
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (key.endsWith('.json')) {
        fs.writeFileSync(fullPath, JSON.stringify(value, null, 2), 'utf8');
      } else {
        writeDirRecursive(fullPath, value, baseDir);
      }
    } else if ((key.endsWith('.gz') || key.endsWith('.br')) && typeof value === 'string') {
      fs.writeFileSync(fullPath, Buffer.from(value, 'base64'));
    }
  }
}

const getMaskedKey = (key) => key ? (key.length > 4 ? '*'.repeat(key.length - 4) + key.slice(-4) : '****') : '';

const handleGetDashscopeKey = (req, res) => {
  res.json({
    apiKey: getMaskedKey(process.env.DASHSCOPE_API_KEY),
    baseUrl: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.DASHSCOPE_MODEL || 'qwen3.7-plus'
  });
};

const handleSetDashscopeKey = asyncHandler(async (req, res) => {

  let { apiKey, baseUrl, model } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key 不能为空' });

  if (apiKey === getMaskedKey(process.env.DASHSCOPE_API_KEY)) {
    apiKey = process.env.DASHSCOPE_API_KEY;
  }

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




});

const handleBackupExport = asyncHandler(async (req, res) => {

  const dataDir = getDataDir();
  const backup = { version: 2, exportedAt: new Date().toISOString(), data: readDirRecursive(dataDir) };
  const jsonStr = JSON.stringify(backup);
  const compressed = await gzipAsync(Buffer.from(jsonStr));
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="fh5_telemetry_backup_${Date.now()}.json.gz"`);
  res.send(compressed);




});

const ALLOWED_RESTORE_CONTENT_TYPES = [
  'application/octet-stream',
  'application/gzip',
  'application/x-gzip',
  'application/json'
];

const handleBackupRestore = asyncHandler(async (req, res) => {
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!contentType || !ALLOWED_RESTORE_CONTENT_TYPES.includes(contentType)) {
    return res.status(400).json({ error: 'Invalid or missing Content-Type' });
  }

  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Invalid backup request body' });
  }

  let data;
  try {
    const decompressed = await gunzipAsync(req.body);
    data = JSON.parse(decompressed.toString());
  } catch (e) {
    try {
      data = JSON.parse(req.body.toString());
    } catch (e2) {
      return res.status(400).json({ error: 'Invalid backup file' });
    }
  }
  if (!data || !data.data || typeof data.data !== 'object' || Array.isArray(data.data)) {
    return res.status(400).json({ error: 'Invalid backup file' });
  }

  const dataDir = getDataDir();
  const backupDir = dataDir + '_backup_' + Date.now();
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    writeDirRecursive(backupDir, readDirRecursive(dataDir), backupDir);
    writeDirRecursive(dataDir, data.data, dataDir);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Data restore failed' });
  }

  // 整目录恢复后摘要解析缓存必须作废，避免读到恢复前的陈旧解析结果
  invalidateSummaryCache();

  const nextTracks = loadTracksDatabase();
  const nextVehicles = loadJSON(dataDir + '/vehicles.json');
  const nextTunes = loadJSON(dataDir + '/tunes.json');

  stateManager.onRestore(nextTracks, nextVehicles, nextTunes);
  res.json({ success: true, message: '数据恢复成功，原数据已备份至 ' + path.basename(backupDir) });
});

const restoreRawParser = express.raw({ type: ALLOWED_RESTORE_CONTENT_TYPES, limit: '100mb' });

// A2：同一批 handler 只实现一次，分别注册到单职责路由器，避免同一 router 被多次挂载
router.get('/settings/dashscope-key', handleGetDashscopeKey);
router.post('/settings/dashscope-key', express.json(), handleSetDashscopeKey);
router.get('/backup/export', handleBackupExport);
router.post('/backup/restore', restoreRawParser, handleBackupRestore);
settingsRouter.get('/dashscope-key', handleGetDashscopeKey);
settingsRouter.post('/dashscope-key', express.json(), handleSetDashscopeKey);
backupRouter.get('/export', handleBackupExport);
backupRouter.post('/restore', restoreRawParser, handleBackupRestore);

export default router;