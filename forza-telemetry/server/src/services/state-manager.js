import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { DATA_DIR } from '../config/constants.js';
import { readJsonAsync } from '../storage/file-db.js';

export function replaceObjectContents(target, next) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
}

class StateManager {
  constructor() {
    this.vehicles = {};
    this.tracks = {};
    this.tunes = {};
    this.io = null;
    this.DATA_DIR = DATA_DIR;
    
    this.currentData = null;
    this.isManualRecording = false;
    this.manualRecordedData = [];
    this.manualRacePositions = [];
    
    this.trackMode = false;
    this.autoRecordState = 'IDLE';
    this.packetCount = 0;
    this.lastPacketTime = null;
    
    this.lastEmitTime = 0;

    // 赛道性能聚合缓存，防止每次拉取赛道列表时重复读取磁盘数百个 Session 文件
    this.sessionCounts = {};
    this.lastUsedMap = {};
  }

  
  setIO(io) { this.io = io; }
  getCurrentData() { return this.currentData; }
  setCurrentData(data) { this.currentData = data; }
  getTrackMode() { return this.trackMode; }
  setTrackMode(mode) { this.trackMode = mode; }
  getPacketCount() { return this.packetCount; }
  setPacketCount(cnt) { this.packetCount = cnt; }
  getLeaderboardCache() { return this.leaderboardCache; }
  setLeaderboardCache(val) { 
    this.leaderboardCache = val; 
    this.leaderboardCacheTime = Date.now();
  }
  getLeaderboardCacheTime() { return this.leaderboardCacheTime || 0; }
  onRestore(nextTracks, nextVehicles, nextTunes) {
    replaceObjectContents(this.tracks, nextTracks);
    replaceObjectContents(this.vehicles, nextVehicles);
    replaceObjectContents(this.tunes, nextTunes);
  }

  async bootstrap() {
    const vehicles = await readJsonAsync(path.join(DATA_DIR, 'vehicles.json'), {});
    const tunes = await readJsonAsync(path.join(DATA_DIR, 'tunes.json'), {});
    replaceObjectContents(this.vehicles, vehicles);
    replaceObjectContents(this.tunes, tunes);
    
    // 一次性扫描并缓存所有 Session 数据
    const sessionsDir = path.join(DATA_DIR, 'sessions');
    if (existsSync(sessionsDir)) {
      try {
        const files = await fs.readdir(sessionsDir);
        const jsonFiles = files.filter(f => f.endsWith('_summary.json'));
        for (const file of jsonFiles) {
          try {
            const s = await readJsonAsync(path.join(sessionsDir, file), null);
            if (s && s.trackId) {
              this.sessionCounts[s.trackId] = (this.sessionCounts[s.trackId] || 0) + 1;
              const ts = s.savedAt || s.createdAt || s.timestamp;
              if (ts && (!this.lastUsedMap[s.trackId] || ts > this.lastUsedMap[s.trackId])) {
                this.lastUsedMap[s.trackId] = ts;
              }
            }
          } catch {}
        }
        console.log(`[StateManager] 缓存启动加载成功，共分析了 ${jsonFiles.length} 个历史会话。`);
      } catch (err) {
        console.error('[StateManager] 扫描会话文件夹异常:', err.message);
      }
    }
  }

  incrementSessionCount(trackId) {
    if (!trackId) return;
    this.sessionCounts[trackId] = (this.sessionCounts[trackId] || 0) + 1;
    this.lastUsedMap[trackId] = new Date().toISOString();
  }

  decrementSessionCount(trackId) {
    if (!trackId) return;
    this.sessionCounts[trackId] = Math.max(0, (this.sessionCounts[trackId] || 1) - 1);
  }
}

export const stateManager = new StateManager();
