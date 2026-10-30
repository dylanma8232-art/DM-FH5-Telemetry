import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isSummaryFile,
  listSummaryFileNames,
  listSummaryFileNamesSync,
  readSummaryByFileName,
  readSummaryByFileNameSync,
  readSummarySync,
  readSummaries,
  invalidateSummaryCache,
  summaryExists,
  writeSummary,
  writeSummaryByFileName,
  deleteSessionFiles,
  detailPaths
} from '../src/storage/session-store.js';

async function withTempDataDirectory(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'forza-session-store-'));
  await fs.mkdir(path.join(base, 'sessions'), { recursive: true });
  try {
    await run(base);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 60));

test('摘要文件过滤只认 _summary.json', () => {
  assert.equal(isSummaryFile('session_1_summary.json'), true);
  assert.equal(isSummaryFile('session_1_detail_hifi.json.br'), false);
  assert.equal(isSummaryFile(undefined), false);
});

test('列出、读取摘要时线上与同步两种入口结果一致', async () => {
  await withTempDataDirectory(async (base) => {
    const sessions = path.join(base, 'sessions');
    await fs.writeFile(path.join(sessions, 'session_1_summary.json'), JSON.stringify({ id: 'session_1', laps: { best: 91.5 } }));
    await fs.writeFile(path.join(sessions, 'session_2_summary.json'), JSON.stringify({ id: 'session_2' }));
    await fs.writeFile(path.join(sessions, 'session_1_detail_hifi.json.br'), 'placeholder');

    const asyncList = (await listSummaryFileNames(base)).sort();
    assert.deepEqual(asyncList, ['session_1_summary.json', 'session_2_summary.json']);
    assert.deepEqual(listSummaryFileNamesSync(base).sort(), asyncList);

    assert.deepEqual(await readSummaryByFileName('session_1_summary.json', base), { id: 'session_1', laps: { best: 91.5 } });
    assert.deepEqual(readSummaryByFileNameSync('session_2_summary.json', base), { id: 'session_2' });
  });
});

test('写入摘要保持既有 JSON 结构，并支持按 id 同步读取', async () => {
  await withTempDataDirectory(async (base) => {
    await writeSummary('session_9', { id: 'session_9', trackId: 'track_1' }, base);
    await flush();

    assert.equal(summaryExists('session_9', base), true);
    assert.deepEqual(readSummarySync('session_9', base), { id: 'session_9', trackId: 'track_1' });

    await writeSummaryByFileName('session_10_summary.json', { id: 'session_10' }, base);
    await flush();
    assert.deepEqual(readSummaryByFileNameSync('session_10_summary.json', base), { id: 'session_10' });
  });
});

test('删除会话文件覆盖摘要与全部明细形态，并如实返回是否删除过文件', async () => {
  await withTempDataDirectory(async (base) => {
    const sessions = path.join(base, 'sessions');
    assert.equal(deleteSessionFiles('session_missing', base), false);

    const { hifi, lowfi, br, gz } = detailPaths('session_7', base);
    assert.equal(path.dirname(hifi), sessions);
    await Promise.all([
      fs.writeFile(path.join(sessions, 'session_7_summary.json'), '{}'),
      fs.writeFile(hifi, 'x'),
      fs.writeFile(lowfi, 'x'),
      fs.writeFile(br, 'x'),
      fs.writeFile(gz, 'x')
    ]);

    assert.equal(deleteSessionFiles('session_7', base), true);
    for (const filePath of [path.join(sessions, 'session_7_summary.json'), hifi, lowfi, br, gz]) {
      await assert.rejects(fs.access(filePath));
    }
    assert.equal(deleteSessionFiles('session_7', base), false);
  });
});

