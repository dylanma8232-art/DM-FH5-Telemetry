import express from 'express';
import path from 'path';
import { DATA_DIR } from '../config/constants.js';
import { readJsonAsync, writeJsonAsync } from '../storage/file-db.js';

const router = express.Router();
const TUNES_FILE = path.join(DATA_DIR, 'tunes.json');
const ACTIVE_TUNE_FILE = path.join(DATA_DIR, 'active-tune.json');

router.get('/', async (req, res) => {
  const tunes = await readJsonAsync(TUNES_FILE, []);
  res.json(tunes);
});

router.get('/:tuneId', async (req, res) => {
  const tunes = await readJsonAsync(TUNES_FILE, []);
  const tune = tunes.find(t => t.id === req.params.tuneId);
  res.json(tune || null);
});

router.post('/', async (req, res) => {
  const tunes = await readJsonAsync(TUNES_FILE, []);
  const newTune = { id: 'tune_' + Date.now(), ...req.body, createdAt: new Date().toISOString() };
  tunes.push(newTune);
  await writeJsonAsync(TUNES_FILE, tunes);
  res.json({ status: 'ok', tune: newTune });
});

router.put('/:tuneId', async (req, res) => {
  let tunes = await readJsonAsync(TUNES_FILE, []);
  tunes = tunes.map(t => t.id === req.params.tuneId ? { ...t, ...req.body, updatedAt: new Date().toISOString() } : t);
  await writeJsonAsync(TUNES_FILE, tunes);
  res.json({ status: 'ok' });
});

router.delete('/:tuneId', async (req, res) => {
  let tunes = await readJsonAsync(TUNES_FILE, []);
  tunes = tunes.filter(t => t.id !== req.params.tuneId);
  await writeJsonAsync(TUNES_FILE, tunes);
  res.json({ status: 'ok' });
});

router.post('/active', async (req, res) => {
  await writeJsonAsync(ACTIVE_TUNE_FILE, req.body);
  res.json({ status: 'ok' });
});

router.get('/active', async (req, res) => {
  const active = await readJsonAsync(ACTIVE_TUNE_FILE, null);
  res.json(active);
});

export default router;
