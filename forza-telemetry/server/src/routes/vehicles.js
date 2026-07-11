import express from 'express';

const router = express.Router();

export default function(context) {
  const { vehicles, saveJSON, DATA_DIR } = context;

  // 获取所有车辆
  router.get('/', (req, res) => {
    res.json(vehicles);
  });

  // 更新车辆信息
  router.post('/:id', express.json(), (req, res) => {
    try {
      vehicles[req.params.id] = { ...vehicles[req.params.id], ...req.body };
      saveJSON(DATA_DIR + '/vehicles.json', vehicles);
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update vehicle' });
    }
  });

  // 删除车辆信息
  router.delete('/:id', (req, res) => {
    try {
      delete vehicles[req.params.id];
      saveJSON(DATA_DIR + '/vehicles.json', vehicles);
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete vehicle' });
    }
  });

  return router;
}
