import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEffectiveDriveType,
  createTuneExportPayload,
  generateShareCodeUtil,
  parseShareCodeUtil
} from '../src/hooks/useTuneManager.js';
import { DRIVING_PROBLEMS } from '../src/data/tunePresets.js';
import diagnoseRules from '../src/data/diagnoseRules.json' with { type: 'json' };
import { saveTuneSchema } from '../../server/src/utils/schemas.js';

test('resolves stock drivetrain_swap option to effective drive type (fwd/rwd/awd) rather than stock', async () => {
  const mockParts = {
    drivetrain_swap: { optionId: 'stock' },
    engine_swap: { optionId: 'stock' }
  };

  const shop = { effectiveDriveType: 'rwd', baseDriveType: 'rwd' };
  const vehicle = { drivetrain: 'RWD' };

  const driveTypePayload = resolveEffectiveDriveType(mockParts, 'rwd', shop, vehicle);
  assert.equal(driveTypePayload, 'rwd');

  // Verify that resolved payload satisfies saveTuneSchema
  const tunePayload = {
    name: 'Test Tune',
    vehicleId: '101',
    basePi: 500,
    totalPi: 600,
    generationMode: 'manual',
    driveType: driveTypePayload,
    parts: mockParts
  };

  const validation = saveTuneSchema.safeParse(tunePayload);
  assert.equal(validation.success, true);

  // Verify schema rejects 'stock' as driveType
  const invalidPayload = { ...tunePayload, driveType: 'stock' };
  const invalidValidation = saveTuneSchema.safeParse(invalidPayload);
  assert.equal(invalidValidation.success, false);
});

test('createTuneExportPayload includes brakes settings and valid structure', () => {
  const mockTune = {
    name: 'Track Monster',
    tags: ['AWD', 'S1'],
    vehicleId: '202',
    tires: { frontPressure: 2.1, rearPressure: 2.1 },
    suspension: { frontSpring: 85, rearSpring: 90 },
    drivetrain: { finalDrive: 3.65 },
    brakes: { balance: 48, pressure: 100 },
    aero: { frontDownforce: 100, rearDownforce: 150 },
    parts: { brakes: { tier: 'race' } }
  };

  const payload = createTuneExportPayload(mockTune);
  assert.equal(payload.version, 3);
  assert.deepEqual(payload.tune.brakes, { balance: 48, pressure: 100 });
  assert.equal(payload.tune.name, 'Track Monster');
});

test('generateShareCode and parseShareCode round-trip retains brakes setup', () => {
  const mockTune = {
    name: 'Brake Tune',
    vehicleId: '305',
    tires: { frontPressure: 1.9, rearPressure: 1.9 },
    suspension: { frontARB: 25 },
    drivetrain: { finalDrive: 3.8 },
    brakes: { balance: 52, pressure: 95 },
    aero: { frontDownforce: 120 },
    parts: {}
  };

  const code = generateShareCodeUtil(mockTune);
  assert.ok(code && typeof code === 'string');

  const parsed = parseShareCodeUtil(code);
  assert.equal(parsed.name, 'Brake Tune');
  assert.equal(parsed.vehicleId, '305');
  assert.deepEqual(parsed.brakes, { balance: 52, pressure: 95 });

  // Test backwards compatibility: if decoded payload does not have 'b', default to empty object
  const legacyCode = generateShareCodeUtil({ ...mockTune, brakes: undefined });
  const legacyParsed = parseShareCodeUtil(legacyCode);
  assert.deepEqual(legacyParsed.brakes, {});
});

test('tunePresets.js and diagnoseRules.json pressure adjustments are in bar (abs delta <= 0.5)', () => {
  for (const prob of DRIVING_PROBLEMS) {
    if (prob.fixes?.frontTirePressure) {
      const delta = prob.fixes.frontTirePressure.delta;
      assert.ok(
        Math.abs(delta) <= 0.5,
        `frontTirePressure delta in ${prob.id} is too large (${delta}), expected bar units`
      );
    }
    if (prob.fixes?.rearTirePressure) {
      const delta = prob.fixes.rearTirePressure.delta;
      assert.ok(
        Math.abs(delta) <= 0.5,
        `rearTirePressure delta in ${prob.id} is too large (${delta}), expected bar units`
      );
    }
  }

  for (const group of diagnoseRules) {
    for (const rule of group.rules || []) {
      if (rule.fix?.frontTirePressure) {
        const delta = rule.fix.frontTirePressure.delta;
        assert.ok(
          Math.abs(delta) <= 0.5,
          `diagnoseRules frontTirePressure delta in ${group.id} is too large (${delta})`
        );
      }
      if (rule.fix?.rearTirePressure) {
        const delta = rule.fix.rearTirePressure.delta;
        assert.ok(
          Math.abs(delta) <= 0.5,
          `diagnoseRules rearTirePressure delta in ${group.id} is too large (${delta})`
        );
      }
    }
  }
});

test('tunePresets.js finalDrive deltas have correct signs for shortening and lengthening', () => {
  const accelSlow = DRIVING_PROBLEMS.find(p => p.id === 'accel_slow');
  assert.ok(accelSlow.fixes.finalDrive.delta > 0, 'accel_slow should shorten gearing by increasing finalDrive');

  const topSpeedLow = DRIVING_PROBLEMS.find(p => p.id === 'top_speed_low');
  assert.ok(topSpeedLow.fixes.finalDrive.delta < 0, 'top_speed_low should lengthen gearing by decreasing finalDrive');

  const gearTooLong = DRIVING_PROBLEMS.find(p => p.id === 'gear_too_long');
  assert.ok(gearTooLong.fixes.finalDrive.delta > 0, 'gear_too_long should shorten gearing by increasing finalDrive');

  const gearTooShort = DRIVING_PROBLEMS.find(p => p.id === 'gear_too_short');
  assert.ok(gearTooShort.fixes.finalDrive.delta < 0, 'gear_too_short should lengthen gearing by decreasing finalDrive');
});
