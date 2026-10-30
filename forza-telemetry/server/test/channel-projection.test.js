import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChannelsParam, projectChannels } from '../src/services/channel-projection.js';

const frames = [
  { distance: 0, speed: 100, throttle: 80, brake: 0, tempFL: 80 },
  { distance: 10, speed: 110, throttle: 90, brake: 0, tempFL: 81 },
];

test('未传 channels 时原样返回（与既有全通道响应完全一致）', () => {
  const out = projectChannels(frames, parseChannelsParam(undefined));
  assert.equal(out.frames, frames);
  assert.deepEqual(out.unknown, []);
});

test('投影只保留 distance + 指定通道，数值不变、点数不变', () => {
  const out = projectChannels(frames, parseChannelsParam('speed, throttle'));
  assert.equal(out.frames.length, frames.length);
  assert.deepEqual(Object.keys(out.frames[0]).sort(), ['distance', 'speed', 'throttle']);
  assert.deepEqual(out.frames, frames.map((f) => ({ distance: f.distance, speed: f.speed, throttle: f.throttle })));
});

test('distance 重复出现在参数里不会重复输出', () => {
  const out = projectChannels(frames, parseChannelsParam('distance,speed'));
  assert.deepEqual(Object.keys(out.frames[0]).sort(), ['distance', 'speed']);
});

test('未知通道返回 unknown 列表（路由据此回 400）', () => {
  const out = projectChannels(frames, parseChannelsParam('speed,nope,foo'));
  assert.equal(out.frames, null);
  assert.deepEqual(out.unknown, ['nope', 'foo']);
});

test('空帧数组不抛错', () => {
  assert.deepEqual(projectChannels([], parseChannelsParam('speed')), { frames: [], unknown: [] });
});

test('lapTime 与 distance 一样作为基准字段永远保留', () => {
  const withLap = [{ distance: 0, lapTime: 1.5, speed: 100 }, { distance: 10, lapTime: 2.5, speed: 110 }];
  const out = projectChannels(withLap, parseChannelsParam('speed'));
  assert.deepEqual(Object.keys(out.frames[0]).sort(), ['distance', 'lapTime', 'speed']);
  assert.equal(out.frames[1].lapTime, 2.5);
});

test('显式请求 lapTime 不会重复输出', () => {
  const withLap = [{ distance: 0, lapTime: 1.5, speed: 100 }];
  const out = projectChannels(withLap, parseChannelsParam('lapTime,speed'));
  assert.deepEqual(Object.keys(out.frames[0]).sort(), ['distance', 'lapTime', 'speed']);
});
