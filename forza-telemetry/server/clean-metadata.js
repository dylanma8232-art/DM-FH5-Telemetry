import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const METADATA_PATH = path.join(DATA_DIR, 'tracks-metadata.json');

try {
  if (fs.existsSync(METADATA_PATH)) {
    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    const tracksDir = path.join(DATA_DIR, 'tracks');
    const files = fs.readdirSync(tracksDir).filter(f => f.endsWith('.json') || f.endsWith('.json.br'));

    let count = 0;
    for (const file of files) {
      const isBr = file.endsWith('.br');
      const id = file.replace(isBr ? '.json.br' : '.json', '');
      const filePath = path.join(tracksDir, file);
      if (!fs.existsSync(filePath)) continue;
      
      let detail = null;
      try {
        if (isBr) {
          const buffer = fs.readFileSync(filePath);
          const decompressed = zlib.brotliDecompressSync(buffer);
          detail = JSON.parse(decompressed.toString('utf8'));
        } else {
          detail = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      } catch (err) {
        console.error(`读取赛道 ${file} 失败:`, err.message);
        continue;
      }

      if (metadata[id]) {
        metadata[id].length = detail.length || metadata[id].length || 0;
        metadata[id].pointCount = detail.centerline ? detail.centerline.length : (detail.points ? detail.points.length : 0);
        metadata[id].turnCount = detail.turns ? detail.turns.length : 0;
        metadata[id].trajectoryCount = detail.trajectoryCount || metadata[id].trajectoryCount || 1;
        
        // Remove heavyweight arrays to keep metadata lightweight
        delete metadata[id].turns;
        delete metadata[id].centerline;
        delete metadata[id].points;
        delete metadata[id].trajectories;
        delete metadata[id].routeBook;
        delete metadata[id].sectors;
        delete metadata[id].navigation;
        delete metadata[id].quality;

        count++;
      }
    }

    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf8');
    console.log(`Successfully aligned metadata for ${count} tracks and cleaned up heavyweight arrays.`);
  } else {
    console.log('metadata file not found');
  }
} catch (e) {
  console.error(e);
}
