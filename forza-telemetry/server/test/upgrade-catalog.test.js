import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTunePayload } from '../src/services/upgrade-catalog.js';
import { resolveUpgradeProfile } from '../src/services/upgrade-catalog.js';

const profile = {
  basePi: 600,
  baseDriveType: 'rwd',
  commonTemplate: 'combustion_road',
  commonSlotOverrides: { drivetrain_swap: { availability: 'verified_present' } },
  slots: []
};

test('保存调校时保留驱动置换和其他有效配件选择', () => {
  const result = validateTunePayload(profile, {
    generationMode: 'manual',
    // 保存时这是当前四驱构型，不是车辆原厂驱动。
    driveType: 'awd',
    totalPi: 700,
    parts: {
      drivetrain_swap: { optionId: 'awd' },
      suspension: { optionId: 'race' },
      differential: { optionId: 'race' },
      transmission: { optionId: 'race_6' },
      tires_compound: { optionId: 'semi_slick' }
    }
  });

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(result.normalizedParts, {
    drivetrain_swap: { optionId: 'awd' },
    suspension: { optionId: 'race' },
    differential: { optionId: 'race' },
    transmission: { optionId: 'race_6' },
    tires_compound: { optionId: 'semi_slick' }
  });
  assert.equal(result.resolved.effectiveDriveType, 'awd');
});

test('游戏实测的完整构型优先返回精确 PI，且不会误用到其它构型', () => {
  const observations = JSON.parse(fs.readFileSync(new URL('../src/config/pi-observations.json', import.meta.url), 'utf8')).observations;
  for (const { vehicleId, confirmedPi, parts } of observations) {
    const profile = {
      ...JSON.parse(fs.readFileSync(new URL(`../src/config/upgrades/${vehicleId}.json`, import.meta.url), 'utf8')),
      id: vehicleId
    };
    const selections = Object.fromEntries(Object.entries(parts).map(([slotId, optionId]) => [slotId, { optionId }]));
    const resolved = resolveUpgradeProfile(profile, selections);
    assert.equal(resolved.prediction.totalPi, confirmedPi);
    assert.equal(resolved.prediction.modelVersion, 'observed-build-v1');
  }
});

test('已核实不存在的配件不会再出现在该车型目录中', () => {
  const profile = {
    ...JSON.parse(fs.readFileSync(new URL('../src/config/upgrades/1081.json', import.meta.url), 'utf8')),
    id: '1081'
  };
  const resolved = resolveUpgradeProfile(profile, {});
  assert.equal(resolved.slots.some(slot => slot.id === 'brakes'), false);
});
