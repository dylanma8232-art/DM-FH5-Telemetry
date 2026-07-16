import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'data');
const sessionsDir = path.join(dataDir, 'sessions');
const tracksDir = path.join(dataDir, 'tracks');
const diagnosesDir = path.join(dataDir, 'diagnoses');
const apply = process.argv.includes('--apply');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dataDir, '.cleanup-backups', timestamp);
const report = { summariesUpdated: 0, importedTracks: 0, removedLegacyFiles: 0, convertedDiagnoses: 0 };

function backup(filePath, relativePath = path.relative(dataDir, filePath)) {
  const target = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePath, target);
}

function removeWithBackup(filePath, relativePath) {
  backup(filePath, relativePath);
  fs.unlinkSync(filePath);
  report.removedLegacyFiles++;
}

function normalizeDrivetrain(vehicle) {
  if (!vehicle || vehicle.drivetrain) return vehicle;
  const mapping = { 0: 'FWD', 1: 'RWD', 2: 'AWD', 3: 'RWD' };
  const drivetrain = mapping[vehicle.drivetrainType];
  return drivetrain ? { ...vehicle, drivetrain } : vehicle;
}

function normalizeSummaries() {
  for (const file of fs.readdirSync(sessionsDir).filter(name => name.endsWith('_summary.json'))) {
    const filePath = path.join(sessionsDir, file);
    const summary = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const id = summary.id || file.replace('_summary.json', '');
    const lowfi = fs.existsSync(path.join(sessionsDir, `${id}_detail_lowfi.json.br`));
    const hifi = fs.existsSync(path.join(sessionsDir, `${id}_detail_hifi.json.br`));
    const duration = Number(summary.duration ?? summary.summary?.duration ?? 0) || 0;
    const normalized = {
      ...summary,
      id,
      tuneId: summary.tuneId || null,
      vehicle: normalizeDrivetrain(summary.vehicle),
      hasDetail: lowfi || hifi,
      ...(duration > 0 ? { duration, summary: { ...(summary.summary || {}), duration } } : {})
    };

    if (JSON.stringify(summary) !== JSON.stringify(normalized)) {
      if (apply) {
        backup(filePath);
        fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
      }
      report.summariesUpdated++;
    }
  }
}

function importLegacyTracks() {
  const backupArchives = fs.existsSync(path.join(dataDir, '.cleanup-backups'))
    ? fs.readdirSync(path.join(dataDir, '.cleanup-backups')).sort().reverse()
      .map(name => path.join(dataDir, '.cleanup-backups', name, 'tracks.json.bak_sharded'))
    : [];
  const archivePath = [path.join(dataDir, 'tracks.json.bak_sharded'), ...backupArchives]
    .find(candidate => fs.existsSync(candidate));
  if (!archivePath) return;
  const metadataPath = path.join(dataDir, 'tracks-metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const legacyTracks = JSON.parse(fs.readFileSync(archivePath, 'utf8'));

  for (const [id, track] of Object.entries(legacyTracks)) {
    if (metadata[id]) continue;
    const detail = {
      id,
      name: track.name || '未命名赛道',
      points: track.points || [],
      centerline: track.centerline || [],
      turns: track.turns || [],
      sectors: track.sectors || [],
      navigation: track.navigation || null,
      trajectories: track.trajectories || [],
      createdAt: track.createdAt || new Date().toISOString(),
      updatedAt: track.updatedAt || new Date().toISOString()
    };
    metadata[id] = {
      id,
      name: detail.name,
      length: Number(track.length || 0),
      pointCount: detail.points.length,
      turnCount: detail.turns.length,
      trajectoryCount: detail.trajectories.length,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt
    };
    if (apply) {
      const compressed = zlib.brotliCompressSync(Buffer.from(JSON.stringify(detail)), {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 }
      });
      fs.writeFileSync(path.join(tracksDir, `${id}.json.br`), compressed);
    }
    report.importedTracks++;
  }

  if (report.importedTracks > 0 && apply) {
    backup(metadataPath);
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }

  if (apply && path.dirname(archivePath) === dataDir) removeWithBackup(archivePath);
}

function cleanLegacyFiles() {
  fs.mkdirSync(diagnosesDir, { recursive: true });
  const oldDiagnosis = fs.readdirSync(sessionsDir).filter(name => name.endsWith('_ai_coach.md'));
  for (const file of oldDiagnosis) {
    const oldPath = path.join(sessionsDir, file);
    const id = file.replace('_ai_coach.md', '');
    const targetPath = path.join(diagnosesDir, `${id}.json`);
    if (apply) {
      backup(oldPath);
      if (!fs.existsSync(targetPath)) {
        fs.writeFileSync(targetPath, `${JSON.stringify({
          diagnosis: fs.readFileSync(oldPath, 'utf8'),
          problemId: null,
          customQuestion: '',
          generatedAt: fs.statSync(oldPath).mtime.toISOString()
        }, null, 2)}\n`);
        report.convertedDiagnoses++;
      }
      fs.unlinkSync(oldPath);
      report.removedLegacyFiles++;
    }
  }

  const orphanedDiagnosisSummaries = fs.readdirSync(sessionsDir)
    .filter(name => name.endsWith('_ai_diagnosis_summary.json'));
  for (const file of orphanedDiagnosisSummaries) {
    const filePath = path.join(sessionsDir, file);
    if (apply) removeWithBackup(filePath);
  }

  const redundantFiles = [
    path.join(dataDir, '.DS_Store'),
    path.join(dataDir, 'tracks-metadata.json.bak'),
    ...fs.readdirSync(sessionsDir)
      .filter(name => name.endsWith('_summary.json.bak'))
      .map(name => path.join(sessionsDir, name))
  ];
  for (const filePath of redundantFiles) {
    if (fs.existsSync(filePath) && apply) removeWithBackup(filePath);
  }

  const unsupportedCatalog = path.join(rootDir, 'server', 'data', 'tracks-database.json');
  if (fs.existsSync(unsupportedCatalog) && apply) {
    removeWithBackup(unsupportedCatalog, 'unsupported-server-data/tracks-database.json');
  }
}

function restoreArchivedDiagnoses() {
  const backupsRoot = path.join(dataDir, '.cleanup-backups');
  if (!fs.existsSync(backupsRoot)) return;
  const backupNames = fs.readdirSync(backupsRoot).sort().reverse();
  for (const backupName of backupNames) {
    const backupSessions = path.join(backupsRoot, backupName, 'sessions');
    if (!fs.existsSync(backupSessions)) continue;
    for (const file of fs.readdirSync(backupSessions).filter(name => name.endsWith('_ai_coach.md'))) {
      const id = file.replace('_ai_coach.md', '');
      const targetPath = path.join(diagnosesDir, `${id}.json`);
      if (fs.existsSync(targetPath)) continue;
      if (apply) {
        const sourcePath = path.join(backupSessions, file);
        fs.writeFileSync(targetPath, `${JSON.stringify({
          diagnosis: fs.readFileSync(sourcePath, 'utf8'),
          problemId: null,
          customQuestion: '',
          generatedAt: fs.statSync(sourcePath).mtime.toISOString()
        }, null, 2)}\n`);
      }
      report.convertedDiagnoses++;
    }
  }
}

normalizeSummaries();
importLegacyTracks();
cleanLegacyFiles();
restoreArchivedDiagnoses();

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', backupDir: apply ? backupDir : null, ...report }, null, 2));
