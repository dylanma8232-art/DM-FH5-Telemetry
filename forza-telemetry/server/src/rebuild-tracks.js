#!/usr/bin/env node

/**
 * 数据清洗脚本：重建所有赛道数据
 * 功能：
 * 1. 对所有赛道应用环道检测，提取单圈数据
 * 2. 重建中心线和弯道
 * 3. 清洗 vehicles.json 中的孤儿引用
 * 4. 更新 tracks-metadata.json 索引
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import zlib from 'zlib';
import { buildTrackFromTrajectories, detectTurnsEnhanced, buildRouteBook, validateTrackQuality } from './track-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../../data');
const TRACKS_DIR = join(DATA_DIR, 'tracks');

// Brotli 压缩配置
const BROTLI_OPTIONS = {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
  }
};

/**
 * 读取 JSON 文件
 */
function readJSON(filepath) {
  try {
    const data = readFileSync(filepath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`读取文件失败: ${filepath}`, e.message);
    return null;
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
    turns: trackData.turns,
    length: trackData.length,
    pointCount: trackData.centerline.length,
    routeBook: trackData.routeBook,
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
          // 无法匹配，移除
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

/**
 * 主函数
 */
async function main() {
  console.log('=== 赛道数据重建脚本 ===\n');
  
  // 1. 读取 tracks-metadata.json
  const metadataPath = join(DATA_DIR, 'tracks-metadata.json');
  const metadata = readJSON(metadataPath);
  if (!metadata) {
    console.error('无法读取 tracks-metadata.json');
    process.exit(1);
  }
  
  console.log(`找到 ${Object.keys(metadata).length} 条赛道`);
  
  // 2. 重建每条赛道
  let successCount = 0;
  let failCount = 0;
  
  for (const [trackId, meta] of Object.entries(metadata)) {
    const detailPath = join(TRACKS_DIR, `${trackId}.json.br`);
    
    if (!existsSync(detailPath)) {
      console.log(`\n⚠️ 赛道详情文件不存在: ${trackId}`);
      failCount++;
      continue;
    }
    
    // 读取赛道详情
    const detail = readBrotliJSON(detailPath);
    if (!detail) {
      failCount++;
      continue;
    }
    
    // 重建赛道
    const updatedDetail = rebuildTrack(trackId, detail);
    if (!updatedDetail) {
      failCount++;
      continue;
    }
    
    // 保存重建后的详情
    writeBrotliJSON(detailPath, updatedDetail);
    
    // 更新元数据
    metadata[trackId] = {
      id: trackId,
      name: updatedDetail.name,
      length: updatedDetail.length,
      pointCount: updatedDetail.pointCount,
      turnCount: updatedDetail.turns ? updatedDetail.turns.length : 0,
      trajectoryCount: updatedDetail.trajectoryCount,
      createdAt: updatedDetail.createdAt,
      updatedAt: updatedDetail.updatedAt
    };
    
    successCount++;
  }
  
  console.log(`\n=== 赛道重建完成 ===`);
  console.log(`成功: ${successCount}, 失败: ${failCount}`);
  
  // 3. 保存更新后的元数据
  writeJSON(metadataPath, metadata);
  console.log('\n已更新 tracks-metadata.json');
  
  // 4. 清洗 vehicles.json
  const vehiclesPath = join(DATA_DIR, 'vehicles.json');
  const vehicles = readJSON(vehiclesPath);
  if (vehicles) {
    const cleanedVehicles = cleanVehiclesData(vehicles, metadata);
    writeJSON(vehiclesPath, cleanedVehicles);
    console.log('已更新 vehicles.json');
  }
  
  // 5. 清理残留文件
  const oldTracksFile = join(DATA_DIR, 'tracks.json.br');
  if (existsSync(oldTracksFile)) {
    unlinkSync(oldTracksFile);
    console.log('\n已删除旧格式文件: tracks.json.br');
  }
  
  console.log('\n=== 数据清洗完成 ===');
}

main().catch(console.error);
