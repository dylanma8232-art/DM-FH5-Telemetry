import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';

// 异步解压：zlib 的回调式 API 不能直接 await，必须 promisify
const brotliDecompressAsync = promisify(zlib.brotliDecompress);
const gunzipAsync = promisify(zlib.gunzip);

import { createTrackDetailCache } from './track-detail-cache.js';

/**
 * 赛道持久化边界（A5）。
 *
 * 赛道详情的 Brotli 压缩读写、进程内 LRU、赛道索引（tracks-metadata.json）
 * 全部由本模块独占；路由与服务层只能通过这里的函数读写赛道文件。
 * 实现自 session-db.js 机械搬移（逐字节等价），session-db 仍在底部再导出以兼容既有导入。
 */

// 获取数据根目录 (相对于此文件)
export const DATA_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../data');

// 赛道详情进程内 LRU：30s TTL + 文件 stat 双重校验（外部/worker 写入会被 stat 自然失效）
function statTrackFile(filePath) {
  try {
    const st = fs.statSync(filePath);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

const trackDetailCache = createTrackDetailCache({ statFile: statTrackFile });

/** 写/删赛道详情时必须调用：让进程内缓存立即失效 */
export function invalidateTrackDetailCache(trackId) {
  trackDetailCache.invalidate(trackId);
}

export function loadTracksDatabase() {
  const metadataPath = path.join(DATA_DIR, 'tracks-metadata.json');
  if (fs.existsSync(metadataPath)) {
    try {
      return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (err) {
      console.error('[loadTracksDatabase] 读取 tracks-metadata.json 失败:', err.message);
    }
  }
  
  // 降级兼容
  const brPath = path.join(DATA_DIR, 'tracks.json.br');
  if (fs.existsSync(brPath)) {
    try {
      const buffer = fs.readFileSync(brPath);
      const decompressed = zlib.brotliDecompressSync(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (err) {
      console.error('[loadTracksDatabase] 读取 tracks.json.br 失败:', err.message);
    }
  }
  
  return {};
}

export function saveTracksDatabase(data) {
  const metadataPath = path.join(DATA_DIR, 'tracks-metadata.json');
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`[saveTracksDatabase] 写入 tracks-metadata.json 失败:`, err.message);
    return false;
  }
}

export function readTrackDetail(trackId) {
  const tracksDir = path.join(DATA_DIR, 'tracks');
  const brPath = path.join(tracksDir, `${trackId}.json.br`);
  const gzPath = path.join(tracksDir, `${trackId}.json.gz`);
  const jsonPath = path.join(tracksDir, `${trackId}.json`);

  const cached = trackDetailCache.get(trackId, [brPath, gzPath, jsonPath]);
  if (cached) return cached;

  if (fs.existsSync(brPath)) {
    try {
      const buffer = fs.readFileSync(brPath);
      const decompressed = zlib.brotliDecompressSync(buffer);
      const detail = JSON.parse(decompressed.toString('utf8'));
      trackDetailCache.remember(trackId, brPath, detail);
      return detail;
    } catch (e) {
      console.error(`[readTrackDetail] 解压 Brotli 赛道 ${trackId} 失败:`, e.message);
    }
  }

  if (fs.existsSync(gzPath)) {
    try {
      const buffer = fs.readFileSync(gzPath);
      const decompressed = zlib.gunzipSync(buffer);
      const detail = JSON.parse(decompressed.toString('utf8'));
      trackDetailCache.remember(trackId, gzPath, detail);
      return detail;
    } catch (e) {
      console.error(`[readTrackDetail] 解压 Gzip 赛道 ${trackId} 失败:`, e.message);
    }
  }

  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf8');
      const detail = JSON.parse(content);
      trackDetailCache.remember(trackId, jsonPath, detail);
      return detail;
    } catch (e) {
      console.error(`[readTrackDetail] 读取 JSON 赛道 ${trackId} 失败:`, e.message);
    }
  }

  return null;
}

export async function readTrackDetailAsync(trackId, baseDir = DATA_DIR) {
  const tracksDir = path.join(baseDir, 'tracks');
  const brPath = path.join(tracksDir, `${trackId}.json.br`);
  const gzPath = path.join(tracksDir, `${trackId}.json.gz`);
  const jsonPath = path.join(tracksDir, `${trackId}.json`);

  if (fs.existsSync(brPath)) {
    try {
      const buffer = await fs.promises.readFile(brPath);
      const decompressed = await brotliDecompressAsync(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (e) {
      console.error(`[readTrackDetailAsync] 解压 Brotli 赛道 ${trackId} 失败:`, e.message);
    }
  }

  if (fs.existsSync(gzPath)) {
    try {
      const buffer = await fs.promises.readFile(gzPath);
      const decompressed = await gunzipAsync(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (e) {
      console.error(`[readTrackDetailAsync] 解压 Gzip 赛道 ${trackId} 失败:`, e.message);
    }
  }

  if (fs.existsSync(jsonPath)) {
    try {
      const content = await fs.promises.readFile(jsonPath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`[readTrackDetailAsync] 读取 JSON 赛道 ${trackId} 失败:`, e.message);
    }
  }

  return null;
}

export function writeTrackDetail(trackId, trackDetail) {
  const tracksDir = path.join(DATA_DIR, 'tracks');
  const brPath = path.join(tracksDir, `${trackId}.json.br`);
  const jsonPath = path.join(tracksDir, `${trackId}.json`);
  const gzPath = path.join(tracksDir, `${trackId}.json.gz`);

  try {
    fs.mkdirSync(tracksDir, { recursive: true });
    const jsonStr = JSON.stringify(trackDetail);
    const buffer = Buffer.from(jsonStr, 'utf8');
    
    const compressed = zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4
      }
    });

    fs.writeFileSync(brPath, compressed);

    if (fs.existsSync(jsonPath)) {
      try { fs.unlinkSync(jsonPath); } catch {}
    }
    if (fs.existsSync(gzPath)) {
      try { fs.unlinkSync(gzPath); } catch {}
    }
    invalidateTrackDetailCache(trackId);
    return true;
  } catch (err) {
    console.error(`[writeTrackDetail] 压缩写入赛道 ${trackId} 失败:`, err.message);
    return false;
  }
}



export function deleteTrackDetail(trackId) {
  const tracksDir = path.join(DATA_DIR, 'tracks');
  const brPath = path.join(tracksDir, `${trackId}.json.br`);
  const jsonPath = path.join(tracksDir, `${trackId}.json`);
  const gzPath = path.join(tracksDir, `${trackId}.json.gz`);

  try {
    if (fs.existsSync(brPath)) fs.unlinkSync(brPath);
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    if (fs.existsSync(gzPath)) fs.unlinkSync(gzPath);
    invalidateTrackDetailCache(trackId);
    return true;
  } catch (err) {
    console.error(`[deleteTrackDetail] 删除赛道 ${trackId} 失败:`, err.message);
    return false;
  }
}



