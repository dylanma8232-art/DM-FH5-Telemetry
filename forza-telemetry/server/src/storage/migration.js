import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { readJsonAsync, writeJsonAsync } from './file-db.js';

/**
 * 数据库迁移脚本：自动将旧的 80MB 单体 tracks.json 无损拆分为 tracks-metadata.json 及 data/tracks/<track_id>.json
 * @param {string} dataDir 数据文件夹绝对路径
 */
export async function migrateMonolithicDatabase(dataDir) {
  const oldTracksPath = path.join(dataDir, 'tracks.json');
  if (!existsSync(oldTracksPath)) {
    return;
  }

  console.log('[Migration] 检测到旧的单体 tracks.json 数据库，启动无损拆分数据迁移...');
  try {
    const oldTracks = await readJsonAsync(oldTracksPath, {});
    const metadata = {};
    const subDir = path.join(dataDir, 'tracks');
    
    // 确保子文件夹存在
    await fs.mkdir(subDir, { recursive: true });

    for (const [id, track] of Object.entries(oldTracks)) {
      // 1. 抽取元数据信息用于快速查询列表
      metadata[id] = {
        id: track.id || id,
        name: track.name || '未命名赛道',
        length: track.length || 0,
        pointCount: track.points ? track.points.length : 0,
        trajectoryCount: track.trajectories ? track.trajectories.length : 0,
        createdAt: track.createdAt || new Date().toISOString(),
        updatedAt: track.updatedAt || new Date().toISOString()
      };

      // 2. 将高宽度的赛道点与物理轨迹集存入独立分包 json 中
      const detailPath = path.join(subDir, `${id}.json`);
      await writeJsonAsync(detailPath, {
        id: track.id || id,
        name: track.name || '未命名赛道',
        points: track.points || [],
        centerline: track.centerline || [],
        turns: track.turns || [],
        sectors: track.sectors || [],
        navigation: track.navigation || null,
        trajectories: track.trajectories || [],
        createdAt: track.createdAt || new Date().toISOString(),
        updatedAt: track.updatedAt || new Date().toISOString()
      });
    }

    // 3. 写入极简的 tracks-metadata.json 索引文件
    const metadataPath = path.join(dataDir, 'tracks-metadata.json');
    await writeJsonAsync(metadataPath, metadata);

    // 4. 重命名原 80MB 单体文件为归档备份文件，防止下一次启动时重复执行迁移
    const backupPath = `${oldTracksPath}.bak_sharded`;
    await fs.rename(oldTracksPath, backupPath);
    
    console.log(`[Migration] 数据库分拆成功！元数据索引已保存，旧 tracks.json 归档至: ${path.basename(backupPath)}`);
  } catch (err) {
    console.error('[Migration] 数据库无损分拆迁移失败:', err.stack);
  }
}
