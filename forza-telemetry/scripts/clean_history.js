const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '../data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const VEHICLES_FILE = path.join(DATA_DIR, 'vehicles.json');

function cleanHistory() {
  console.log('Cleaning historical session data with currentRaceTime fallback...');
  const files = fs.readdirSync(SESSIONS_DIR);
  const summaryFiles = files.filter(f => f.endsWith('_summary.json'));

  const carBestLaps = {}; // carId -> bestLap

  for (const summaryFile of summaryFiles) {
    const summaryPath = path.join(SESSIONS_DIR, summaryFile);
    let summary;
    try {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    } catch (e) {
      continue;
    }

    const sessionId = summary.id;
    const detailLowfiPath = path.join(SESSIONS_DIR, sessionId + '_detail_lowfi.json.br');
    const detailHifiPath = path.join(SESSIONS_DIR, sessionId + '_detail_hifi.json.br');
    
    let detailPath = fs.existsSync(detailLowfiPath) ? detailLowfiPath : null;
    if (!detailPath) detailPath = fs.existsSync(detailHifiPath) ? detailHifiPath : null;

    if (!detailPath) {
      console.log(`No detail file found for ${sessionId}, skipping...`);
      continue;
    }

    try {
      const compressed = fs.readFileSync(detailPath);
      const decompressed = zlib.brotliDecompressSync(compressed);
      const decompressedJson = JSON.parse(decompressed.toString('utf8'));
      const autoRecordedData = decompressedJson.data || [];

      const validBestLaps = autoRecordedData.filter(d => d.bestLap !== undefined && d.bestLap > 0);
      const validLastLaps = autoRecordedData.filter(d => d.lastLap !== undefined && d.lastLap > 0);
      const validRaceTimes = autoRecordedData.filter(d => d.currentRaceTime !== undefined && d.currentRaceTime > 0);
      
      let bestLap = 0;
      if (validBestLaps.length > 0) {
        bestLap = validBestLaps[validBestLaps.length - 1].bestLap;
      } else if (validRaceTimes.length > 0) {
        bestLap = validRaceTimes[validRaceTimes.length - 1].currentRaceTime;
      }

      let lastLap = 0;
      if (validLastLaps.length > 0) {
        lastLap = validLastLaps[validLastLaps.length - 1].lastLap;
      } else if (validRaceTimes.length > 0) {
        lastLap = validRaceTimes[validRaceTimes.length - 1].currentRaceTime;
      }

      if (summary.laps) {
        summary.laps.best = bestLap;
        summary.laps.last = lastLap;
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
        console.log(`Updated ${sessionId}: bestLap=${bestLap.toFixed(3)}, lastLap=${lastLap.toFixed(3)}`);

        const carId = summary.carId || (summary.vehicle ? summary.vehicle.ordinal : null);
        if (carId && bestLap > 0) {
          if (!carBestLaps[carId] || bestLap < carBestLaps[carId]) {
            carBestLaps[carId] = bestLap;
          }
        }
      }
    } catch (e) {
      console.error(`Error processing ${sessionId}:`, e.message);
    }
  }

  // Update vehicles.json
  if (fs.existsSync(VEHICLES_FILE)) {
    try {
      const vehicles = JSON.parse(fs.readFileSync(VEHICLES_FILE, 'utf8'));
      for (const carId in vehicles) {
        if (carBestLaps[carId]) {
          vehicles[carId].bestLap = carBestLaps[carId];
        } else {
          vehicles[carId].bestLap = 0;
        }
      }
      fs.writeFileSync(VEHICLES_FILE, JSON.stringify(vehicles, null, 2), 'utf8');
      console.log('Updated vehicles.json with new best laps.');
    } catch (e) {
      console.error('Error updating vehicles.json:', e.message);
    }
  }
}

cleanHistory();
