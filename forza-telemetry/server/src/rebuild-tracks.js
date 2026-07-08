import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { buildTrackFromTrajectories } from './track-builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const METADATA_PATH = path.join(DATA_DIR, 'tracks-metadata.json');

// 兼容性的读取/写入函数
function readTrackDetail(trackId) {
  const brPath = path.join(DATA_DIR, 'tracks', `${trackId}.json.br`);
  if (fs.existsSync(brPath)) {
    try {
      const buffer = fs.readFileSync(brPath);
      const decompressed = zlib.brotliDecompressSync(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (e) {
      console.error(`[readTrackDetail] 解压 Brotli 赛道 ${trackId} 失败:`, e.message);
    }
  }
  return null;
}

function writeTrackDetail(trackId, trackDetail) {
  const tracksDir = path.join(DATA_DIR, 'tracks');
  const brPath = path.join(tracksDir, `${trackId}.json.br`);
  try {
    fs.mkdirSync(tracksDir, { recursive: true });
    const jsonStr = JSON.stringify(trackDetail);
    const buffer = Buffer.from(jsonStr, 'utf8');
    const compressed = zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5
      }
    });
    fs.writeFileSync(brPath, compressed);
    return true;
  } catch (err) {
    console.error(`[writeTrackDetail] 压缩写入赛道 ${trackId} 失败:`, err.message);
    return false;
  }
}

// 模拟 generateSectors (若存在)
function generateSectors(centerline, turns) {
  return [];
}
// 模拟 generateNavigationData (若存在)
function generateNavigationData() {
  return {};
}

async function run() {
  console.log('=== 开始重建赛道数据 ===');
  console.log('元数据路径:', METADATA_PATH);
  
  if (!fs.existsSync(METADATA_PATH)) {
    console.error('未找到 tracks-metadata.json');
    return;
  }
  
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
  } catch (e) {
    console.error('解析 tracks-metadata.json 失败:', e.message);
    return;
  }
  
  const trackIds = Object.keys(metadata);
  console.log(`共发现 ${trackIds.length} 个赛道元数据。`);
  
  let updatedCount = 0;
  
  for (const trackId of trackIds) {
    const meta = metadata[trackId];
    console.log(`\n---------------------------`);
    console.log(`处理赛道: [${trackId}] ${meta.name}`);
    
    const detail = readTrackDetail(trackId);
    if (!detail) {
      console.warn(`  未找到该赛道的详细数据包。`);
      continue;
    }
    
    const trajs = detail.trajectories;
    if (!trajs || trajs.length === 0) {
      console.warn(`  该赛道未保存原始轨迹包，无法重建。`);
      continue;
    }
    
    console.log(`  拥有轨迹数: ${trajs.length}，原点数: ${detail.centerline?.length || 0}，原弯道数: ${detail.turns?.length || 0}`);
    
    // 重新运行构建算法（此时已包含 5m 补密和 100m 阈值闭合检测优化）
    const trackData = buildTrackFromTrajectories(trajs);
    if (!trackData) {
      console.error(`  重建失败，未生成有效数据。`);
      continue;
    }
    
    const oldTurnCount = detail.turns?.length || 0;
    const newTurnCount = trackData.turns?.length || 0;
    
    console.log(`  新点数: ${trackData.centerline.length}，新弯道数: ${newTurnCount}，新长度: ${trackData.length} 米`);
    
    // 如果弯道数量或长度发生改变（主要适用于成功识别出环道后切圈，导致点数和弯道数大减）
    if (newTurnCount !== oldTurnCount || Math.abs(trackData.length - (detail.length || 0)) > 100) {
      console.log(`  [更新] 检测到物理特征变化。正在写入更新...`);
      
      detail.points = trackData.centerline;
      detail.centerline = trackData.centerline;
      detail.turns = trackData.turns;
      detail.length = trackData.length;
      detail.updatedAt = new Date().toISOString();
      detail.sectors = generateSectors(trackData.centerline, trackData.turns);
      detail.navigation = generateNavigationData(trackData);
      
      // 保存详情
      writeTrackDetail(trackId, detail);
      
      // 更新元数据
      meta.length = trackData.length;
      meta.pointCount = trackData.centerline.length;
      meta.turnCount = newTurnCount;
      meta.updatedAt = detail.updatedAt;
      
      updatedCount++;
      console.log(`  [成功] 赛道 [${meta.name}] 已成功更新并重建单圈。`);
    } else {
      console.log(`  [无变化] 弯角和长度相同，无需更新。`);
    }
  }
  
  if (updatedCount > 0) {
    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
    console.log(`\n=== 重建完成！共更新了 ${updatedCount} 个赛道的单圈几何结构 ===`);
  } else {
    console.log(`\n=== 重建完成！没有需要更新的赛道 ===`);
  }
}

run();
