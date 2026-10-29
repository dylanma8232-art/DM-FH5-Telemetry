import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyRDP } from '../src/utils/rdp.js';

test('simplifyRDP - edge cases', () => {
  assert.deepEqual(simplifyRDP(null), []);
  assert.deepEqual(simplifyRDP(undefined), []);
  assert.deepEqual(simplifyRDP([]), []);

  const onePoint = [{ x: 1, y: 2, z: 3 }];
  assert.deepEqual(simplifyRDP(onePoint), onePoint);

  const twoPoints = [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }];
  assert.deepEqual(simplifyRDP(twoPoints), twoPoints);
});

test('simplifyRDP - collinear points', () => {
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 1, z: 1 },
    { x: 2, y: 2, z: 2 },
    { x: 3, y: 3, z: 3 }
  ];
  const expected = [
    { x: 0, y: 0, z: 0 },
    { x: 3, y: 3, z: 3 }
  ];
  assert.deepEqual(simplifyRDP(points, 0.1), expected);
});

test('simplifyRDP - respects epsilon', () => {
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 2, y: 0, z: 0 }
  ];

  // With epsilon > 1, the middle point should be dropped
  assert.deepEqual(simplifyRDP(points, 1.5), [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 }
  ]);

  // With epsilon < 1, the middle point should be kept
  assert.deepEqual(simplifyRDP(points, 0.5), points);
});

test('simplifyRDP - handles missing y coordinates', () => {
  const points = [
    { x: 0, z: 0 },
    { x: 1, z: 1 }, // (1, 0, 1) collinear with (0,0,0) and (2,0,2)
    { x: 2, z: 2 }
  ];

  const expected = [
    { x: 0, z: 0 },
    { x: 2, z: 2 }
  ];

  assert.deepEqual(simplifyRDP(points, 0.1), expected);

  const pointsFar = [
    { x: 0, z: 0 },
    { x: 1, z: 5 },
    { x: 2, z: 0 }
  ];

  assert.deepEqual(simplifyRDP(pointsFar, 4.0), [
    { x: 0, z: 0 },
    { x: 1, z: 5 },
    { x: 2, z: 0 }
  ]);

  assert.deepEqual(simplifyRDP(pointsFar, 6.0), [
    { x: 0, z: 0 },
    { x: 2, z: 0 }
  ]);
});

test('simplifyRDP - coincident start and end', () => {
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 10, z: 10 },
    { x: 0, y: 0, z: 0 }
  ];
  // Start and end are the same.
  // Distance from (10,10,10) to (0,0,0) is sqrt(300) = ~17.32

  assert.deepEqual(simplifyRDP(points, 20), [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
  ]);

  assert.deepEqual(simplifyRDP(points, 10), points);
});
