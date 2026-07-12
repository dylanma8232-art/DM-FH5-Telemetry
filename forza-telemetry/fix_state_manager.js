const fs = require('fs');

let sm = fs.readFileSync('server/src/services/state-manager.js', 'utf8');

if (!sm.includes('this.io')) {
  sm = sm.replace('this.tunes = {};', `this.tunes = {};
    this.io = null;
    this.DATA_DIR = DATA_DIR;`);
}

sm = sm.replace(/export class StateManager/g, 'class StateManager');

// We also need getters/setters for trackMode, currentTuneId, packetCount, etc.
// But we can just add the missing methods to StateManager.
const methods = `
  setIO(io) { this.io = io; }
  getCurrentData() { return this.currentData; }
  getCurrentTuneId() { return this.currentTuneId; }
  setCurrentTuneId(id) { this.currentTuneId = id; }
  getTrackMode() { return this.trackMode; }
  setTrackMode(mode) { this.trackMode = mode; }
  getLastRecognitionResult() { return this.lastRecognitionResult; }
  setLastRecognitionResult(res) { this.lastRecognitionResult = res; }
  getRecognitionHistory() { return this.recognitionHistory || []; }
  pushToRecognitionHistory(res) {
    if (!this.recognitionHistory) this.recognitionHistory = [];
    this.recognitionHistory.push(res);
    if (this.recognitionHistory.length > 20) this.recognitionHistory = this.recognitionHistory.slice(-20);
  }
  getPacketCount() { return this.packetCount; }
  setPacketCount(cnt) { this.packetCount = cnt; }
  getLeaderboardCache() { return this.leaderboardCache; }
  setLeaderboardCache(val) { 
    this.leaderboardCache = val; 
    this.leaderboardCacheTime = Date.now();
  }
  getLeaderboardCacheTime() { return this.leaderboardCacheTime || 0; }
  onRestore(nextTracks, nextVehicles, nextTunes) {
    Object.keys(this.tracks).forEach(k => delete this.tracks[k]);
    Object.assign(this.tracks, nextTracks);
    Object.keys(this.vehicles).forEach(k => delete this.vehicles[k]);
    Object.assign(this.vehicles, nextVehicles);
    Object.keys(this.tunes).forEach(k => delete this.tunes[k]);
    Object.assign(this.tunes, nextTunes);
  }
`;

if (!sm.includes('setIO(')) {
  sm = sm.replace('async bootstrap() {', methods + '\n  async bootstrap() {');
}

fs.writeFileSync('server/src/services/state-manager.js', sm);
console.log('state-manager.js updated');

