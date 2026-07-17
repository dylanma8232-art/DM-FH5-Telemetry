import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveUpgradeProfile, solveFormulaBuild } from '../src/services/upgrade-catalog.js';

const upgradesDir = path.resolve(import.meta.dirname, '../src/config/upgrades');
const readProfile = vehicleId => JSON.parse(fs.readFileSync(path.join(upgradesDir, `${vehicleId}.json`), 'utf8'));

test('公式模型严格锚定原厂 PI，并为每个候选项返回有限区间', () => {
  for (const vehicleId of ['1264', '302', '269', '3808', '2825']) {
    const profile = readProfile(vehicleId);
    const resolved = resolveUpgradeProfile(profile, {});
    assert.equal(resolved.prediction.totalPi, profile.basePi, `${vehicleId} 原厂 PI`);
    assert.ok(resolved.prediction.minPi <= resolved.prediction.totalPi);
    assert.ok(resolved.prediction.maxPi >= resolved.prediction.totalPi);
    for (const slot of resolved.slots) {
      for (const option of slot.options) {
        assert.ok(Number.isFinite(option.piDeltaFromCurrent), `${vehicleId}/${slot.id}/${option.id}`);
        assert.ok(Number.isFinite(option.piPrediction.min));
        assert.ok(Number.isFinite(option.piPrediction.max));
      }
    }
  }
});

test('卡片边际 PI 等于完整构型的反事实差分', () => {
  const profile = readProfile('1264');
  const original = resolveUpgradeProfile(profile, {});
  const tireSlot = original.slots.find(slot => slot.id === 'tires_compound');
  const sport = tireSlot.options.find(option => option.id === 'sport');
  const changed = resolveUpgradeProfile(profile, { tires_compound: { optionId: 'sport' } });
  assert.equal(sport.piDeltaFromCurrent, changed.prediction.totalPi - original.prediction.totalPi);
});

test('公式自动改装不会超过点预测目标 PI', () => {
  const profile = readProfile('1264');
  const result = solveFormulaBuild(profile, {}, { targetPi: 700, raceType: 'road' });
  assert.ok(result.prediction.totalPi <= 700);
  assert.ok(result.prediction.totalPi >= profile.basePi);
});
