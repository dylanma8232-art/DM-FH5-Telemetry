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
`);

export const sqliteDb = {
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
  }
};
