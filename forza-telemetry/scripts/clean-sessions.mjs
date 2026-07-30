import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const sessionsDir = path.join(DATA_DIR, 'sessions');

async function cleanAndRepairSessions() {
  if (!fs.existsSync(sessionsDir)) {
    console.log('[Clean] Sessions directory does not exist.');
    return;
  }

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
  console.log(`[Clean] Found ${files.length} session summary files to inspect.`);

  let repairedCount = 0;

  for (const file of files) {
    const filePath = path.join(sessionsDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const session = JSON.parse(raw);
      let isModified = false;

      // 1. 检查并修复拉力/冲刺赛 count: 0 问题
      const lapCount = session.laps?.count || 0;
      const dataCount = session.summary?.dataCount || 0;
      const durationMs = session.summary?.duration || session.duration || 0;

      if ((lapCount === 0 || !session.laps?.best) && dataCount > 100 && durationMs > 5000) {
        const durationSec = durationMs > 0 ? durationMs / 1000 : 0;
        const bestLap = (session.laps?.best && session.laps.best > 0) ? session.laps.best : durationSec;
        const lastLap = (session.laps?.last && session.laps.last > 0) ? session.laps.last : durationSec;

        session.laps = {
          best: bestLap,
          last: lastLap,
          count: Math.max(1, lapCount)
        };
        isModified = true;
        console.log(`[Clean] Repaired Sprint/Rally Session: ${session.id} (${session.trackName || 'Unnammed'}) -> laps.count set to ${session.laps.count}, bestLap: ${bestLap.toFixed(2)}s`);
      }

      if (isModified) {
        fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
        repairedCount++;
      }
    } catch (err) {
      console.error(`[Clean] Error processing ${file}:`, err.message);
    }
  }

  console.log(`[Clean] Process completed. Repaired ${repairedCount} sessions.`);
}

cleanAndRepairSessions().catch(console.error);
