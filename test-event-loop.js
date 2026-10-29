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

for (let i = 0; i < 5000; i++) {
  const data = {
    trackId: 'track_' + (i % 10),
    vehicle: { ordinal: i % 20 },
    laps: { best: 100, last: 120, count: 5 }
  };
  fs.writeFileSync(path.join(sessionsDir, `session_${i}_summary.json`), JSON.stringify(data));
}

const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('_summary.json'));

function testSync() {
  return new Promise((resolve) => {
    const start = performance.now();
    let maxBlock = 0;
    const interval = setInterval(() => {
      const delay = performance.now() - lastTick - 10;
      if (delay > maxBlock) maxBlock = delay;
      lastTick = performance.now();
    }, 10);
    let lastTick = performance.now();

    // Blocking operation
    files.forEach((f) => {
      try {
        const s = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
      } catch(e) {}
    });

    const end = performance.now();
    clearInterval(interval);
    console.log(`Sync Read - Total Time: ${(end - start).toFixed(2)} ms, Max Event Loop Block: ${maxBlock.toFixed(2)} ms`);
    setTimeout(resolve, 100);
  });
}

async function testAsync() {
  return new Promise(async (resolve) => {
    const start = performance.now();
    let maxBlock = 0;
    const interval = setInterval(() => {
      const delay = performance.now() - lastTick - 10;
      if (delay > maxBlock) maxBlock = delay;
      lastTick = performance.now();
    }, 10);
    let lastTick = performance.now();

    // Non-blocking operation
    await Promise.all(files.map(async (f) => {
      try {
        const s = JSON.parse(await fs.promises.readFile(sessionsDir + '/' + f, 'utf8'));
      } catch(e) {}
    }));

    const end = performance.now();
    clearInterval(interval);
    console.log(`Async Read - Total Time: ${(end - start).toFixed(2)} ms, Max Event Loop Block: ${maxBlock.toFixed(2)} ms`);
    setTimeout(resolve, 100);
  });
}

async function run() {
  await testSync();
  await testAsync();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

run();
