import { asyncHandler } from "../utils/asyncHandler.js";import { fileURLToPath } from 'url';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { stateManager } from '../services/state-manager.js';
import { loadJSON } from '../utils/helpers.js';
import { loadTracksDatabase } from '../storage/session-db.js';
import { invalidateSummaryCache } from '../storage/session-store.js';
import { sqliteDb } from '../storage/sqlite-db.js';
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  getAiConfig,
  isLocalAiEndpoint,
  normalizeBaseUrl,
  testAiConnection
} from '../services/ai-client.js';
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
    } else if (item.endsWith('.gz') || item.endsWith('.br') || item.endsWith('.db')) {
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
    } else if ((key.endsWith('.gz') || key.endsWith('.br') || key.endsWith('.db')) && typeof value === 'string') {
      fs.writeFileSync(fullPath, Buffer.from(value, 'base64'));
    }
  }
}

function isLocalAddress(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const cleanIp = ip.replace(/^::ffff:/, '');
  return cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('127.');
}

function isLocalRequest(req) {
  const remoteAddr = req.socket?.remoteAddress || req.connection?.remoteAddress;
  return isLocalAddress(remoteAddr);
}

const getMaskedKey = (key) => key ? (key.length > 4 ? '*'.repeat(key.length - 4) + key.slice(-4) : '****') : '';

const handleGetAiConfig = (req, res) => {
  const { apiKey, baseUrl, model } = getAiConfig();
  res.json({
    apiKey: getMaskedKey(apiKey),
    baseUrl,
    model
  });
};

const upsertEnvVar = (content, key, value) => {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, `${key}=${value}`);
  }
  return content ? `${content.replace(/\n+$/, '')}\n${key}=${value}\n` : `${key}=${value}\n`;
};

const handleSetAiConfig = asyncHandler(async (req, res) => {
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: '仅允许从本地访问修改配置' });
  }

  let { apiKey, baseUrl, model } = req.body || {};

  const containsNewline = (str) => typeof str === 'string' && (/[\r\n]/.test(str));
  if (containsNewline(apiKey) || containsNewline(baseUrl) || containsNewline(model)) {
    return res.status(400).json({ error: '参数不能包含换行符' });
  }

  if (baseUrl) {
    try {
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'baseUrl 必须使用 http 或 https 协议' });
      }
    } catch {
      return res.status(400).json({ error: 'baseUrl 格式不合法' });
    }
  }

  const currentConfig = getAiConfig();
  const currentKey = currentConfig.apiKey;
  const currentMasked = getMaskedKey(currentKey);
  const currentBaseUrl = currentConfig.baseUrl;
  const finalUrl = baseUrl ? normalizeBaseUrl(baseUrl) : currentBaseUrl || DEFAULT_AI_BASE_URL;
  const isLocalModel = isLocalAiEndpoint(finalUrl);

  const rawKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const isMaskedKey = rawKey !== '' && (rawKey === currentMasked || rawKey.includes('*'));

  if (isMaskedKey) {
    if (baseUrl && finalUrl !== currentBaseUrl) {
      return res.status(400).json({ error: '修改 baseUrl 时必须提供真实完整 Key' });
    }
    apiKey = currentKey;
  } else {
    apiKey = rawKey;
  }

  if (!apiKey && !isLocalModel) {
    return res.status(400).json({ error: 'API Key 不能为空' });
  }

  const finalModel = (typeof model === 'string' && model.trim()) ? model.trim() : (currentConfig.model || DEFAULT_AI_MODEL);

  process.env.AI_API_KEY = apiKey;
  process.env.AI_BASE_URL = finalUrl;
  process.env.AI_MODEL = finalModel;
  process.env.DASHSCOPE_API_KEY = apiKey;
  process.env.DASHSCOPE_BASE_URL = finalUrl;
  process.env.DASHSCOPE_MODEL = finalModel;

  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
  let envContent = '';
  if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf8');

  envContent = upsertEnvVar(envContent, 'AI_API_KEY', apiKey);
  envContent = upsertEnvVar(envContent, 'AI_BASE_URL', finalUrl);
  envContent = upsertEnvVar(envContent, 'AI_MODEL', finalModel);
  envContent = upsertEnvVar(envContent, 'DASHSCOPE_API_KEY', apiKey);
  envContent = upsertEnvVar(envContent, 'DASHSCOPE_BASE_URL', finalUrl);
  envContent = upsertEnvVar(envContent, 'DASHSCOPE_MODEL', finalModel);

  fs.writeFileSync(envPath, envContent, 'utf8');
  res.json({ status: 'ok' });
});

