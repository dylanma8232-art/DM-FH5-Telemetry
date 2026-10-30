import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTuneSchema } from '../src/utils/schemas.js';

test('saveTuneSchema parses valid tune payload with nonempty parts and tuningCapabilities', () => {
  const payload = {
    name: 'Test Tune',
    parts: {
      engine: 'race_engine',
      tires: 'sport'
    },
    tuningCapabilities: {
      tirePressure: true,
      camber: false
    }
  };

  const parsed = saveTuneSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data.parts, { engine: 'race_engine', tires: 'sport' });
  assert.deepEqual(parsed.data.tuningCapabilities, { tirePressure: true, camber: false });
});

test('saveTuneSchema uses defaults for parts and handles null tuningCapabilities', () => {
  const payload = {
    name: 'Default Tune',
    tuningCapabilities: null
  };

  const parsed = saveTuneSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data.parts, {});
  assert.equal(parsed.data.tuningCapabilities, null);
});
