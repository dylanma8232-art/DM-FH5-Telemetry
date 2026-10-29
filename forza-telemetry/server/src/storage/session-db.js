import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import { sqliteDb } from './sqlite-db.js';


// 获取数据根目录 (相对于此文件)
const DATA_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../data');

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

  if (fs.existsSync(brPath)) {
    try {
      const buffer = fs.readFileSync(brPath);
      const decompressed = zlib.brotliDecompressSync(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (e) {
      console.error(`[readTrackDetail] 解压 Brotli 赛道 ${trackId} 失败:`, e.message);
    }
  }

  if (fs.existsSync(gzPath)) {
    try {
      const buffer = fs.readFileSync(gzPath);
      const decompressed = zlib.gunzipSync(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (e) {
      console.error(`[readTrackDetail] 解压 Gzip 赛道 ${trackId} 失败:`, e.message);
    }
  }

  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`[readTrackDetail] 读取 JSON 赛道 ${trackId} 失败:`, e.message);
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
        [zlib.constants.BROTLI_PARAM_QUALITY]: 9
      }
    });
    
    fs.writeFileSync(brPath, compressed);

    if (fs.existsSync(jsonPath)) {
      try { fs.unlinkSync(jsonPath); } catch {}
    }
    if (fs.existsSync(gzPath)) {
      try { fs.unlinkSync(gzPath); } catch {}
    }
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
    return true;
  } catch (err) {
    console.error(`[deleteTrackDetail] 删除赛道 ${trackId} 失败:`, err.message);
    return false;
  }
}



export function loadSession(sessionId, tracks) {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
  
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      const actualTracks = tracks || loadTracksDatabase();
      if (actualTracks && summary.trackId && actualTracks[summary.trackId]) {
        summary.trackName = actualTracks[summary.trackId].name;
      }
      
      const loadDetailOnce = (obj) => {
        if (obj._detailLoaded) return;
        obj._detailLoaded = true;
        // 1. 优先从 SQLite 读取
        try {
          const row = sqliteDb.getSessionDetail(sessionId);
          if (row && row.hifi_data_br) {
            const decompressed = zlib.brotliDecompressSync(row.hifi_data_br);
            const detail = JSON.parse(decompressed.toString('utf8'));
            obj._data = detail.data || [];
            obj._positions = detail.positions || [];
            return;
          }
        } catch (sqliteErr) {
          console.error(`[loadSession] 从 SQLite 读取 ${sessionId} 数据失败:`, sqliteErr.message);
        }

        // 2. 降级从本地 Brotli/Gzip 压缩包读取，并自动迁移至 SQLite
        const hifiPath = path.join(sessionsDir, `${sessionId}_detail_hifi.json.br`);
        const lowfiPath = path.join(sessionsDir, `${sessionId}_detail_lowfi.json.br`);
        const brPath = path.join(sessionsDir, `${sessionId}_detail.json.br`);
        const gzPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);

        let targetPath = null;
        let isBrotli = true;

        if (fs.existsSync(hifiPath)) {
          targetPath = hifiPath;
        } else if (fs.existsSync(lowfiPath)) {
          targetPath = lowfiPath;
        } else if (fs.existsSync(brPath)) {
          targetPath = brPath;
        } else if (fs.existsSync(gzPath)) {
          targetPath = gzPath;
          isBrotli = false;
        }

        if (targetPath) {
          try {
            const buffer = fs.readFileSync(targetPath);
            const decompressed = isBrotli ? zlib.brotliDecompressSync(buffer) : zlib.gunzipSync(buffer);
            const detail = JSON.parse(decompressed.toString('utf8'));
            obj._data = detail.data || [];
            obj._positions = detail.positions || [];

            // 自动异步迁回 SQLite，以便下次闪电读取
            if (isBrotli && targetPath === hifiPath) {
              let lowfiBr = null;
              if (fs.existsSync(lowfiPath)) {
                lowfiBr = fs.readFileSync(lowfiPath);
              }
              sqliteDb.saveSessionDetail(sessionId, buffer, lowfiBr || buffer);
            }
          } catch (e) {
            console.error(`[loadSession] 解压 ${sessionId} 细节数据失败:`, e.message);
            obj._data = [];
            obj._positions = [];
          }
        } else {
          obj._data = [];
          obj._positions = [];
        }
      };

      Object.defineProperty(summary, 'data', {
        get() {
          if (!this._data) loadDetailOnce(this);
          return this._data;
        },
        set(val) {
          this._data = val;
        },
        configurable: true,
        enumerable: false
      });

      Object.defineProperty(summary, 'positions', {
        get() {
          if (!this._positions) loadDetailOnce(this);
          return this._positions;
        },
        set(val) {
          this._positions = val;
        },
        configurable: true,
        enumerable: false
      });

      return summary;
    } catch (err) {
      console.error(`[loadSession] 读取会话摘要 ${sessionId} 失败:`, err.message);
      return null;
    }
  }
  
  return null;
}



export function migrateOldSessions() {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) return;
  
  try {
    const files = fs.readdirSync(sessionsDir);
    let migratedCount = 0;
    
    for (const file of files) {
      if (file.startsWith('session_') && file.endsWith('.json') && !file.endsWith('_summary.json')) {
        const filePath = path.join(sessionsDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) continue;
          
          console.log(`[Migration] 发现旧的历史会话文件: ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)，正在转换并压缩...`);
          
          const rawContent = fs.readFileSync(filePath, 'utf8');
          const sessionData = JSON.parse(rawContent);
          const id = sessionData.id || file.replace('.json', '');
          
          const summaryData = {
            id: id,
            trackName: sessionData.trackName || '未知赛道',
            trackId: sessionData.trackId || null,
            savedAt: sessionData.savedAt || stats.mtime.toISOString(),
            autoRecorded: sessionData.autoRecorded ?? true,
            trackMode: sessionData.trackMode ?? false,
            tuneId: sessionData.tuneId || null,
            summary: sessionData.summary || {
              dataCount: sessionData.data ? sessionData.data.length : 0,
              positionCount: sessionData.positions ? sessionData.positions.length : 0,
              duration: sessionData.summary?.duration || 0
            },
            vehicle: sessionData.vehicle || null,
            laps: sessionData.laps || {},
            hasDetail: !!(sessionData.data && sessionData.data.length > 0)
          };
          
          const summaryPath = path.join(sessionsDir, `${id}_summary.json`);
          fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');
          
          if (sessionData.data && sessionData.data.length > 0) {
            const detailData = {
              id: id,
              data: sessionData.data,
              positions: sessionData.positions || []
            };
            const detailPath = path.join(sessionsDir, `${id}_detail.json.br`);
            const compressed = zlib.brotliCompressSync(Buffer.from(JSON.stringify(detailData)), {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 9
              }
            });
            fs.writeFileSync(detailPath, compressed);
          }
          
          fs.unlinkSync(filePath);
          migratedCount++;
        } catch (err) {
          console.error(`[Migration] 转换旧文件失败 ${file}:`, err.message);
        }
      }
    }
    
    if (migratedCount > 0) {
      console.log(`[Migration] 成功转换并压缩了 ${migratedCount} 个旧历史会话文件。`);
    }
  } catch (err) {
    console.error('[Migration] 运行迁移任务失败:', err.message);
  }
}
