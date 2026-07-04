import express from 'express';
import path from 'path';
import { DATA_DIR } from '../config/constants.js';
import { readJsonAsync, writeJsonAsync } from '../storage/file-db.js';

const router = express.Router();
const VEHICLES_FILE = path.join(DATA_DIR, 'vehicles.json');

router.get('/', async (req, res) => {
  const vehicles = await readJsonAsync(VEHICLES_FILE, {});
  res.json(vehicles);
});

router.post('/:id', async (req, res) => {
  const vehicles = await readJsonAsync(VEHICLES_FILE, {});
  vehicles[req.params.id] = { ...vehicles[req.params.id], ...req.body };
  await writeJsonAsync(VEHICLES_FILE, vehicles);
  res.json({ status: 'ok' });
});

router.delete('/:id', async (req, res) => {
  const vehicles = await readJsonAsync(VEHICLES_FILE, {});
  delete vehicles[req.params.id];
  await writeJsonAsync(VEHICLES_FILE, vehicles);
  res.json({ status: 'ok' });
});

export default router;
