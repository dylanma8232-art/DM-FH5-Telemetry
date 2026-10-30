import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectiveDriveType } from '../src/hooks/useTuneManager.js';
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
