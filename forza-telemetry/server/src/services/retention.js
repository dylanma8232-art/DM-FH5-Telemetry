import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// 保留 30 天的高精度轨迹详情，超期文件只保留元数据概要以便在历史记录及排行榜中正常查看
const RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; 

/**
 * 扫描会话目录并自动清理超过 30 天的 _detail.json.br 高清遥测物理包
 * @param {string} sessionsDir sessions 文件夹的绝对路径
 */
export async function runSessionRetentionCleanup(sessionsDir) {
  if (!existsSync(sessionsDir)) return;

  console.log('[Retention] 启动高精遥测文件滚动轮转排查...');
  let cleanedCount = 0;
  const now = Date.now();

  try {
    const files = await fs.readdir(sessionsDir);
    // 找出所有带有详情性质的高精物理文件
    const detailFiles = files.filter(f => f.endsWith('_detail.json.br') || f.endsWith('_detail.json'));

    for (const file of detailFiles) {
      const filepath = path.join(sessionsDir, file);
      try {
        const stats = await fs.stat(filepath);
        const age = now - stats.mtimeMs;
        if (age > RETENTION_PERIOD_MS) {
          await fs.unlink(filepath);
          cleanedCount++;
        }
      } catch (err) {
        console.error(`[Retention] 读取/删除文件 ${file} 失败:`, err.message);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[Retention] 已自动淘汰 ${cleanedCount} 个过期的时序详情数据包，成功释放磁盘空间。`);
    } else {
      console.log('[Retention] 无过期详情遥测包需要清理。');
    }
  } catch (err) {
    console.error('[Retention] 会话轮转清理异常:', err.message);
  }
}