test('批量读取摘要：未变文件复用解析结果，变化/损坏/移除各自如实反映', async () => {
  await withTempDataDirectory(async (base) => {
    const sessions = path.join(base, 'sessions');
    const write = (name, payload) => fs.writeFile(path.join(sessions, name), payload);

    await write('session_a_summary.json', JSON.stringify({ id: 'a', bestLap: 100 }));
    await write('session_b_summary.json', JSON.stringify({ id: 'b', bestLap: 200 }));

    const first = await readSummaries(['session_a_summary.json', 'session_b_summary.json'], base);
    assert.deepEqual(first.map((entry) => entry.data), [{ id: 'a', bestLap: 100 }, { id: 'b', bestLap: 200 }]);

    // 未变化 → 复用同一解析对象（缓存命中）
    const unchanged = await readSummaries(['session_a_summary.json', 'session_b_summary.json'], base);
    assert.equal(unchanged[0].data, first[0].data);
    assert.equal(unchanged[1].data, first[1].data);

    // 内容变化 → 必须读到新值（长度变化与同长度变化都要覆盖）
    await write('session_a_summary.json', JSON.stringify({ id: 'a', bestLap: 999, extra: 'x' }));
    const changedSize = await readSummaries(['session_a_summary.json', 'session_b_summary.json'], base);
    assert.deepEqual(changedSize[0].data, { id: 'a', bestLap: 999, extra: 'x' });

    await flush();
    await write('session_b_summary.json', JSON.stringify({ id: 'b', bestLap: 111 }));
    const sameSize = await readSummaries(['session_a_summary.json', 'session_b_summary.json'], base);
    assert.deepEqual(sameSize[1].data, { id: 'b', bestLap: 111 });

    // 损坏文件 → data 为 null，不抛异常
    await write('session_c_summary.json', '{oops');
    const withBroken = await readSummaries(['session_b_summary.json', 'session_c_summary.json'], base);
    assert.deepEqual(withBroken.map((entry) => entry.filename), ['session_b_summary.json', 'session_c_summary.json']);
    assert.equal(withBroken[1].data, null);

    // 移除文件后重新出现且内容不同 → 不能被旧缓存顶替
    await fs.rm(path.join(sessions, 'session_a_summary.json'));
    await readSummaries(['session_b_summary.json'], base);
    await write('session_a_summary.json', JSON.stringify({ id: 'a', bestLap: 5 }));
    const reappeared = await readSummaries(['session_a_summary.json', 'session_b_summary.json'], base);
    assert.deepEqual(reappeared[0].data, { id: 'a', bestLap: 5 });

    // 主动失效后必须重新解析
    const beforeInvalidate = await readSummaries(['session_a_summary.json'], base);
    invalidateSummaryCache();
    const afterInvalidate = await readSummaries(['session_a_summary.json'], base);
    assert.deepEqual(afterInvalidate[0].data, { id: 'a', bestLap: 5 });
    assert.notEqual(afterInvalidate[0].data, beforeInvalidate[0].data);
  });
});

test('批量读取摘要：未变化文件复用解析结果，文件变化后重新解析', async () => {
  await withTempDataDirectory(async (base) => {
    const sessions = path.join(base, 'sessions');
    const first = path.join(sessions, 'session_1_summary.json');
    await fs.writeFile(first, JSON.stringify({ id: 'session_1', laps: { best: 91 } }));
    await fs.writeFile(path.join(sessions, 'session_2_summary.json'), JSON.stringify({ id: 'session_2' }));

    const files = ['session_1_summary.json', 'session_2_summary.json'];
    const run1 = await readSummaries(files, base);
    assert.deepEqual(run1.map((e) => e.data.id), ['session_1', 'session_2']);

    // 命中缓存时返回同一对象引用（未变化就不重复解析）
    const run2 = await readSummaries(files, base);
    assert.equal(run2[0].data, run1[0].data);

    // 内容变化 + mtime 前推后必须重新解析
    await fs.writeFile(first, JSON.stringify({ id: 'session_1', laps: { best: 88 } }));
    const future = new Date(Date.now() + 5000);
    await fs.utimes(first, future, future);
    const run3 = await readSummaries(files, base);
    assert.deepEqual(run3[0].data, { id: 'session_1', laps: { best: 88 } });

    // 损坏文件返回 data: null，与旧实现 try/catch 后返回 null 一致
    await fs.writeFile(first, '{broken');
    const brokenFuture = new Date(Date.now() + 9000);
    await fs.utimes(first, brokenFuture, brokenFuture);
    const run4 = await readSummaries(files, base);
    assert.equal(run4[0].data, null);
    assert.deepEqual(run4[1].data, { id: 'session_2' });

    invalidateSummaryCache();
    const run5 = await readSummaries(files, base);
    assert.equal(run5[0].data, null);
  });
});

test('批量读取摘要会清掉已从目录消失文件的缓存条目', async () => {
  await withTempDataDirectory(async (base) => {
    const sessions = path.join(base, 'sessions');
    await fs.writeFile(path.join(sessions, 'session_a_summary.json'), JSON.stringify({ id: 'a' }));
    await fs.writeFile(path.join(sessions, 'session_b_summary.json'), JSON.stringify({ id: 'b' }));

    const run1 = await readSummaries(await listSummaryFileNames(base), base);
    assert.equal(run1.length, 2);

    await fs.unlink(path.join(sessions, 'session_b_summary.json'));
    const run2 = await readSummaries(await listSummaryFileNames(base), base);
    assert.deepEqual(run2.map((e) => e.data.id), ['a']);

    // 重新创建同名文件后仍需正常读取（旧条目已清理，不会误命中）
    await fs.writeFile(path.join(sessions, 'session_b_summary.json'), JSON.stringify({ id: 'b2' }));
    const run3 = await readSummaries(await listSummaryFileNames(base), base);
    assert.deepEqual(run3.map((e) => e.data.id).sort(), ['a', 'b2']);
  });
});
