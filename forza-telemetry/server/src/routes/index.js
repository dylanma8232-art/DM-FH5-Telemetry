import express from 'express';
import vehicleRouter from './vehicles.js';
import tuneRouter from './tunes.js';
import trackRouter from './tracks.js';
import sessionRouter from './sessions.js';

const router = express.Router();

router.use('/vehicles', vehicleRouter);
router.use('/tunes', tuneRouter);
router.use('/tracks', trackRouter);
router.use('/sessions', sessionRouter);

export default router;
