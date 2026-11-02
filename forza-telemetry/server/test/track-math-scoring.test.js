import test from 'node:test';
import assert from 'node:assert/strict';
import { fitArcToPoints } from '../src/services/track/track-math.js';
import { getBestLapNum } from '../src/services/physics/scoring.js';

test('fitArcToPoints - computes accurate circle center with 2*det factor', () => {
  // Test circle centered at (100, 100) with radius 5
  // (x - 100)^2 + (z - 100)^2 = 25
  const points = [
    { x: 105, z: 100 },
    { x: 100, z: 105 },
    { x: 95, z: 100 },
    { x: 100, z: 95 }
  ];

  const arc = fitArcToPoints(points);
  assert.ok(arc !== null);
  assert.ok(Math.abs(arc.cx - 100) < 1e-4, `Expected cx near 100, got ${arc.cx}`);
  assert.ok(Math.abs(arc.cz - 100) < 1e-4, `Expected cz near 100, got ${arc.cz}`);
  assert.ok(Math.abs(arc.radius - 5) < 1e-4, `Expected radius near 5, got ${arc.radius}`);
});

test('fitArcToPoints - edge cases', () => {
  assert.equal(fitArcToPoints(null), null);
  assert.equal(fitArcToPoints([]), null);
  assert.equal(fitArcToPoints([{ x: 0, z: 0 }, { x: 1, z: 1 }]), null);

  // Collinear points: det should be near 0
  const collinear = [
    { x: 0, z: 0 },
    { x: 1, z: 1 },
    { x: 2, z: 2 },
    { x: 3, z: 3 }
  ];
  assert.equal(fitArcToPoints(collinear), null);
});

test('getBestLapNum - associates improved bestLap with preceding lap and preserves lap 0', () => {
  // Scenario 1: Lap 0 finishes, telemetry switches to lap 1 and records bestLap = 65.5
  const dataLap0Best = [
    { lapNumber: 0, bestLap: 0 },
    { lapNumber: 0, bestLap: 0 },
    { lapNumber: 1, bestLap: 65.5 },
    { lapNumber: 1, bestLap: 65.5 }
  ];
  // Best lap should be lap 0, not lap 1!
  assert.equal(getBestLapNum(dataLap0Best), 0);

  // Scenario 2: Lap 1 finishes with bestLap 60.0 (updated during lap 2)
  const dataLap1Best = [
    { lapNumber: 0, bestLap: 0 },
    { lapNumber: 1, bestLap: 65.5 },
    { lapNumber: 2, bestLap: 60.0 }
  ];
  assert.equal(getBestLapNum(dataLap1Best), 1);

  // Scenario 3: Multiple updates, minimum bestLap wins
  const dataMultipleUpdates = [
    { lapNumber: 1, bestLap: 70.0 }, // completed lap 0
    { lapNumber: 2, bestLap: 65.0 }, // completed lap 1
    { lapNumber: 3, bestLap: 62.0 }, // completed lap 2 (fastest)
    { lapNumber: 4, bestLap: 68.0 }  // completed lap 3
  ];
  assert.equal(getBestLapNum(dataMultipleUpdates), 2);
});

test('getBestLapNum - fallback behavior when bestLap is 0 or absent', () => {
  assert.equal(getBestLapNum(null), 0);
  assert.equal(getBestLapNum([]), 0);

  // No bestLap recorded, should fallback to most frequent non-zero lap
  const dataNoBestLap = [
    { lapNumber: 1 },
    { lapNumber: 2 },
    { lapNumber: 2 },
    { lapNumber: 2 },
    { lapNumber: 3 }
  ];
  assert.equal(getBestLapNum(dataNoBestLap), 2);

  // Only lap 0 and no bestLap
  const dataOnlyLap0 = [
    { lapNumber: 0 },
    { lapNumber: 0 }
  ];
  assert.equal(getBestLapNum(dataOnlyLap0), 0);
});
