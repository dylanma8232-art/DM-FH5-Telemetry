/**
 * 只读参考资料（车型总库等静态配置）的读取边界。
 *
 * 路由层不得自行拼路径 + fs.existsSync + JSON.parse；本模块提供带 mtime 校验的缓存，
 * 文件被替换后自动重新读取，因此不改变「改配置即生效」的既有语义。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CARS_DB_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/cars-database.json');

let cached = null;
let cachedStamp = null;

function statOf(filePath) {
  try {
    const st = fs.statSync(filePath);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

/** 读取车型总库；文件缺失或损坏时返回 {}（与调用方原 existsSync + loadJSON 行为一致） */
export function readCarsDatabase() {
  const stamp = statOf(CARS_DB_PATH);
  if (!stamp) return {};
  if (cached && cachedStamp && cachedStamp.mtimeMs === stamp.mtimeMs && cachedStamp.size === stamp.size) {
    return cached;
  }
  try {
    cached = JSON.parse(fs.readFileSync(CARS_DB_PATH, 'utf8'));
    cachedStamp = stamp;
    return cached;
  } catch {
    return {};
  }
}

export function carsDatabasePath() {
  return CARS_DB_PATH;
}
