import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loadSession } from '../storage/session-db.js';
import {
  EXPORT_FORMATS,
  buildSessionCsv,
  buildSessionJson,
  buildSessionReportHtml
} from '../services/export-builder.js';

const router = express.Router();

const CONTENT_TYPE = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  report: 'text/html; charset=utf-8',
};

const EXTENSION = { csv: 'csv', json: 'json', report: 'html' };

// 比赛记录导出：GET /api/export/:format/:sessionId（format = csv | json | report）
// 前端 useSessionHistory.downloadBlob 以 blob 下载方式消费，故成功时返回附件字节流。
router.get('/:format/:sessionId', asyncHandler(async (req, res) => {
  const format = String(req.params.format || '').toLowerCase();
  const sessionId = req.params.sessionId;

  if (!EXPORT_FORMATS.includes(format)) {
    return res.status(400).json({ error: '不支持的导出格式，可用：csv、json、report' });
  }

  const session = loadSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const filename = `session_${sessionId}.${EXTENSION[format]}`;
  res.setHeader('Content-Type', CONTENT_TYPE[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  if (format === 'csv') return res.send(buildSessionCsv(session));
  if (format === 'json') return res.send(buildSessionJson(session));
  return res.send(buildSessionReportHtml(session));
}));

export default router;
