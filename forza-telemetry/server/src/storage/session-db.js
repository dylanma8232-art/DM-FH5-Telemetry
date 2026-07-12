import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { writeJsonAsync, writeBrotliAsync } from './file-db.js';
import { detectTurnsEnhanced, generateSectors, buildRouteBook, validateTrackQuality } from '../track-builder.js';

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

export async function writeTrackDetailAsync(trackId, trackDetail) {
  const tracksDir = path.join(DATA_DIR, 'tracks');
  const brPath = path.join(tracksDir, `${trackId}.json.br`);
  const jsonPath = path.join(tracksDir, `${trackId}.json`);
  const gzPath = path.join(tracksDir, `${trackId}.json.gz`);

  try {
    await fs.promises.mkdir(tracksDir, { recursive: true });
    const jsonStr = JSON.stringify(trackDetail);
    const buffer = Buffer.from(jsonStr, 'utf8');
    
    const compressed = await new Promise((resolve, reject) => {
      zlib.brotliCompress(buffer, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 9
        }
      }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    const tmpPath = `${brPath}.tmp`;
    await fs.promises.writeFile(tmpPath, compressed);
    await fs.promises.rename(tmpPath, brPath);

    try {
      await fs.promises.unlink(jsonPath).catch(() => {});
      await fs.promises.unlink(gzPath).catch(() => {});
    } catch {}
    
    return true;
  } catch (err) {
    console.error(`[writeTrackDetailAsync] 压缩写入赛道 ${trackId} 失败:`, err.message);
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

export function generateLowfiTelemetry(hifiData, hifiPositions) {
  if (!hifiData || hifiData.length === 0) {
    return { data: [], positions: hifiPositions || [] };
  }

  const lowfiData = [];
  const keepIndices = new Set();
  const len = hifiData.length;

  for (let i = 0; i < len; i += 12) {
    keepIndices.add(i);
  }
  keepIndices.add(len - 1);

  let lastGear = hifiData[0]?.controls?.gear;
  for (let i = 0; i < len; i++) {
    const frame = hifiData[i];
    if (!frame) continue;

    let isEvent = false;

    const currentGear = frame.controls?.gear;
    if (currentGear !== undefined && currentGear !== lastGear) {
      isEvent = true;
      lastGear = currentGear;
    }

    const tireSlip = frame.tireSlipRatio || {};
    if (
      Math.abs(tireSlip.frontLeft || 0) > 0.15 ||
      Math.abs(tireSlip.frontRight || 0) > 0.15 ||
      Math.abs(tireSlip.rearLeft || 0) > 0.15 ||
      Math.abs(tireSlip.rearRight || 0) > 0.15
    ) {
      isEvent = true;
    }

    const brake = frame.controls?.brake || 0;
    if (brake > 50) {
      isEvent = true;
    }

    const accel = frame.acceleration || {};
    if (Math.abs(accel.x || 0) > 11.7 || Math.abs(accel.z || 0) > 11.7) {
      isEvent = true;
    }

    if (isEvent) {
      const start = Math.max(0, i - 10);
      const end = Math.min(len - 1, i + 10);
      for (let j = start; j <= end; j++) {
        keepIndices.add(j);
      }
    }
  }

  const sortedIndices = Array.from(keepIndices).sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    lowfiData.push(hifiData[idx]);
  }

  const lowfiPositions = [];
  if (hifiPositions && hifiPositions.length > 0) {
    for (let i = 0; i < hifiPositions.length; i += 5) {
      lowfiPositions.push(hifiPositions[i]);
    }
    if ((hifiPositions.length - 1) % 5 !== 0) {
      lowfiPositions.push(hifiPositions[hifiPositions.length - 1]);
    }
  }

  return { data: lowfiData, positions: lowfiPositions };
}

export function saveSession(sessionId, sessionData, tunes) {
  const sessionsDir = path.join(DATA_DIR, 'sessions');

  const summaryData = {
    id: sessionData.id || sessionId,
    trackName: sessionData.trackName || '未知赛道',
    trackId: sessionData.trackId || null,
    savedAt: sessionData.savedAt || new Date().toISOString(),
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

  const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
  writeJsonAsync(summaryPath, summaryData).catch(err => {
    console.error(`[saveSession] 概要写入失败 ${summaryPath}:`, err.message);
  });

  if (sessionData.data && sessionData.data.length > 0) {
    const hifiData = {
      id: sessionData.id || sessionId,
      data: sessionData.data,
      positions: sessionData.positions || []
    };
    const hifiPath = path.join(sessionsDir, `${sessionId}_detail_hifi.json.br`);
    writeBrotliAsync(hifiPath, hifiData).catch(err => {
      console.error(`[saveSession] 高清详情写入失败 ${hifiPath}:`, err.message);
    });

    const { data: lowfiData, positions: lowfiPositions } = generateLowfiTelemetry(sessionData.data, sessionData.positions);
    const lowfiPayload = {
      id: sessionData.id || sessionId,
      data: lowfiData,
      positions: lowfiPositions
    };
    const lowfiPath = path.join(sessionsDir, `${sessionId}_detail_lowfi.json.br`);
    writeBrotliAsync(lowfiPath, lowfiPayload).then(() => {
      const oldBrPath = path.join(sessionsDir, `${sessionId}_detail.json.br`);
      const oldGzPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);
      fs.promises.unlink(oldBrPath).catch(() => {});
      fs.promises.unlink(oldGzPath).catch(() => {});
    }).catch(err => {
      console.error(`[saveSession] 低清骨架详情写入失败 ${lowfiPath}:`, err.message);
    });
  }

  autoCleanupSessionDetails(10);
  return true;
}

export async function saveSessionAsync(sessionId, sessionData) {
  const sessionsDir = path.join(DATA_DIR, 'sessions');

  const summaryData = {
    id: sessionData.id || sessionId,
    trackName: sessionData.trackName || '未知赛道',
    trackId: sessionData.trackId || null,
    savedAt: sessionData.savedAt || new Date().toISOString(),
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

  const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
  await writeJsonAsync(summaryPath, summaryData).catch(err => {
    console.error(`[saveSessionAsync] 概要写入失败 ${summaryPath}:`, err.message);
  });

  if (sessionData.data && sessionData.data.length > 0) {
    const hifiData = {
      id: sessionData.id || sessionId,
      data: sessionData.data,
      positions: sessionData.positions || []
    };
    const hifiPath = path.join(sessionsDir, `${sessionId}_detail_hifi.json.br`);
    await writeBrotliAsync(hifiPath, hifiData).catch(err => {
      console.error(`[saveSessionAsync] 高清详情写入失败 ${hifiPath}:`, err.message);
    });

    const { data: lowfiData, positions: lowfiPositions } = generateLowfiTelemetry(sessionData.data, sessionData.positions);
    const lowfiPayload = {
      id: sessionData.id || sessionId,
      data: lowfiData,
      positions: lowfiPositions
    };
    const lowfiPath = path.join(sessionsDir, `${sessionId}_detail_lowfi.json.br`);
    await writeBrotliAsync(lowfiPath, lowfiPayload).then(() => {
      const oldBrPath = path.join(sessionsDir, `${sessionId}_detail.json.br`);
      const oldGzPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);
      fs.promises.unlink(oldBrPath).catch(() => {});
      fs.promises.unlink(oldGzPath).catch(() => {});
    }).catch(err => {
      console.error(`[saveSessionAsync] 低清骨架详情写入失败 ${lowfiPath}:`, err.message);
    });
  }

  autoCleanupSessionDetails(10);
  return true;
}

export function loadSession(sessionId, tracks) {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  const summaryPath = path.join(sessionsDir, `${sessionId}_summary.json`);
  
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      if (typeof tracks !== 'undefined' && tracks && summary.trackId && tracks[summary.trackId]) {
        summary.trackName = tracks[summary.trackId].name;
      }
      
      Object.defineProperty(summary, 'data', {
        get() {
          if (this._data) return this._data;
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
              this._data = detail.data || [];
            } catch (e) {
              console.error(`[loadSession] 解压 ${sessionId} 细节数据失败:`, e.message);
              this._data = [];
            }
          } else {
            this._data = [];
          }
          return this._data;
        },
        set(val) {
          this._data = val;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(summary, 'positions', {
        get() {
          if (this._positions) return this._positions;
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
              this._positions = detail.positions || [];
            } catch (e) {
              console.error(`[loadSession] 解压 ${sessionId} 轨迹位置数据失败:`, e.message);
              this._positions = [];
            }
          } else {
            this._positions = [];
          }
          return this._positions;
        },
        set(val) {
          this._positions = val;
        },
        configurable: true,
        enumerable: true
      });

      return summary;
    } catch (err) {
      console.error(`[loadSession] 读取会话摘要 ${sessionId} 失败:`, err.message);
      return null;
    }
  }
  
  return null;
}

