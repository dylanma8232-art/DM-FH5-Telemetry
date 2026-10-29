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
