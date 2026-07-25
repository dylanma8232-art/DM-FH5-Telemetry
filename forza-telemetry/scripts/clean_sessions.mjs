#!/usr/bin/env node

/**
 * 数据清洗脚本 v2：规范化历史比赛会话记录和车辆统计数据
 * 功能：
 * 1. 扫描 data/sessions 下的所有 summary 文件
 * 2. 检查 trackId 与 trackName 字段，使用 tracks-metadata.json 校正
 * 3. 规范化 vehicle 字段，从 vehicles.json 补全缺失的车名等信息
 * 4. 重新计算 vehicles.json 中的 raceCount, tracks, bestLap 字段
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { brotliDecompressSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../data');
const SESSIONS_DIR = join(DATA_DIR, 'sessions');

function readJSON(filepath) {
  try {
    if (!existsSync(filepath)) return null;
    return JSON.parse(readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`读取失败: ${filepath}`, e.message);
    return null;
  }
}

function writeJSON(filepath, data) {
  try {
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`写入失败: ${filepath}`, e.message);
    return false;
  }
}

async function main() {
  console.log('=== 开始执行 V2 深度数据清洗 ===\n');

  const tracksMetadata = readJSON(join(DATA_DIR, 'tracks-metadata.json')) || {};
  const vehiclesData = readJSON(join(DATA_DIR, 'vehicles.json')) || {};
  const CARS_DB_PATH = join(__dirname, '../server/src/config/cars-database.json');
  const carsDatabase = readJSON(CARS_DB_PATH) || {};
  
  if (!existsSync(SESSIONS_DIR)) {
    console.log('未找到比赛记录存储目录');
    process.exit(0);
  }

  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('_summary.json'));
  console.log(`> 找到 ${files.length} 个历史记录 summary 文件。\n`);

  let modifiedSessionsCount = 0;

  // 重置车辆统计数据并修复默认名称
  for (const key in vehiclesData) {
    vehiclesData[key].raceCount = 0;
    vehiclesData[key].tracks = [];
    vehiclesData[key].bestLap = 0;

    // 如果名称是默认的 "Car #<ordinal>" 且数据库中拥有对应真名，则执行自动愈合
    if ((!vehiclesData[key].name || vehiclesData[key].name.startsWith('Car #')) && carsDatabase[key]) {
      console.log(`[车辆名称修复] ${key}: "${vehiclesData[key].name || ''}" -> "${carsDatabase[key]}"`);
      vehiclesData[key].name = carsDatabase[key];
    }
  }

  for (const file of files) {
    const filePath = join(SESSIONS_DIR, file);
    const session = readJSON(filePath);
    if (!session) continue;

    let modified = false;

    // 1. 校正赛道 ID 和赛道名字
    let trackId = session.trackId;
    let trackName = session.trackName;

    if (!trackId || trackId === 'unknown') {
      if (trackName && trackName !== '未知赛道') {
        const foundId = Object.keys(tracksMetadata).find(id => tracksMetadata[id].name === trackName);
        if (foundId) {
          session.trackId = foundId;
          trackId = foundId;
          modified = true;
          console.log(`[会话 ${session.id}] 赛道 ID 补全: ${foundId}`);
        }
      }
    } else if (tracksMetadata[trackId]) {
      const correctName = tracksMetadata[trackId].name;
      if (trackName !== correctName) {
        session.trackName = correctName;
        trackName = correctName;
        modified = true;
        console.log(`[会话 ${session.id}] 赛道名校正: "${trackName}" -> "${correctName}"`);
      }
    }

    // 2. 车辆数据清洗补全
    if (!session.vehicle || !session.vehicle.ordinal) {
      let detailFile = filePath.replace('_summary.json', '_detail_lowfi.json.br');
      if (!existsSync(detailFile)) detailFile = filePath.replace('_summary.json', '_detail_hifi.json.br');
      if (existsSync(detailFile)) {
        try {
          const d = JSON.parse(brotliDecompressSync(readFileSync(detailFile)));
          let recoveredOrdinal = null;
          if (d.data && d.data.length > 0) {
            for (const pt of d.data) {
              if (pt.carOrdinal !== undefined && pt.carOrdinal !== 0) { recoveredOrdinal = pt.carOrdinal; break; }
              if (pt.car && pt.car.ordinal !== undefined && pt.car.ordinal !== 0) { recoveredOrdinal = pt.car.ordinal; break; }
            }
          }
          if (recoveredOrdinal !== null) {
            session.vehicle = { ordinal: recoveredOrdinal };
            console.log(`[会话 ${session.id}] 深入 detail 数据成功找回丢失的 ordinal: ${recoveredOrdinal}`);
            modified = true;
          }
        } catch(e) {
          console.error(`读取 detail 失败: ${e.message}`);
        }
      }
    }

    if (session.vehicle && session.vehicle.ordinal) {
      const ordinal = String(session.vehicle.ordinal);
      const vInfo = vehiclesData[ordinal] || {};
      const carName = session.vehicle.name || vInfo.name || carsDatabase[ordinal] || `车辆 #${ordinal}`;
      const carClass = session.vehicle.class ?? vInfo.class ?? 0;
      const carPI = session.vehicle.performanceIndex ?? vInfo.pi ?? 0;
      const drivetrain = session.vehicle.drivetrain || vInfo.drivetrain || '';

      if (!session.vehicle.name || session.vehicle.name !== carName || session.vehicle.class !== carClass) {
        session.vehicle = {
          ordinal: Number(ordinal),
          name: carName,
          class: carClass,
          performanceIndex: carPI,
          drivetrain: drivetrain
        };
        modified = true;
        console.log(`[会话 ${session.id}] 车辆信息补全: Car #${ordinal} -> ${carName}`);
      }
    } else {
      // console.log(`[会话 ${session.id}] 无车辆信息 (null)`);
    }

    // 3. 圈数数据结构健壮性检查
    if (!session.laps) {
      session.laps = { best: 0, last: 0, count: 0 };
      modified = true;
    } else {
      if (session.laps.best === undefined) { session.laps.best = 0; modified = true; }
      if (session.laps.last === undefined) { session.laps.last = 0; modified = true; }
      if (session.laps.count === undefined) { session.laps.count = 0; modified = true; }
    }

    // 4. 重建车辆的统计信息 (raceCount, tracks, bestLap)
    if (session.vehicle && session.vehicle.ordinal) {
      const ordinal = String(session.vehicle.ordinal);
      if (vehiclesData[ordinal]) {
        vehiclesData[ordinal].raceCount += 1;
        
        // 按照最新格式要求：tracks 存储 trackId 而非 trackName
        if (trackId && trackId.startsWith('track_') && !vehiclesData[ordinal].tracks.includes(trackId)) {
          vehiclesData[ordinal].tracks.push(trackId);
        }
        
        const lapBest = session.laps.best || 0;
        if (lapBest > 0) {
          if (!vehiclesData[ordinal].bestLap || lapBest < vehiclesData[ordinal].bestLap) {
            vehiclesData[ordinal].bestLap = lapBest;
          }
        }
      }
    }

    if (modified) {
      writeJSON(filePath, session);
      modifiedSessionsCount++;
    }
  }

  // 保存重建后的 vehicles 数据
  console.log(`\n> 正在保存重建的车辆统计数据...`);
  writeJSON(join(DATA_DIR, 'vehicles.json'), vehiclesData);

  console.log(`\n=== 数据清洗完成。共修复了 ${modifiedSessionsCount} 个会话。 ===`);
}

main().catch(console.error);
