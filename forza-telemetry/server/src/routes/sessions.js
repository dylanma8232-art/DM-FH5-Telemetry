import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { DATA_DIR } from '../config/constants.js';
import { readJsonAsync, readBrotliAsync } from '../storage/file-db.js';

const router = express.Router();
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

// 获取所有会话列表
router.get('/', async (req, res) => {
  try {
    if (!existsSync(SESSIONS_DIR)) {
      return res.json([]);
    }
    const files = await fs.readdir(SESSIONS_DIR);
    const summaryFiles = files.filter(f => f.endsWith('_summary.json'));
    
    const sessions = [];
    for (const file of summaryFiles) {
      const summary = await readJsonAsync(path.join(SESSIONS_DIR, file), null);
      if (summary) sessions.push(summary);
    }
    
    // 按日期倒序排列
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read sessions list' });
  }
});

// 获取单个会话概要
router.get('/:id', async (req, res) => {
  try {
    const summaryPath = path.join(SESSIONS_DIR, `${req.params.id}_summary.json`);
    if (!existsSync(summaryPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const summary = await readJsonAsync(summaryPath, null);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read session' });
  }
});

// 获取单个会话的高频遥测详情 (读取异步 Brotli 压缩数据)
router.get('/:id/telemetry', async (req, res) => {
  try {
    const detailPath = path.join(SESSIONS_DIR, `${req.params.id}_detail.json.br`);
    if (!existsSync(detailPath)) {
      const uncompressedPath = path.join(SESSIONS_DIR, `${req.params.id}_detail.json`);
      if (existsSync(uncompressedPath)) {
        const detail = await readJsonAsync(uncompressedPath, null);
        return res.json(detail || []);
      }
      return res.status(404).json({ error: 'Session details not found' });
    }
    const detail = await readBrotliAsync(detailPath, []);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read session details' });
  }
});

// 删除会话
router.delete('/:id', async (req, res) => {
  try {
    const summaryPath = path.join(SESSIONS_DIR, `${req.params.id}_summary.json`);
    const detailPath = path.join(SESSIONS_DIR, `${req.params.id}_detail.json.br`);
    const uncompressedPath = path.join(SESSIONS_DIR, `${req.params.id}_detail.json`);
    
    if (existsSync(summaryPath)) await fs.unlink(summaryPath);
    if (existsSync(detailPath)) await fs.unlink(detailPath);
    if (existsSync(uncompressedPath)) await fs.unlink(uncompressedPath);
    
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
