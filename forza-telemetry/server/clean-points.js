import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

async function cleanPoints() {
  const tracksDir = path.join(DATA_DIR, 'tracks');
  
  try {
    const files = await fs.readdir(tracksDir);
    let count = 0;
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(tracksDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      
      let trackDetail;
      try {
        trackDetail = JSON.parse(content);
      } catch (e) {
        continue;
      }
      
      // If we have trajectories and centerline, we don't need points (which is causing the old garbled display)
      if (trackDetail.points && trackDetail.centerline && trackDetail.trajectories && trackDetail.trajectories.length > 0) {
        delete trackDetail.points;
        await fs.writeFile(filePath, JSON.stringify(trackDetail, null, 2));
        count++;
        console.log(`Cleaned points from ${file} (${trackDetail.name})`);
      }
    }
    console.log(`Successfully cleaned points from ${count} tracks`);
  } catch (err) {
    console.error('Error cleaning tracks:', err);
  }
}

cleanPoints().catch(console.error);
