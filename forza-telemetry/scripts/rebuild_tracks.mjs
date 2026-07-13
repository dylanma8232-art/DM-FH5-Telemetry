#!/usr/bin/env node

/**
 * 赛道数据重建脚本：使用最新的中心线算法、环道检测及平滑策略重建所有本地赛道数据。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readTrackDetail, writeTrackDetail } from '../server/src/storage/session-db.js';
import { buildTrackFromTrajectories, generateSectors, validateTrackQuality } from '../server/src/track-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const METADATA_PATH = path.join(DATA_DIR, 'tracks-metadata.json');

function readJSON(filepath) {
  try {
    if (!fs.existsSync(filepath)) return {};
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`读取失败: ${filepath}`, e.message);
    return {};
  }
}

function writeJSON(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`写入失败: ${filepath}`, e.message);
    return false;
  }
}

async function main() {
  console.log('=== 开始全量重建赛道中心线与弯道数据 ===\n');

  if (!fs.existsSync(METADATA_PATH)) {
    console.error('未找到 tracks-metadata.json 索引文件，无法进行重建。');
    process.exit(1);
  }

  const metadata = readJSON(METADATA_PATH);
  const trackIds = Object.keys(metadata);
  console.log(`> 找到 ${trackIds.length} 个赛道记录。\n`);

  let updatedCount = 0;

  for (const id of trackIds) {
    const meta = metadata[id];
    console.log(`\n--------------------------------------------`);
    console.log(`[处理中] 赛道: [${id}] "${meta.name}"`);

    const detail = readTrackDetail(id);
    if (!detail) {
      console.warn(`  ⚠️  未找到该赛道的详细几何包。`);
      continue;
    }

    const trajectories = detail.trajectories || (detail.points ? [detail.points] : []);
    if (trajectories.length === 0 || (trajectories.length === 1 && trajectories[0].length === 0)) {
      console.warn(`  ⚠️  无有效轨迹数据，跳过该赛道。`);
      continue;
    }

    console.log(`  - 拥有历史轨迹数: ${trajectories.length}`);
    console.log(`  - 原数据: 长度 ${detail.length || 0}米, 中心线点数 ${detail.centerline?.length || 0}, 弯道数 ${detail.turns?.length || 0}`);

    try {
      // 重新执行最新的合并与构建算法（包含环路补密、缝合以及跨边界弯道属性解析）
      const trackData = buildTrackFromTrajectories(trajectories, {
        oldTurns: detail.turns || [],
        isPaceNoteLocked: detail.isPaceNoteLocked || false,
        deletedTurns: detail.deletedTurns || []
      });

      if (!trackData) {
        console.error(`  ❌ 中心线构建失败！`);
        continue;
      }

      // 更新详情
      detail.points = trackData.centerline;
      detail.centerline = trackData.centerline;
      detail.turns = trackData.turns;
      detail.length = trackData.length;
      detail.isLoop = trackData.isLoop || false;
      detail.sectors = generateSectors(trackData.centerline, trackData.turns);
      detail.routeBook = trackData.routeBook;
      detail.quality = validateTrackQuality(detail);
      detail.updatedAt = new Date().toISOString();

      // 写入 Brotli 压缩数据
      writeTrackDetail(id, detail);

      // 更新元数据
      meta.length = trackData.length;
      meta.pointCount = trackData.centerline.length;
      meta.turnCount = trackData.turns.length;
      meta.isLoop = trackData.isLoop || false;
      meta.updatedAt = detail.updatedAt;

      updatedCount++;
      console.log(`  - ${GREEN}✔ 重建成功！${NC}新长度 ${trackData.length}米, 新中心线点数 ${trackData.centerline.length}, 新弯道数 ${trackData.turns.length}`);
      console.log(`  - 赛道质量评级: ${detail.quality.overallScore}/100`);
    } catch (err) {
      console.error(`  ❌ 重建过程中抛出异常:`, err.message);
    }
  }

  // 保存最新的轻量化元数据
  if (updatedCount > 0) {
    writeJSON(METADATA_PATH, metadata);
    console.log(`\n=== 赛道重建同步完成！共成功更新了 ${updatedCount} 条赛道。 ===`);
  } else {
    console.log('\n=== 未进行任何重建更改。 ===');
  }
}

// 模拟终端颜色输出（如果不支持则回退为空白字符）
const GREEN = process.stdout.isTTY ? '\x1b[32m' : '';
const RED = process.stdout.isTTY ? '\x1b[31m' : '';
const NC = process.stdout.isTTY ? '\x1b[0m' : '';

main().catch(console.error);
