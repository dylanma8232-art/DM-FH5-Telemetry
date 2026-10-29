import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

const DATA_DIR = path.join(process.cwd(), 'benchmark-data');
const sessionsDir = path.join(DATA_DIR, 'sessions');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir);
}

for (let i = 0; i < 2000; i++) {
  const data = {
    trackId: 'track_' + (i % 10),
    vehicle: { ordinal: i % 20 },
    laps: { best: 100, last: 120, count: 5 }
  };
  fs.writeFileSync(path.join(sessionsDir, `session_${i}_summary.json`), JSON.stringify(data));
}

const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));

async function testSync() {
  const start = performance.now();
  for (let i = 0; i < 5; i++) {
    files.forEach((f) => {
      try {
        const s = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
      } catch(e) {}
    });
  }
  const end = performance.now();
  console.log(`Sync Read (5 runs of 2000 files): ${end - start} ms`);
}

async function testAsync() {
  const start = performance.now();
  for (let i = 0; i < 5; i++) {
    await Promise.all(files.map(async (f) => {
      try {
        const s = JSON.parse(await fs.promises.readFile(sessionsDir + '/' + f, 'utf8'));
      } catch(e) {}
    }));
  }
  const end = performance.now();
  console.log(`Async Read (5 runs of 2000 files): ${end - start} ms`);
}

async function run() {
  await testSync();
  await testAsync();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

run();
