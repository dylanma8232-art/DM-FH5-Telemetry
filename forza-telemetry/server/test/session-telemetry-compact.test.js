import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompactTelemetry,
  parseCompactFields,
  parseMaxPoints,
  parsePositionFields,
  DEFAULT_COMPACT_FIELDS
} from '../src/services/session-telemetry-compact.js';

function makeSession(count = 1200) {
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      currentLap: i / 20,
      speedKmh: 100 + (i % 90),
      currentEngineRpm: 5000 + (i % 500),
      brake: i % 120,
      accel: i % 255,
      clutch: 0,
      handBrake: 0,
      lapNumber: 1 + Math.floor(i / 900)
    });
  }
  const positions = [];
  for (let i = 0; i < 300; i++) {
    positions.push({
      x: i, y: 0, z: i * 2, yaw: 0.3, speed: 144, lapTime: i / 10, lapNum: 2,
      gear: 4, gLong: 3.1, gLat: 1.2, brake: 0, accel: 200, steer: 0
    });
  }
  return { id: 'session_1', data, positions };
}

test('fields 白名单：默认只返回 positions，非法项被忽略', () => {
  assert.deepEqual(parseCompactFields(undefined), DEFAULT_COMPACT_FIELDS);
  assert.deepEqual(parseCompactFields('positions'), ['positions']);
  assert.deepEqual(parseCompactFields('data,positions'), ['data', 'positions']);
  assert.deepEqual(parseCompactFields('positions,positions'), ['positions']);
  assert.deepEqual(parseCompactFields('nope'), DEFAULT_COMPACT_FIELDS);
  assert.deepEqual(parseCompactFields('data,telemetryDiagnosis'), ['data']);
});

test('maxPoints 解析：非法值视为不降采样', () => {
  assert.equal(parseMaxPoints(undefined), null);
  assert.equal(parseMaxPoints(''), null);
  assert.equal(parseMaxPoints('0'), null);
  assert.equal(parseMaxPoints('abc'), null);
  assert.equal(parseMaxPoints('2'), null);
  assert.equal(parseMaxPoints('450'), 450);
});

test('positionFields 解析：只保留合法字段名并去重', () => {
  assert.equal(parsePositionFields(undefined), null);
  assert.equal(parsePositionFields(''), null);
  assert.equal(parsePositionFields('1bad,*,{}'), null);
  assert.deepEqual(parsePositionFields('x,y,z'), ['x', 'y', 'z']);
  assert.deepEqual(parsePositionFields('x,x,lapTime'), ['x', 'lapTime']);
});

test('positionFields 把 positions 投影成回放所需最小字段集', () => {
  const session = makeSession();
  const full = buildCompactTelemetry(session, { fields: ['positions'] });
  const projected = buildCompactTelemetry(session, { fields: ['positions'], positionFields: ['x', 'y', 'z'] });

  assert.equal(projected.positions.length, full.positions.length);
  for (const point of projected.positions) assert.deepEqual(Object.keys(point), ['x', 'y', 'z']);
  assert.deepEqual(projected.positions[7], { x: 7, y: 0, z: 14 });
  assert.deepEqual(projected.positionFields, ['x', 'y', 'z']);
  assert.equal(projected.positions[0].lapTime, undefined);
});

test('只请求 positions 时不带 data 通道，载荷只含最小字段集', () => {
  const session = makeSession();
  const payload = buildCompactTelemetry(session, { fields: ['positions'] });

  assert.deepEqual(Object.keys(payload).sort(), ['fields', 'id', 'positions']);
  assert.equal(payload.positions.length, 300);
  assert.equal(payload.data, undefined);
});

test('请求 data 且给定 maxPoints 时按 LTTB 收敛点数并保留首尾帧', () => {
  const session = makeSession();
  const payload = buildCompactTelemetry(session, { fields: ['data'], maxPoints: 450 });

  assert.equal(payload.totalDataPoints, 1200);
  assert.equal(payload.downsampled, true);
  assert.equal(payload.data.length, 450);
  assert.deepEqual(payload.data[0], session.data[0]);
  assert.deepEqual(payload.data[payload.data.length - 1], session.data[session.data.length - 1]);
  assert.equal(payload.positions, undefined);
});

test('请求 data 未给 maxPoints 时原样返回（不改变取值）', () => {
  const session = makeSession(30);
  const payload = buildCompactTelemetry(session, { fields: ['data'] });

  assert.equal(payload.downsampled, false);
  assert.equal(payload.data.length, 30);
  assert.deepEqual(payload.data, session.data);
});

test('data 与 positions 同时请求时两个通道都返回', () => {
  const session = makeSession(10);
  const payload = buildCompactTelemetry(session, { fields: ['data', 'positions'], maxPoints: 450 });

  assert.deepEqual(payload.fields, ['data', 'positions']);
  assert.equal(payload.data.length, 10);
  assert.equal(payload.positions.length, 300);
  assert.equal(payload.downsampled, false);
});
