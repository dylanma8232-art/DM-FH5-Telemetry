import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import zlib from 'zlib';
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
      if (!file.endsWith('.json') && !file.endsWith('.json.br')) continue;
      
      const isBr = file.endsWith('.br');
      const trackId = file.replace(isBr ? '.json.br' : '.json', '');
      const filePath = path.join(tracksDir, file);
      
      let trackDetail;
      try {
        if (isBr) {
          const buffer = await fs.readFile(filePath);
          const decompressed = zlib.brotliDecompressSync(buffer);
          trackDetail = JSON.parse(decompressed.toString('utf8'));
        } else {
          const content = await fs.readFile(filePath, 'utf8');
          trackDetail = JSON.parse(content);
        }
      } catch (e) {
        console.error(`读取赛道 ${file} 失败:`, e.message);
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
        
        // 压缩并以紧凑一行 JSON 写入为 .json.br
        const jsonStr = JSON.stringify(trackDetail);
        const compressed = zlib.brotliCompressSync(Buffer.from(jsonStr, 'utf8'), {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 5
          }
        });
        
        const brPath = path.join(tracksDir, `${trackId}.json.br`);
        await fs.writeFile(brPath, compressed);
        
        // 如果旧文件是未压缩的明文 .json，删除它以释放空间
        if (!isBr) {
          const jsonPath = path.join(tracksDir, `${trackId}.json`);
          if (existsSync(jsonPath)) {
            await fs.unlink(jsonPath);
          }
        }
        
        count++;
      }
    }
    console.log('Successfully rebuilt and compressed ' + count + ' tracks.');
  } catch (err) {
    console.error('Error rebuilding tracks:', err);
  }
}

refreshAllTracks().catch(console.error);
