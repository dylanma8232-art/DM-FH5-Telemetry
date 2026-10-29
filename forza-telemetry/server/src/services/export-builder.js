/**
 * 比赛记录导出构建器（纯函数，便于契约测试）。
 *
 * 只消费 `loadSession()` 返回的结构：summary 元信息 + data 帧数组，
 * 不读写文件、不依赖 express，路由层只负责格式分派与响应头。
 */

const CSV_COLUMNS = [
  ['时间(秒)', (f, i) => frameTimeSeconds(f, i)],
  ['速度(千米/小时)', (f) => round(f.speedKmh, 2)],
  ['转速', (f) => round(f.currentEngineRpm, 0)],
  ['档位', (f) => f.controls?.gear ?? ''],
  ['油门(%)', (f) => round(pct(f.controls?.accel), 0)],
  ['刹车(%)', (f) => round(pct(f.controls?.brake), 0)],
  ['转向(%)', (f) => round(steerPct(f.controls?.steer), 0)],
  ['位置X', (f) => round(f.position?.x, 3)],
  ['位置Y', (f) => round(f.position?.y, 3)],
  ['位置Z', (f) => round(f.position?.z, 3)],
  ['胎温左前(摄氏度)', (f) => round(f.tireTemp?.frontLeft, 1)],
  ['胎温右前(摄氏度)', (f) => round(f.tireTemp?.frontRight, 1)],
  ['胎温左后(摄氏度)', (f) => round(f.tireTemp?.rearLeft, 1)],
  ['胎温右后(摄氏度)', (f) => round(f.tireTemp?.rearRight, 1)],
  ['悬挂行程左前(米)', (f) => round(f.suspensionTravelMeters?.frontLeft, 4)],
  ['悬挂行程右前(米)', (f) => round(f.suspensionTravelMeters?.frontRight, 4)],
  ['悬挂行程左后(米)', (f) => round(f.suspensionTravelMeters?.rearLeft, 4)],
  ['悬挂行程右后(米)', (f) => round(f.suspensionTravelMeters?.rearRight, 4)],
  ['纵向加速度', (f) => round(f.acceleration?.z, 3)],
  ['横向加速度', (f) => round(f.acceleration?.x, 3)],
  ['垂直加速度', (f) => round(f.acceleration?.y, 3)],
];

function round(value, digits) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return digits === 0 ? Math.round(num) : Number(num.toFixed(digits));
}

function pct(raw) {
  const num = Number(raw);
  return Number.isFinite(num) ? (num / 255) * 100 : 0;
}

function steerPct(raw) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.max(-100, Math.min(100, (num / 127) * 100));
}

function frameTimeSeconds(frame, index) {
  const base = Number(frame?.timestampMS);
  if (!Number.isFinite(base) || base <= 0) return index;
  const first = Number(frame?.__firstTimestampMS);
  return first ? (base - first) / 1000 : base / 1000;
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildSessionCsv(session) {
  const frames = Array.isArray(session?.data) ? session.data : [];
  const firstTimestamp = frames.length ? Number(frames[0]?.timestampMS) : NaN;
  const lines = [CSV_COLUMNS.map(([title]) => csvCell(title)).join(',')];
  frames.forEach((frame, index) => {
    const view = { __firstTimestampMS: firstTimestamp, ...frame };
    lines.push(CSV_COLUMNS.map(([, pick]) => csvCell(pick(view, index))).join(','));
  });
  // Excel 直接双击打开时按 UTF-8 with BOM 解码，避免中文表头乱码
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function buildSessionJson(session) {
  // loadSession() 的 data/positions 是非枚举 getter，展开运算符不会带上，
  // 因此必须显式取出，否则导出的 JSON 会缺少遥测帧。
  const { _detailLoaded, ...rest } = session || {};
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    session: { ...rest, data: session?.data || [], positions: session?.positions || [] },
  }, null, 2);
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function formatLapTime(seconds) {
  const num = Number(seconds);
  if (!Number.isFinite(num) || num <= 0) return '--';
  const mins = Math.floor(num / 60);
  const secs = Math.floor(num % 60);
  const ms = Math.round((num % 1) * 1000);
  return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function formatDuration(seconds) {
  const num = Number(seconds);
  if (!Number.isFinite(num) || num <= 0) return '--';
  const mins = Math.floor(num / 60);
  const secs = Math.round(num % 60);
  return mins > 0 ? `${mins} 分 ${secs} 秒` : `${secs} 秒`;
}

export function buildSessionReportHtml(session) {
  const frames = Array.isArray(session?.data) ? session.data : [];
  const trackName = session?.trackName || '未知赛道';
  const vehicle = session?.vehicle || {};
  const vehicleName = vehicle.name || '未知车辆';
  const carClass = vehicle.class ?? '-';
  const pi = vehicle.performanceIndex ?? '-';
  const drivetrain = vehicle.drivetrain || '-';
  const duration = session?.summary?.duration ?? session?.duration ?? 0;
  const laps = session?.laps || {};
  const speeds = frames.map((f) => Number(f?.speedKmh)).filter((n) => Number.isFinite(n) && n > 0);
  const maxSpeed = speeds.length ? Math.max(...speeds) : 0;
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const startedAt = session?.savedAt || session?.createdAt || '';

  const statRows = [
    ['赛道', trackName],
    ['车辆', `${vehicleName}（等级 ${carClass} · 性能指数 ${pi} · ${drivetrain}）`],
    ['记录时间', startedAt || '--'],
    ['比赛时长', formatDuration(duration)],
    ['最快单圈', formatLapTime(laps.best)],
    ['上一圈', formatLapTime(laps.last)],
    ['完成圈数', laps.count ?? 0],
    ['遥测帧数', frames.length],
    ['最高速度', maxSpeed ? `${Math.round(maxSpeed)} 千米/小时` : '--'],
    ['平均速度', avgSpeed ? `${Math.round(avgSpeed)} 千米/小时` : '--'],
  ];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>比赛报告 · ${escapeHtml(trackName)}</title>
<style>
  body { margin: 0; padding: 24px; background: #0d1117; color: #c9d1d9; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #e6edf3; }
  .sub { color: #8b949e; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #21262d; }
  th { width: 160px; color: #8b949e; font-weight: 600; }
  td { color: #e6edf3; }
  .card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px; }
  .foot { margin-top: 16px; color: #484f58; font-size: 11px; }
</style>
</head>
<body>
  <h1>比赛报告 · ${escapeHtml(trackName)}</h1>
  <div class="sub">由 FH5 遥测系统导出</div>
  <div class="card">
    <table>
      ${statRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('\n      ')}
    </table>
  </div>
  <div class="foot">导出时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}</div>
</body>
</html>`;
}

export const EXPORT_FORMATS = ['csv', 'json', 'report'];
