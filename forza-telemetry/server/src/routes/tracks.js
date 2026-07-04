import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { DATA_DIR } from '../config/constants.js';
import { readJsonAsync, writeJsonAsync } from '../storage/file-db.js';
import { stateManager } from '../services/state-manager.js';

const router = express.Router();
const TRACKS_FILE = path.join(DATA_DIR, 'tracks.json');

// 获取所有赛道 (从内存缓存读取 sessionCount 和 lastUsed 以达到 0ms 响应)
router.get('/', async (req, res) => {
  try {
    const tracks = await readJsonAsync(TRACKS_FILE, {});
    const enriched = {};
    for (const [id, track] of Object.entries(tracks)) {
      enriched[id] = {
        ...track,
        sessionCount: stateManager.sessionCounts[id] || 0,
        lastUsedAt: stateManager.lastUsedMap[id] || track.updatedAt || track.createdAt || null
      };
    }
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read tracks' });
  }
});

// 获取赛道详情
router.get('/:id', async (req, res) => {
  try {
    const tracks = await readJsonAsync(TRACKS_FILE, {});
    const track = tracks[req.params.id];
    if (!track) return res.status(404).json({ error: 'Track not found' });
    res.json(track);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read track' });
  }
});

// 创建赛道
router.post('/', async (req, res) => {
  try {
    const tracks = await readJsonAsync(TRACKS_FILE, {});
    const id = 'track_' + Date.now();
    tracks[id] = { id, ...req.body, createdAt: new Date().toISOString() };
    await writeJsonAsync(TRACKS_FILE, tracks);
    res.json({ status: 'ok', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create track' });
  }
});

// 更新赛道
router.put('/:id', async (req, res) => {
  try {
    const tracks = await readJsonAsync(TRACKS_FILE, {});
    if (!tracks[req.params.id]) return res.status(404).json({ error: 'Track not found' });
    tracks[req.params.id] = { ...tracks[req.params.id], ...req.body, updatedAt: new Date().toISOString() };
    await writeJsonAsync(TRACKS_FILE, tracks);
    res.json({ status: 'ok', track: tracks[req.params.id] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update track' });
  }
});

// 删除赛道
router.delete('/:id', async (req, res) => {
  try {
    const tracks = await readJsonAsync(TRACKS_FILE, {});
    if (!tracks[req.params.id]) return res.status(404).json({ error: 'Track not found' });
    delete tracks[req.params.id];
    await writeJsonAsync(TRACKS_FILE, tracks);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete track' });
  }
});

export default router;
