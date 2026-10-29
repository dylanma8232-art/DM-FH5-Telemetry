import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCarsDatabase, carsDatabasePath } from '../src/storage/reference-store.js';
import { readDiagnosisCache, writeDiagnosisCache, diagnosisCachePath, diagnosisDir } from '../src/storage/diagnosis-store.js';

async function withTempDataDirectory(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'forza-diagnosis-store-'));
  try {
    await run(base);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('车型总库读取返回对象并在未变更时复用同一缓存', () => {
  const first = readCarsDatabase();
  const second = readCarsDatabase();
  assert.equal(typeof first, 'object');
  assert.equal(first, second);
  assert.ok(Object.keys(first).length > 0);
  assert.equal(carsDatabasePath(), path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/config/cars-database.json'));
});

test('诊断缓存缺失或损坏时返回 null', async () => {
  await withTempDataDirectory(async (base) => {
    assert.equal(readDiagnosisCache('session_x', base), null);

    await fs.mkdir(diagnosisDir(base), { recursive: true });
    await fs.writeFile(diagnosisCachePath('session_x', base), '{broken', 'utf8');
    assert.equal(readDiagnosisCache('session_x', base), null);
  });
});

test('诊断缓存写入后可按原结构读回，并自动创建目录', async () => {
  await withTempDataDirectory(async (base) => {
    const payload = { diagnosis: '报告正文', problemId: 'turn-in', customQuestion: '', generatedAt: '2026-01-01T00:00:00.000Z' };
    writeDiagnosisCache('session_y', payload, base);

    assert.deepEqual(readDiagnosisCache('session_y', base), payload);
    assert.equal(diagnosisCachePath('session_y', base), path.join(base, 'diagnoses', 'session_y.json'));
  });
});
