import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PORT = process.env.PORT || 9188;
export const UDP_PORT = process.env.UDP_PORT || 9996;
export const DATA_DIR = path.resolve(__dirname, '../../../data');
export const TRACK_DB_PATH = path.join(DATA_DIR, 'tracks-database.json');

// 遥测数据计算阈值
export const EMIT_INTERVAL_MS = 33; // ~30fps 广播节流
export const CLEANUP_MAX_SESSIONS = 10; // 保留最近圈速包的详情数
export const DOWNSAMPLE_RATIO = 10; // 轨迹降采样间隔点数
