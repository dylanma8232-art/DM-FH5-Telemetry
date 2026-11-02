import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(pathToFileURL('./test/jsx-loader.js'), import.meta.url);

const { getCascadedTurnIndices, SPEECH_CASCADE_GAP_METERS } = await import('../src/components/dashboard/PaceNotesPanel.jsx');

test('getCascadedTurnIndices 在闭合环形赛道所有直道间距小于 120m 时单圈内正常终止且不发生死循环', () => {
  // 模拟一个包含 5 个弯道的环形赛道，每个弯到下一个弯的距离都仅为 50 米（< 120 米）
  const turnNotes = [
    { index: 0, distanceToNext: 50 },
    { index: 1, distanceToNext: 50 },
    { index: 2, distanceToNext: 50 },
    { index: 3, distanceToNext: 50 },
    { index: 4, distanceToNext: 50 },
  ];

  const startTime = Date.now();
  // 从 0 号弯出发
  const cascaded = getCascadedTurnIndices(turnNotes, 0, true, SPEECH_CASCADE_GAP_METERS);
  const elapsed = Date.now() - startTime;

  // 必须毫秒级返回，证明没有死循环
  assert.ok(elapsed < 1000, '执行时间应在 1 秒以内');
  // 级联弯道至多覆盖剩余的 4 个弯，且顺序应为 1, 2, 3, 4
  assert.deepEqual(cascaded, [1, 2, 3, 4]);
  // 遍历弯道不重复且不回到起点 0
  assert.equal(cascaded.includes(0), false);
  assert.equal(new Set(cascaded).size, cascaded.length);
});

test('getCascadedTurnIndices 在非环形点对点赛道到达终点时终止', () => {
  const turnNotes = [
    { index: 0, distanceToNext: 60 },
    { index: 1, distanceToNext: 70 },
    { index: 2, distanceToNext: 80 },
  ];

  const cascaded = getCascadedTurnIndices(turnNotes, 0, false, SPEECH_CASCADE_GAP_METERS);
  assert.deepEqual(cascaded, [1, 2]);
});

test('getCascadedTurnIndices 遇到距离大于等于 120m 时截断级联', () => {
  const turnNotes = [
    { index: 0, distanceToNext: 50 },
    { index: 1, distanceToNext: 150 }, // 大于 120m
    { index: 2, distanceToNext: 30 },
  ];

  const cascaded = getCascadedTurnIndices(turnNotes, 0, true, SPEECH_CASCADE_GAP_METERS);
  assert.deepEqual(cascaded, [1]);
});

test('getCascadedTurnIndices 边界条件处理', () => {
  assert.deepEqual(getCascadedTurnIndices([], 0, true), []);
  assert.deepEqual(getCascadedTurnIndices([{ index: 0, distanceToNext: 50 }], 0, true), []);
  assert.deepEqual(getCascadedTurnIndices(null, 0, true), []);
  assert.deepEqual(getCascadedTurnIndices([{ index: 0 }, { index: 1 }], -1, true), []);
  assert.deepEqual(getCascadedTurnIndices([{ index: 0 }, { index: 1 }], 5, true), []);
});
