import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTrackFromTrajectories } from './src/track-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

async function refreshAllTracks() {
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
      
      const availableTrajectories = (trackDetail.trajectories && trackDetail.trajectories.length > 0)
        ? trackDetail.trajectories
        : (trackDetail.points && trackDetail.points.length > 0 ? [trackDetail.points] : null);
        
      if (!availableTrajectories) {
        continue;
      }
      
      const trackData = buildTrackFromTrajectories(availableTrajectories);
      
      if (trackData) {
        trackDetail.centerline = trackData.centerline;
        trackDetail.turns = trackData.turns;
        trackDetail.length = trackData.length;
        trackDetail.routeBook = trackData.routeBook;
        
        await fs.writeFile(filePath, JSON.stringify(trackDetail, null, 2));
        count++;
      }
    }
    console.log('Successfully rebuilt ' + count + ' tracks with Yaw penalty');
  } catch (err) {
    console.error('Error rebuilding tracks:', err);
  }
}

refreshAllTracks().catch(console.error);
