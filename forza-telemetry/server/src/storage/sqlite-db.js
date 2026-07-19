import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'telemetry.db');
const db = new Database(dbPath);

// 开启 WAL 极速写入模式，优化高频小写入性能
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions_detail (
    id TEXT PRIMARY KEY,
    hifi_data_br BLOB,
    lowfi_data_br BLOB,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vehicle_pi_calibrations (
    vehicle_id TEXT,
    slot_id TEXT,
    option_id TEXT,
    bias_pi INTEGER,
    PRIMARY KEY (vehicle_id, slot_id, option_id)
  );

  CREATE TABLE IF NOT EXISTS vehicle_pi_observations (
    vehicle_id TEXT,
    signature TEXT,
    confirmed_pi INTEGER NOT NULL,
    estimated_pi INTEGER,
    source TEXT,
    observed_at TEXT,
    PRIMARY KEY (vehicle_id, signature)
  );
`);

export const sqliteDb = {
  /**
   * 保存特定车型某个改装件的 PI 偏置校准值 (SQLite 增量自学习偏置)
   */
  savePiCalibration: (vehicleId, slotId, optionId, biasPi) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO vehicle_pi_calibrations (vehicle_id, slot_id, option_id, bias_pi)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(vehicleId, slotId, optionId, biasPi);
  },

  /**
   * 获取特定车型的所有改装件 PI 偏置校准值
   */
  getPiCalibrations: (vehicleId) => {
    try {
      const stmt = db.prepare(`
        SELECT slot_id, option_id, bias_pi FROM vehicle_pi_calibrations WHERE vehicle_id = ?
      `);
      return stmt.all(vehicleId) || [];
    } catch (e) {
      console.error(`[sqliteDb] 获取 ${vehicleId} 校准数据失败:`, e.message);
      return [];
    }
  },
  savePiObservation: ({ vehicleId, signature, confirmedPi, estimatedPi, source = '玩家游戏内实测' }) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO vehicle_pi_observations
        (vehicle_id, signature, confirmed_pi, estimated_pi, source, observed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(String(vehicleId), String(signature), Number(confirmedPi), Number.isFinite(Number(estimatedPi)) ? Number(estimatedPi) : null, String(source), new Date().toISOString());
  },
  getPiObservation: (vehicleId, signature) => {
    try {
      const stmt = db.prepare(`SELECT vehicle_id, signature, confirmed_pi, estimated_pi, source, observed_at FROM vehicle_pi_observations WHERE vehicle_id = ? AND signature = ?`);
      return stmt.get(String(vehicleId), String(signature)) || null;
    } catch (e) {
      console.error(`[sqliteDb] 获取 ${vehicleId} 组合实测 PI 失败:`, e.message);
      return null;
    }
  },
  /**
   * 保存 Session 时序细节包 (原子事务写入)
   */
  saveSessionDetail: (sessionId, hifiBrBuffer, lowfiBrBuffer) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sessions_detail (id, hifi_data_br, lowfi_data_br, updated_at)
      VALUES (?, ?, ?, ?)
  `);
    
    // 执行原子提交
    const now = new Date().toISOString();
    const run = db.transaction(() => {
      stmt.run(sessionId, hifiBrBuffer, lowfiBrBuffer, now);
    });
    run();
  },

  /**
   * 获取 Session 细节包
   */
  getSessionDetail: (sessionId) => {
    const stmt = db.prepare(`
      SELECT hifi_data_br, lowfi_data_br FROM sessions_detail WHERE id = ?
    `);
    return stmt.get(sessionId);
  },

  /**
   * 删除 Session 细节
   */
  deleteSessionDetail: (sessionId) => {
    const stmt = db.prepare(`
      DELETE FROM sessions_detail WHERE id = ?
    `);
    stmt.run(sessionId);
  },

  /**
   * 一键静默历史大碎文件全面归并搬迁入库，并彻底删除物理大文件
   */
  migrateAllOldSessions: () => {
    const sessionsDir = path.join(DATA_DIR, 'sessions');
    if (!fs.existsSync(sessionsDir)) return;

    try {
      const files = fs.readdirSync(sessionsDir);
      let count = 0;
      
      // 提取出所有含有 _detail 字样的 br 文件
      const brFiles = files.filter(f => f.includes('_detail') && f.endsWith('.br'));
      
      // 提取出所有 session 标志 ID
      const sessionIds = new Set();
      for (const file of brFiles) {
        const id = file.split('_detail')[0];
        if (id) sessionIds.add(id);
      }
      
      for (const sessionId of sessionIds) {
        const hifiPath = path.join(sessionsDir, `${sessionId}_detail_hifi.json.br`);
        const lowfiPath = path.join(sessionsDir, `${sessionId}_detail_lowfi.json.br`);
        const oldBrPath = path.join(sessionsDir, `${sessionId}_detail.json.br`);
        
        try {
          const stmtCheck = db.prepare(`SELECT 1 FROM sessions_detail WHERE id = ?`);
          const exists = stmtCheck.get(sessionId);
          
          if (!exists) {
            // 找存在的 buffer
            let hifiBuffer = null;
            let lowfiBuffer = null;
            
            if (fs.existsSync(hifiPath)) hifiBuffer = fs.readFileSync(hifiPath);
            else if (fs.existsSync(oldBrPath)) hifiBuffer = fs.readFileSync(oldBrPath);
            
            if (fs.existsSync(lowfiPath)) lowfiBuffer = fs.readFileSync(lowfiPath);
            
            // 兜底互相填充
            if (hifiBuffer && !lowfiBuffer) lowfiBuffer = hifiBuffer;
            if (!hifiBuffer && lowfiBuffer) hifiBuffer = lowfiBuffer;
            
            if (hifiBuffer || lowfiBuffer) {
              const stmtInsert = db.prepare(`
                INSERT OR REPLACE INTO sessions_detail (id, hifi_data_br, lowfi_data_br, updated_at)
                VALUES (?, ?, ?, ?)
              `);
              stmtInsert.run(sessionId, hifiBuffer, lowfiBuffer, new Date().toISOString());
            }
          }
          
          // 一旦数据库有备份，彻底销毁磁盘上的大碎文件！
          if (fs.existsSync(hifiPath)) fs.unlinkSync(hifiPath);
          if (fs.existsSync(lowfiPath)) fs.unlinkSync(lowfiPath);
          if (fs.existsSync(oldBrPath)) fs.unlinkSync(oldBrPath);
          
          const oldGzPath = path.join(sessionsDir, `${sessionId}_detail.json.gz`);
          if (fs.existsSync(oldGzPath)) fs.unlinkSync(oldGzPath);
          
          count++;
        } catch (e) {
          console.error(`[SQLite Migration] 彻底迁移 ${sessionId} 细节失败:`, e.message);
        }
      }
      
      if (count > 0) {
        console.log(`[SQLite Migration] 🎉 彻底大清扫！已强力归并并销毁了 ${count} 组历史遥测碎物理文件。`);
      }
    } catch (err) {
      console.error('[SQLite Migration] 全量彻底迁移老文件出错:', err.message);
    }
  }
};
