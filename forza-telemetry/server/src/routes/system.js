import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const router = express.Router();

export default function(context) {
  const { DATA_DIR, loadTracksDatabase, loadJSON, tracks, vehicles, tunes, saveTracksDatabase } = context;

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

  router.post('/settings/dashscope-key', express.json(), (req, res) => {
    try {
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
    } catch (err) {
      console.error('[Settings] 保存配置失败:', err);
      res.status(500).json({ error: '保存配置文件失败' });
    }
  });

  router.get('/backup/export', async (req, res) => {
    try {
      const backup = { version: 2, exportedAt: new Date().toISOString(), data: readDirRecursive(DATA_DIR) };
      const jsonStr = JSON.stringify(backup);
      const compressed = await gzipAsync(Buffer.from(jsonStr));
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="fh5_telemetry_backup_${Date.now()}.json.gz"`);
      res.send(compressed);
    } catch (e) {
      console.error('[Backup Export] Error:', e);
      res.status(500).json({ error: 'Failed to export backup' });
    }
  });

  router.post('/backup/restore', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
    try {
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
      
      if (context.onRestore) {
        context.onRestore(nextTracks, nextVehicles, nextTunes);
      }
      res.json({ success: true, message: '数据恢复成功，原数据已备份至 ' + path.basename(backupDir) });
    } catch (e) {
      console.error('[Backup Restore] Error:', e);
      res.status(500).json({ error: 'Failed to restore backup: ' + e.message });
    }
  });

  return router;
}
