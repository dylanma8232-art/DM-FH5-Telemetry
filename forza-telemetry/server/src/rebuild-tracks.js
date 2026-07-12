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
  } catch (e) {
    console.error(`[writeTrackDetail] 压缩写入赛道 ${trackId} 失败:`, e.message);
    return false;
  }
}

/**
 * 写入 JSON 文件
 */
function writeJSON(filepath, data) {
  try {
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`写入文件失败: ${filepath}`, e.message);
    return false;
  }
}

/**
 * 读取 Brotli 压缩的 JSON 文件
 */
function readBrotliJSON(filepath) {
  try {
    const compressed = readFileSync(filepath);
    const decompressed = zlib.brotliDecompressSync(compressed);
    return JSON.parse(decompressed.toString('utf8'));
  } catch (e) {
    console.error(`读取 Brotli 文件失败: ${filepath}`, e.message);
    return null;
  }
}

/**
 * 写入 Brotli 压缩的 JSON 文件
 */
function writeBrotliJSON(filepath, data) {
  try {
    const json = JSON.stringify(data);
    const compressed = zlib.brotliCompressSync(Buffer.from(json), BROTLI_OPTIONS);
    writeFileSync(filepath, compressed);
    return true;
  } catch (e) {
    console.error(`写入 Brotli 文件失败: ${filepath}`, e.message);
    return false;
  }
}

/**
 * 计算轨迹长度
 */
function calculateTrackLength(positions) {
  if (!positions || positions.length < 2) return 0;
  let length = 0;
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i-1].x;
    const dz = positions[i].z - positions[i-1].z;
    length += Math.sqrt(dx * dx + dz * dz);
  }
  return Math.round(length);
}

/**
 * 重建单条赛道
 */
function rebuildTrack(trackId, trackDetail) {
  console.log(`\n重建赛道: ${trackId} (${trackDetail.name})`);
  console.log(`  原始数据: ${trackDetail.trajectoryCount} 条轨迹, ${trackDetail.turnCount || 0} 个弯道, ${trackDetail.length} 米`);
  
  // 获取轨迹数据
  const trajectories = trackDetail.trajectories || [];
  if (trajectories.length === 0) {
    console.log(`  ⚠️ 无轨迹数据，跳过`);
    return null;
  }
  
  // 应用环道检测和重建
  const trackData = buildTrackFromTrajectories(trajectories);
  if (!trackData) {
    console.log(`  ❌ 重建失败`);
    return null;
  }
  
  console.log(`  新数据: ${trackData.turns.length} 个弯道, ${trackData.length} 米, ${trackData.centerline.length} 个中心线点`);
  
  // 更新赛道详情
  const updatedDetail = {
    ...trackDetail,
    points: trackData.centerline,
    centerline: trackData.centerline,
    sectors: generateSectors(trackData.centerline),
    turns: trackData.turns,
    length: trackData.length,
    pointCount: trackData.centerline.length,
    routeBook: trackData.routeBook,
    isLoop: trackData.isLoop || false,
    updatedAt: new Date().toISOString()
  };
  
  // 验证质量
  const quality = validateTrackQuality(updatedDetail);
  console.log(`  质量评分: ${quality.overallScore}/100`);
  
  return updatedDetail;
}

/**
 * 清洗 vehicles.json
 */
function cleanVehiclesData(vehicles, tracksMetadata) {
  console.log('\n=== 清洗 vehicles.json ===');
  
  let cleanedCount = 0;
  let removedCount = 0;
  
  for (const [ordinal, vehicle] of Object.entries(vehicles)) {
    if (!vehicle.tracks || vehicle.tracks.length === 0) continue;
    
    const originalTracks = [...vehicle.tracks];
    const cleanedTracks = [];
    
    for (const trackRef of originalTracks) {
      // 检查是否是 trackId 格式
      if (trackRef.startsWith('track_')) {
        // 已经是 trackId，检查是否存在
        if (tracksMetadata[trackRef]) {
          cleanedTracks.push(trackRef);
        } else {
          console.log(`  移除孤儿 trackId: ${trackRef} (车辆 ${ordinal})`);
          removedCount++;
        }
      } else {
        // 是 trackName，尝试转换为 trackId
        const matchedTrackId = Object.entries(tracksMetadata).find(
          ([id, meta]) => meta.name === trackRef
        )?.[0];
        
        if (matchedTrackId) {
          cleanedTracks.push(matchedTrackId);
          cleanedCount++;
          console.log(`  转换: "${trackRef}" -> ${matchedTrackId} (车辆 ${ordinal})`);
        } else {
          console.log(`  移除无法匹配的 trackName: "${trackRef}" (车辆 ${ordinal})`);
          removedCount++;
        }
      }
    }
    
    vehicle.tracks = cleanedTracks;
  }
  
  console.log(`\n清洗完成: 转换 ${cleanedCount} 条, 移除 ${removedCount} 条孤儿引用`);
  return vehicles;
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
    
    // 强制更新：由于我们升级了双端智能剪裁算法，必须强制重写所有几何中心线以清洗历史残留的尾巴和杂线
    console.log(`  [更新] 正在强行写入赛道几何更新...`);
    
    detail.points = trackData.centerline;
    detail.centerline = trackData.centerline;
    detail.turns = trackData.turns;
    detail.length = trackData.length;
    detail.isLoop = trackData.isLoop || false;
    detail.updatedAt = new Date().toISOString();
    detail.sectors = generateSectors(trackData.centerline, trackData.turns);
    detail.routeBook = trackData.routeBook;
    // navigation removed
    
    // 保存详情
    writeTrackDetail(trackId, detail);
    
    // 更新元数据
    meta.length = trackData.length;
    meta.pointCount = trackData.centerline.length;
    meta.turnCount = newTurnCount;
    meta.isLoop = trackData.isLoop || false;
    meta.updatedAt = detail.updatedAt;
    
    updatedCount++;
    console.log(`  [成功] 赛道 [${meta.name}] 已成功强行更新并重建单圈。`);
  }
  
  if (updatedCount > 0) {
    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
    console.log(`\n=== 重建完成！共更新了 ${updatedCount} 个赛道的单圈几何结构 ===`);
  } else {
    console.log(`\n=== 重建完成！没有需要更新的赛道 ===`);
  }
}

run();

/**
 * 自动平均切分3个Sectors
 */
function generateSectors(centerline) {
  if (!centerline || centerline.length < 10) return [];
  const N = centerline.length;
  const s1Idx = Math.floor(N / 3);
  const s2Idx = Math.floor(2 * N / 3);
  const s3Idx = N - 1;

  return [
    {
      sectorIndex: 1,
      centerlineIndex: s1Idx,
      x: centerline[s1Idx].x,
      y: centerline[s1Idx].y,
      z: centerline[s1Idx].z
    },
    {
      sectorIndex: 2,
      centerlineIndex: s2Idx,
      x: centerline[s2Idx].x,
      y: centerline[s2Idx].y,
      z: centerline[s2Idx].z
    },
    {
      sectorIndex: 3,
      centerlineIndex: s3Idx,
      x: centerline[s3Idx].x,
      y: centerline[s3Idx].y,
      z: centerline[s3Idx].z
    }
  ];
}