const handleTestAiConfig = asyncHandler(async (req, res) => {
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: '仅允许从本地访问测试配置' });
  }

  const body = req.body || {};
  const asText = (value) => (typeof value === 'string' ? value.trim() : '');

  const overrides = {
    apiKey: asText(body.apiKey),
    baseUrl: asText(body.baseUrl),
    model: asText(body.model)
  };

  if (overrides.baseUrl) {
    try {
      const parsedUrl = new URL(overrides.baseUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: '端点必须使用 http 或 https 协议' });
      }
    } catch {
      return res.status(400).json({ error: '端点地址格式不合法' });
    }
  }

  try {
    const result = await testAiConnection({ overrides });
    res.json({ status: 'ok', ...result });
  } catch (err) {
    console.warn('[AI 自检] 连通性测试失败:', err.message);
    res.json({
      status: 'error',
      error: err.message || '连通性测试失败',
      code: err.code || null,
      httpStatus: err.status || null
    });
  }
});

const handleBackupExport = asyncHandler(async (req, res) => {
  sqliteDb.checkpoint();
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
  const contentType = (req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
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

  // 1. 刷写 WAL 并安全关闭 SQLite 连接
  sqliteDb.checkpoint();
  sqliteDb.close();

  // 2. 将当前 dataDir 内容备份至 backupDir，并安全写入恢复数据
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    writeDirRecursive(backupDir, readDirRecursive(dataDir), backupDir);

    // 3. 清理 dataDir 下已有的旧 SQLite 数据库及日志文件
    const oldDb = path.join(dataDir, 'telemetry.db');
    const oldWal = path.join(dataDir, 'telemetry.db-wal');
    const oldShm = path.join(dataDir, 'telemetry.db-shm');
    if (fs.existsSync(oldDb)) fs.unlinkSync(oldDb);
    if (fs.existsSync(oldWal)) fs.unlinkSync(oldWal);
    if (fs.existsSync(oldShm)) fs.unlinkSync(oldShm);

    // 4. 写入恢复数据
    writeDirRecursive(dataDir, data.data, dataDir);
  } catch (err) {
    sqliteDb.reopen();
    return res.status(400).json({ error: err.message || 'Data restore failed' });
  }

  // 5. 重新建立 SQLite 数据库连接并迁移旧 Session 文件
  sqliteDb.reopen();
  sqliteDb.migrateAllOldSessions();
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
router.get('/settings/ai-config', handleGetAiConfig);
router.post('/settings/ai-config', express.json(), handleSetAiConfig);
router.post('/settings/ai-config/test', express.json(), handleTestAiConfig);
router.get('/settings/dashscope-key', handleGetAiConfig);
router.post('/settings/dashscope-key', express.json(), handleSetAiConfig);
router.post('/settings/dashscope-key/test', express.json(), handleTestAiConfig);
router.get('/backup/export', handleBackupExport);
router.post('/backup/restore', restoreRawParser, handleBackupRestore);
settingsRouter.get('/ai-config', handleGetAiConfig);
settingsRouter.post('/ai-config', express.json(), handleSetAiConfig);
settingsRouter.post('/ai-config/test', express.json(), handleTestAiConfig);
settingsRouter.get('/dashscope-key', handleGetAiConfig);
settingsRouter.post('/dashscope-key', express.json(), handleSetAiConfig);
settingsRouter.post('/dashscope-key/test', express.json(), handleTestAiConfig);
backupRouter.get('/export', handleBackupExport);
backupRouter.post('/restore', restoreRawParser, handleBackupRestore);

export default router;