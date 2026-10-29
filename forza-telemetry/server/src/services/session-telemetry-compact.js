/**
 * 会话遥测「按需通道 + 降采样」读取（P5）。
 *
 * 旧的 /api/sessions/:id 与 /api/sessions/:id/telemetry 契约保持不变；本模块只服务
 * 新端点 /api/sessions/:id/telemetry/compact，供「只需要回放所需最小字段集」的调用方使用。
 *
 * 规则：
 * - fields 是白名单子集（positions / data），未列出的通道不出现在响应里；
 * - maxPoints 仅作用于 data 通道，复用 telemetry-channels 同一套 LTTB 实现；
 * - positions 不做 LTTB（3D 坐标不是单调曲线，降采样会改变地图形状），按原样返回；
 * - positionFields 可把 positions 投影成指定字段（如 x,y,z），用于只需走线的调用方。
 */
import { lttbDownsample } from '../utils/lttb.js';

export const COMPACT_FIELDS = ['positions', 'data'];
export const DEFAULT_COMPACT_FIELDS = ['positions'];
export const DEFAULT_COMPACT_MAX_POINTS = 450;

/** 解析 fields 查询参数；未提供时用默认值，非法项被忽略（全部非法则回退默认） */
export function parseCompactFields(raw) {
  if (raw === undefined || raw === null || raw === '') return [...DEFAULT_COMPACT_FIELDS];
  const wanted = String(raw)
    .split(',')
    .map((f) => f.trim())
    .filter((f) => COMPACT_FIELDS.includes(f));
  const unique = [...new Set(wanted)];
  return unique.length > 0 ? unique : [...DEFAULT_COMPACT_FIELDS];
}

/** 解析 positionFields：逗号分隔字段名；缺失返回 null（不投影），非法项忽略 */
export function parsePositionFields(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const keys = String(raw)
    .split(',')
    .map((k) => k.trim())
    .filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
  const unique = [...new Set(keys)];
  return unique.length > 0 ? unique : null;
}

/** 解析 maxPoints：非法/缺失返回 null（不降采样） */
export function parseMaxPoints(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = parseInt(raw, 10);
  if (isNaN(value) || value <= 2) return null;
  return value;
}

/**
 * 组装精简载荷。
 * @param {object} session loadSession 返回的会话对象（data/positions 为惰性 getter）
 * @param {{fields?: string[], maxPoints?: number|null, positionFields?: string[]|null}} options
 */
export function buildCompactTelemetry(session, options = {}) {
  const fields = Array.isArray(options.fields) && options.fields.length ? options.fields : [...DEFAULT_COMPACT_FIELDS];
  const maxPoints = options.maxPoints ?? null;
  const positionFields = Array.isArray(options.positionFields) && options.positionFields.length ? options.positionFields : null;

  const payload = { id: session.id, fields: [...fields] };

  if (fields.includes('positions')) {
    const positions = session.positions || [];
    payload.positions = positionFields
      ? positions.map((p) => {
        const projected = {};
        for (const key of positionFields) projected[key] = p[key];
        return projected;
      })
      : positions;
    if (positionFields) payload.positionFields = [...positionFields];
  }

  if (fields.includes('data')) {
    const raw = session.data || [];
    payload.totalDataPoints = raw.length;
    if (maxPoints && raw.length > maxPoints) {
      payload.data = lttbDownsample(raw, maxPoints, 'currentLap', [
        'speedKmh',
        'currentEngineRpm',
        'brake',
        'accel',
        'clutch',
        'handBrake'
      ]);
      payload.downsampled = true;
    } else {
      payload.data = raw;
      payload.downsampled = false;
    }
  }

  return payload;
}
