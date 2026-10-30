/**
 * 将历史赛道显式迁移到当前参考几何算法。
 * 原始比赛遥测不改写；每条赛道详情会先原样备份，再重建活跃几何、弯道和路书。
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { buildTrackFromTrajectories, generateSectors, validateTrackQuality } from '../src/track-builder.js';
import { loadTracksDatabase, saveTracksDatabase, readTrackDetail, writeTrackDetail } from '../src/storage/session-db.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(scriptDir, '../../data');
const tracksDir = path.join(dataDir, 'tracks');
const backupDir = path.join(dataDir, 'backups', `track-clean-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const sourceBackupDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const metadata = loadTracksDatabase();
const report = { backupDir, rebuilt: [], skipped: [], failed: [] };

fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(path.join(dataDir, 'tracks-metadata.json'), path.join(backupDir, 'tracks-metadata.json'));

for (const trackId of Object.keys(metadata)) {
  try {
    const sourceFile = sourceBackupDir ? path.join(sourceBackupDir, `${trackId}.json.br`) : null;
    const detail = sourceFile && fs.existsSync(sourceFile)
      ? JSON.parse(zlib.brotliDecompressSync(fs.readFileSync(sourceFile)).toString('utf8'))
      : readTrackDetail(trackId);
    if (!detail) {
      report.skipped.push({ trackId, reason: '缺少赛道详情' });
      continue;
    }
    const sourcePath = ['.json.br', '.json.gz', '.json'].map(ext => path.join(tracksDir, `${trackId}${ext}`)).find(fs.existsSync);
    if (sourcePath) fs.copyFileSync(sourcePath, path.join(backupDir, path.basename(sourcePath)));

    const trajectories = Array.isArray(detail.trajectories) && detail.trajectories.length
      ? detail.trajectories
      : Array.isArray(detail.points) && detail.points.length ? [detail.points] : [];
    if (!trajectories.length) {
      report.skipped.push({ trackId, reason: '没有可清洗的历史轨迹' });
      continue;
    }
    const rebuilt = buildTrackFromTrajectories(structuredClone(trajectories), {
      oldTurns: detail.turns || [],
      isPaceNoteLocked: detail.isPaceNoteLocked || false,
      deletedTurns: detail.deletedTurns || []
    });
    if (!rebuilt) {
      report.skipped.push({ trackId, reason: '轨迹不足以重建' });
      continue;
    }
    const requiredSources = trajectories.length > 1 ? Math.max(2, Math.ceil(trajectories.length * 0.5)) : 1;
    if ((rebuilt.geometry?.sourceTrajectoryCount || 0) < requiredSources) {
      // 多条历史轨迹绝大部分被异常过滤时，剩下一条残段不能代表整条赛道。
      // 从备份迁移时明确恢复旧几何，而不是以残段覆盖用户原有地图和路书。
      if (sourceFile) {
        writeTrackDetail(trackId, detail);
        Object.assign(metadata[trackId], {
          length: detail.length || 0,
          pointCount: detail.centerline?.length || 0,
          turnCount: detail.turns?.length || 0,
          trajectoryCount: trajectories.length,
          isLoop: detail.isLoop || false,
          updatedAt: detail.updatedAt
        });
      }
      report.skipped.push({ trackId, reason: `有效轨迹不足（${rebuilt.geometry?.sourceTrajectoryCount || 0}/${trajectories.length}），保留原地图` });
      continue;
    }

    detail.points = rebuilt.centerline;
    detail.centerline = rebuilt.centerline;
    detail.turns = rebuilt.turns;
    detail.routeBook = rebuilt.routeBook;
    detail.length = rebuilt.length;
    detail.isLoop = rebuilt.isLoop || false;
    detail.sectors = generateSectors(rebuilt.centerline, rebuilt.turns);
    detail.referenceGeometry = {
      ...rebuilt.geometry,
      status: 'active',
      revision: (detail.referenceGeometry?.revision || 0) + 1,
      activatedAt: new Date().toISOString(),
      migration: 'historical-clean-v2'
    };
    delete detail.geometryCandidate;
    detail.quality = validateTrackQuality(detail);
    detail.updatedAt = new Date().toISOString();
    writeTrackDetail(trackId, detail);

    Object.assign(metadata[trackId], {
      length: detail.length,
      pointCount: detail.centerline.length,
      turnCount: detail.turns.length,
      trajectoryCount: trajectories.length,
      isLoop: detail.isLoop,
      updatedAt: detail.updatedAt
    });
    report.rebuilt.push({ trackId, name: detail.name, points: detail.centerline.length, turns: detail.turns.length });
  } catch (error) {
    report.failed.push({ trackId, error: error.message });
  }
}

saveTracksDatabase(metadata);
fs.writeFileSync(path.join(backupDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ backupDir, rebuilt: report.rebuilt.length, skipped: report.skipped.length, failed: report.failed }, null, 2));
if (report.failed.length) process.exitCode = 1;