export function autoCleanupSessionDetails(maxDetailsToKeep = 10) {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) return;
  
  try {
    const files = fs.readdirSync(sessionsDir);
    const summaries = files
      .filter(f => f.endsWith('_summary.json'))
      .map(f => {
        const filePath = path.join(sessionsDir, f);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return {
            id: data.id,
            savedAt: new Date(data.savedAt),
            file: f
          };
        } catch {
          return null;
        }
      })
      .filter(s => s !== null);
    
    summaries.sort((a, b) => b.savedAt - a.savedAt);
    
    if (summaries.length > maxDetailsToKeep) {
      const toCleanup = summaries.slice(maxDetailsToKeep);
      let cleanedCount = 0;
      for (const session of toCleanup) {
        const hifiPath = path.join(sessionsDir, `${session.id}_detail_hifi.json.br`);
        const oldBrPath = path.join(sessionsDir, `${session.id}_detail.json.br`);
        const oldGzPath = path.join(sessionsDir, `${session.id}_detail.json.gz`);
        let deleted = false;
        
        if (fs.existsSync(hifiPath)) {
          try { fs.unlinkSync(hifiPath); deleted = true; } catch {}
        }
        if (fs.existsSync(oldBrPath)) {
          try { fs.unlinkSync(oldBrPath); deleted = true; } catch {}
        }
        if (fs.existsSync(oldGzPath)) {
          try { fs.unlinkSync(oldGzPath); deleted = true; } catch {}
        }
        
        if (deleted) {
          cleanedCount++;
        }
      }
      if (cleanedCount > 0) {
        console.log(`[Cleanup] 自动清理了 ${cleanedCount} 个老旧会话的高清遥测细节，保留了低清骨架与成绩摘要。`);
      }
    }
  } catch (err) {
    console.error('[Cleanup] 运行自动清理失败:', err.message);
  }
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
