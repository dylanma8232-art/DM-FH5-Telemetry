import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_FORMATS, buildSessionCsv, buildSessionJson, buildSessionReportHtml } from '../src/services/export-builder.js';

const session = {
  id: 'session_test',
  trackName: '测试环道',
  savedAt: '2026-10-29T10:00:00.000Z',
  vehicle: { ordinal: 3051, name: '测试车', class: 4, performanceIndex: 900, drivetrain: 'AWD' },
  summary: { dataCount: 2, positionCount: 2, duration: 95 },
  laps: { best: 62.345, last: 63.0, count: 2 },
  data: [
    { timestampMS: 1000, speedKmh: 120, currentEngineRpm: 6000, controls: { accel: 255, brake: 0, steer: 0, gear: 4 }, position: { x: 1, y: 2, z: 3 }, tireTemp: { frontLeft: 80, frontRight: 81, rearLeft: 82, rearRight: 83 }, suspensionTravelMeters: { frontLeft: 0.1, frontRight: 0.11, rearLeft: 0.12, rearRight: 0.13 }, acceleration: { x: 0.5, y: 0.1, z: -0.2 } },
    { timestampMS: 1016, speedKmh: 121, currentEngineRpm: 6050, controls: { accel: 250, brake: 5, steer: -20, gear: 4 }, position: { x: 1.5, y: 2, z: 3.5 }, tireTemp: { frontLeft: 80.5, frontRight: 81.5, rearLeft: 82.5, rearRight: 83.5 }, suspensionTravelMeters: { frontLeft: 0.11, frontRight: 0.12, rearLeft: 0.13, rearRight: 0.14 }, acceleration: { x: 0.6, y: 0.1, z: -0.3 } },
  ],
};

test('CSV 导出：表头 + 每帧一行，时间为相对第一帧的秒数', () => {
  const csv = buildSessionCsv(session);
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'CSV 必须以 UTF-8 BOM 开头');
  const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('时间(秒),速度(千米/小时),转速'));
  assert.ok(lines[1].startsWith('0,120,6000,4,100,0,0,1,2,3'));
  assert.ok(lines[2].startsWith('0.016,121,6050,4'));
});

test('CSV 导出：空会话只有表头，CSV 特殊字符被正确转义', () => {
  assert.equal(buildSessionCsv({ data: [] }).replace(/^\uFEFF/, '').trim().split('\r\n').length, 1);
  const tricky = buildSessionCsv({ data: [{ speedKmh: 1, controls: { gear: '4,"x' } }] });
  assert.ok(tricky.includes('"4,""x"'));
});

test('JSON 导出保留 summary 与帧数据（含非枚举 getter 形态的 data），且剔除内部标记 _detailLoaded', () => {
  const withGetter = { ...session, _detailLoaded: true };
  Object.defineProperty(withGetter, 'data', { get: () => session.data, enumerable: false });
  const parsed = JSON.parse(buildSessionJson(withGetter));
  assert.equal(parsed.session.trackName, '测试环道');
  assert.equal(parsed.session.data.length, 2);
  assert.equal(parsed.session._detailLoaded, undefined);
  assert.ok(parsed.exportedAt);
});

test('报告导出为纯中文 HTML，包含赛道/车辆/圈速统计', () => {
  const html = buildSessionReportHtml(session);
  assert.ok(html.includes('<title>比赛报告 · 测试环道</title>'));
  for (const text of ['测试环道', '测试车', '最快单圈', '1:02.345', '遥测帧数', '2']) {
    assert.ok(html.includes(text), `报告应包含 ${text}`);
  }
  assert.ok(!/<\/?(script|iframe)/i.test(html), '报告不得内嵌脚本');
});

test('导出格式白名单固定为 csv/json/report', () => {
  assert.deepEqual([...EXPORT_FORMATS].sort(), ['csv', 'json', 'report']);
});
