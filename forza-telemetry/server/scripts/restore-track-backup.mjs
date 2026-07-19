#!/usr/bin/env node
/**
 * 恢复一次赛道几何快照，并先为当前正式赛道创建完整可恢复备份。
 * 原始比赛 sessions 与遥测文件不在本脚本的写入范围内。
 * 用法：node scripts/restore-track-backup.mjs <来源备份目录>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const sourceDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!sourceDir || !fs.existsSync(sourceDir)) {
  throw new Error('请传入存在的赛道备份目录。');
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(scriptDir, '../../data');
const tracksDir = path.join(dataDir, 'tracks');
const sourceFiles = fs.readdirSync(sourceDir).filter(file => /^track_.+\.json\.br$/.test(file));
if (!sourceFiles.length || !fs.existsSync(path.join(sourceDir, 'tracks-metadata.json'))) {
  throw new Error('来源备份不完整，必须包含赛道文件和 tracks-metadata.json。');
}

const backupDir = path.join(dataDir, 'backups', `track-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(backupDir, { recursive: true });

const currentFiles = fs.readdirSync(tracksDir).filter(file => /^track_.+\.json\.br$/.test(file));
for (const file of currentFiles) fs.copyFileSync(path.join(tracksDir, file), path.join(backupDir, file));
fs.copyFileSync(path.join(dataDir, 'tracks-metadata.json'), path.join(backupDir, 'tracks-metadata.json'));

for (const file of sourceFiles) fs.copyFileSync(path.join(sourceDir, file), path.join(tracksDir, file));
fs.copyFileSync(path.join(sourceDir, 'tracks-metadata.json'), path.join(dataDir, 'tracks-metadata.json'));

const report = {
  restoredFrom: sourceDir,
  currentBackup: backupDir,
  restoredTracks: sourceFiles.length,
  timestamp: new Date().toISOString()
};
fs.writeFileSync(path.join(backupDir, 'restore-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
