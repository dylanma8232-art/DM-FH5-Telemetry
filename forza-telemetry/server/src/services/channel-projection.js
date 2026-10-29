/**
 * 遥测通道投影（纯函数）：把 `?channels=a,b` 参数裁剪到指定通道。
 * distance 永远保留（横轴），未传参数时不改变任何字段。
 */
export function parseChannelsParam(raw) {
  return String(raw || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

export function projectChannels(frames, requested) {
  if (!requested || requested.length === 0) {
    return { frames, unknown: [] };
  }
  if (!frames || frames.length === 0) return { frames: frames || [], unknown: [] };
  const available = new Set(Object.keys(frames[0] || {}));
  const unknown = requested.filter((name) => name !== 'distance' && !available.has(name));
  if (unknown.length > 0) return { frames: null, unknown };

  const keep = ['distance', ...requested.filter((name) => name !== 'distance')];
  const projected = (frames || []).map((frame) => {
    const out = {};
    for (const key of keep) {
      if (key in frame) out[key] = frame[key];
    }
    return out;
  });
  return { frames: projected, unknown: [] };
}
