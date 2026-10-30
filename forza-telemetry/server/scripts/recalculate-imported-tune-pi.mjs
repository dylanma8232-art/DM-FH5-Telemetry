/** 将文档导入方案的主显示 PI 恢复为当前调校模块的计算结果。 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveUpgradeProfile } from '../src/services/upgrade-catalog.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const tunesPath = path.join(rootDir, 'data/tunes.json');
const upgradesDir = path.join(rootDir, 'server/src/config/upgrades');
const importedTuneIds = new Set([
  'tune_1784436423363', 'tune_1784436423388', 'tune_1784436423395',
  'tune_1784436465567', 'tune_1784436465583', 'tune_1784436465595'
]);
const tunes = JSON.parse(fs.readFileSync(tunesPath, 'utf8'));
const updated = [];
for (const tune of Object.values(tunes)) {
  if (!importedTuneIds.has(tune.tuneId)) continue;
  const profilePath = path.join(upgradesDir, `${tune.vehicleId}.json`);
  if (!fs.existsSync(profilePath)) continue;
  const profile = { ...JSON.parse(fs.readFileSync(profilePath, 'utf8')), id: String(tune.vehicleId) };
  const prediction = resolveUpgradeProfile(profile, tune.parts || {}).prediction;
  tune.basePi = profile.basePi;
  tune.totalPi = prediction.totalPi;
  tune.estimatedPi = prediction.totalPi;
  tune.piUpperEstimate = prediction.maxPi;
  tune.piStatus = prediction.modelVersion;
  tune.validationWarnings = prediction.uncertainty ? [`当前为模块预测，误差带 ±${prediction.uncertainty} PI。`] : [];
  tune.updatedAt = new Date().toISOString();
  updated.push({ tuneId: tune.tuneId, name: tune.name, pi: prediction.totalPi, source: prediction.modelVersion });
}
fs.writeFileSync(tunesPath, JSON.stringify(tunes, null, 2));
console.log(JSON.stringify(updated, null, 2));
