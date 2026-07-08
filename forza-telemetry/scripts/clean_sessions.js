#!/usr/bin/env node

/**
 * 数据清洗脚本：规范化历史比赛会话记录的赛道数据
 * 功能：
 * 1. 扫描 data/sessions 下的所有 summary 文件
 * 2. 检查其中的 trackId 与 trackName 字段，如果缺失或者不匹配，使用 tracks-metadata.json 进行校正
 * 3. 规范化车辆基本信息，确保字段健壮
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../data');
const SESSIONS_DIR = join(DATA_DIR, 'sessions');

// 读取 JSON 文件
function readJSON(filepath) {
  try {
    if (!existsSync(filepath)) return null;
    const data = readFileSync(filepath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`读取文件失败: ${filepath}`, e.message);
    return null;
  }
}

// 写入 JSON 文件
function writeJSON(filepath, data) {
  try {
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`写入文件失败: ${filepath}`, e.message);
    return false;
  }
}

async function main() {
  console.log('=== 开始清洗历史比赛记录数据 ===\n');

  const tracksMetadata = readJSON(join(DATA_DIR, 'tracks-metadata.json'));
  if (!tracksMetadata) {
    console.error('无法读取 tracks-metadata.json，终止数据清洗');
    process.exit(1);
  }

  if (!existsSync(SESSIONS_DIR)) {
    console.log('未找到比赛记录存储目录');
    process.exit(0);
  }

  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('_summary.json'));
  console.log(`找到 ${files.length} 个历史记录 summary 文件。`);

  let modifiedCount = 0;

  for (const file of files) {
    const filePath = join(SESSIONS_DIR, file);
    const session = readJSON(filePath);
    if (!session) continue;

    let modified = false;

    // 1. 校正赛道 ID 和赛道名字
    let trackId = session.trackId;
    let trackName = session.trackName;

    if (!trackId || trackId === 'unknown') {
      // 尝试通过名字寻找 ID
      if (trackName && trackName !== '未知赛道') {
        const foundId = Object.keys(tracksMetadata).find(
          id => tracksMetadata[id].name === trackName
        );
        if (foundId) {
          session.trackId = foundId;
          modified = true;
          console.log(`  [会话 ${session.id}] 根据赛道名 "${trackName}" 匹配并补全赛道 ID: ${foundId}`);
        }
      }
    } else if (tracksMetadata[trackId]) {
      // ID 存在，校正名字以确保完全一致
      const correctName = tracksMetadata[trackId].name;
      if (trackName !== correctName) {
        session.trackName = correctName;
        modified = true;
        console.log(`  [会话 ${session.id}] 校正赛道名: "${trackName}" -> "${correctName}"`);
      }
    }

    // 2. 健壮性检查：确保 laps 中存在 best/last/count
    if (!session.laps) {
      session.laps = { best: 0, last: 0, count: 0 };
      modified = true;
    } else {
      if (session.laps.best === undefined) { session.laps.best = 0; modified = true; }
      if (session.laps.last === undefined) { session.laps.last = 0; modified = true; }
      if (session.laps.count === undefined) { session.laps.count = 0; modified = true; }
    }

    if (modified) {
      writeJSON(filePath, session);
      modifiedCount++;
    }
  }

  console.log(`\n=== 数据清洗完成。共更新了 ${modifiedCount} 个会话的属性。 ===`);
}

main().catch(console.error);
