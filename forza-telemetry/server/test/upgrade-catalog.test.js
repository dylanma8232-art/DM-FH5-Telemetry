import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTunePayload } from '../src/services/upgrade-catalog.js';

const profile = {
  basePi: 600,
  baseDriveType: 'rwd',
  commonTemplate: 'combustion_road',
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
