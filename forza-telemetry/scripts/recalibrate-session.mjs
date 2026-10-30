import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

function findClosestPoint(targetX, targetZ, lapPoints) {
  if (!lapPoints || lapPoints.length === 0) return null;
  let closest = null;
  let minD2 = Infinity;
  for (const p of lapPoints) {
    const px = p.position?.x ?? p.positionX ?? p.x ?? 0;
    const pz = p.position?.z ?? p.positionZ ?? p.z ?? 0;
    const d2 = (px - targetX) ** 2 + (pz - targetZ) ** 2;
    if (d2 < minD2) {
      minD2 = d2;
      closest = p;
    }
  }
  return closest;
}

async function recalibrate() {
  const sessionId = 'session_1785417625265';
  console.log(`[Recalibrate] Running deep recalibration for ${sessionId}...`);

  const summaryPath = path.join(DATA_DIR, 'sessions', `${sessionId}_summary.json`);
  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    summary.laps = {
      best: summary.summary?.duration ? summary.summary.duration / 1000 : 2360.93,
      last: summary.summary?.duration ? summary.summary.duration / 1000 : 2360.93,
      count: 1
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  }

  // 清除对应的旧分析缓存，强制触发全新算力生成
  const files = fs.readdirSync(path.join(DATA_DIR, 'sessions'));
  for (const f of files) {
    if (f.startsWith(sessionId) && f.includes('cache')) {
      try { fs.unlinkSync(path.join(DATA_DIR, 'sessions', f)); } catch {}
    }
  }

  console.log(`[Recalibrate] Complete! Deep recalibration finished.`);
}

recalibrate().catch(console.error);
