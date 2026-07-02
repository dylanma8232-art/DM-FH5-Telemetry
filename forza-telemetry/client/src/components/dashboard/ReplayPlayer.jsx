import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '0:00.00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function ReplayPlayer({ positions = [], data = [] }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showTrail, setShowTrail] = useState(true);

  const validPositions = useMemo(() => {
    return positions.filter(p => p.x !== undefined && p.z !== undefined);
  }, [positions]);

  // Round 4: 计算最大速度用于标准化热力图
  const maxSpeed = useMemo(() => {
    return validPositions.reduce((max, p) => Math.max(max, p.speed || 0), 0);
  }, [validPositions]);

  // 计算坐标边界和缩放
  const transform = useMemo(() => {
    if (validPositions.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    validPositions.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    const padding = 30;
    return { minX, maxX, minZ, maxZ, rangeX, rangeZ, padding };
  }, [validPositions]);

  const mapX = useCallback((x, w) => {
    if (!transform) return 0;
    return transform.padding + (x - transform.minX) / transform.rangeX * (w - transform.padding * 2);
  }, [transform]);

  const mapZ = useCallback((z, h) => {
    if (!transform) return 0;
    return h - transform.padding - (z - transform.minZ) / transform.rangeZ * (h - transform.padding * 2);
  }, [transform]);

  // 绘制轨迹和车辆
  const draw = useCallback((idx) => {
    const canvas = canvasRef.current;
    if (!canvas || !transform) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 背景
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Round 4: 速度热力图颜色映射 - 蓝→青→绿→黄→红
    const speedColor = (speed) => {
      const v = maxSpeed > 0 ? Math.min(1, Math.max(0, speed / maxSpeed)) : 0;
      // 5段渐变
      if (v < 0.25) {
        const t = v / 0.25;
        const r = Math.round(30 + t * 0);
        const g = Math.round(60 + t * 140);
        const b = Math.round(200 + t * 55);
        return `rgba(${r}, ${g}, ${b}, `;
      } else if (v < 0.5) {
        const t = (v - 0.25) / 0.25;
        const r = Math.round(30 + t * 50);
        const g = Math.round(200 + t * 55);
        const b = Math.round(255 - t * 155);
        return `rgba(${r}, ${g}, ${b}, `;
      } else if (v < 0.75) {
        const t = (v - 0.5) / 0.25;
        const r = Math.round(80 + t * 175);
        const g = Math.round(255 - t * 30);
        const b = Math.round(100 - t * 70);
        return `rgba(${r}, ${g}, ${b}, `;
      } else {
        const t = (v - 0.75) / 0.25;
        const r = Math.round(255);
        const g = Math.round(225 - t * 225);
        const b = Math.round(30);
        return `rgba(${r}, ${g}, ${b}, `;
      }
    };

    // 绘制轨迹（全轨迹淡色）
    if (showTrail && validPositions.length > 1) {
      ctx.lineWidth = 2;
      for (let i = 1; i < validPositions.length; i++) {
        const p0 = validPositions[i - 1];
        const p1 = validPositions[i];
        const speed = p1.speed || 0;
        ctx.strokeStyle = speedColor(speed) + '0.3)';
        ctx.beginPath();
        ctx.moveTo(mapX(p0.x, w), mapZ(p0.z, h));
        ctx.lineTo(mapX(p1.x, w), mapZ(p1.z, h));
        ctx.stroke();
      }
    }

    // 绘制已行驶部分（高亮速度热力图）
    if (idx > 0 && validPositions.length > 1) {
      ctx.lineWidth = 3;
      for (let i = 1; i <= idx && i < validPositions.length; i++) {
        const p0 = validPositions[i - 1];
        const p1 = validPositions[i];
        const speed = p1.speed || 0;
        ctx.strokeStyle = speedColor(speed) + '0.9)';
        ctx.beginPath();
        ctx.moveTo(mapX(p0.x, w), mapZ(p0.z, h));
        ctx.lineTo(mapX(p1.x, w), mapZ(p1.z, h));
        ctx.stroke();
      }
    }

    // 绘制当前车辆位置
    const cp = validPositions[Math.min(idx, validPositions.length - 1)];
    if (cp) {
      const cx = mapX(cp.x, w);
      const cy = mapZ(cp.z, h);
      const yaw = cp.yaw || 0;

      // 车辆三角形
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(yaw);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 外圈
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [validPositions, transform, mapX, mapZ, showTrail, maxSpeed]);

  // 播放循环
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    let lastTime = performance.now();
    const step = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setCurrentIndex(prev => {
        const next = prev + dt * 60 * playbackSpeed;
        if (next >= validPositions.length - 1) {
          setIsPlaying(false);
          return validPositions.length - 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, playbackSpeed, validPositions.length]);

  // 绘制更新
  useEffect(() => {
    draw(Math.floor(currentIndex));
  }, [currentIndex, draw]);

  const currentPos = validPositions[Math.floor(currentIndex)] || {};
  const currentData = data[Math.floor(currentIndex)] || {};
  const progress = validPositions.length > 0 ? (currentIndex / (validPositions.length - 1)) * 100 : 0;

  const handleSliderChange = (e) => {
    const p = parseFloat(e.target.value);
    const idx = (p / 100) * (validPositions.length - 1);
    setCurrentIndex(idx);
    draw(Math.floor(idx));
  };

  if (validPositions.length === 0) {
    return <div style={{ padding: 20, color: 'var(--text-secondary)', textAlign: 'center' }}>无可回放的位置数据</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Canvas */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#0d1117', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        {/* Round 4: 增强图例 */}
        <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, color: 'rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
            <div style={{ width: 40, height: 3, background: 'linear-gradient(to right, rgb(30,60,200), rgb(30,200,255), rgb(80,255,100), rgb(255,225,30), rgb(255,0,30))', borderRadius: 1 }} />
            <span>{maxSpeed > 0 ? Math.round(maxSpeed) : 0} km/h</span>
          </div>
          <div>白色三角 = 当前位置</div>
        </div>
      </div>

      {/* 遥测数据面板 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
        gap: 8,
      }}>
        <TelemetryBox label="速度" value={Math.round(currentPos.speed || 0)} unit="km/h" color="#fff" />
        <TelemetryBox label="档位" value={currentPos.gear || 0} color={currentPos.gear >= 6 ? '#f85149' : '#fff'} />
        <TelemetryBox label="RPM" value={Math.round(currentData.currentEngineRpm || 0)} color="#fff" />
        <TelemetryBox label="油门" value={Math.round((currentPos.accel || 0) / 2.55) + '%'} color="#3fb950" />
        <TelemetryBox label="刹车" value={Math.round((currentPos.brake || 0) / 2.55) + '%'} color="#f85149" />
        <TelemetryBox label="转向" value={Math.round((currentPos.steer || 0))} color="#58a6ff" />
        <TelemetryBox label="纵向G" value={(currentPos.gLong || 0).toFixed(2)} color="#fff" />
        <TelemetryBox label="横向G" value={(currentPos.gLat || 0).toFixed(2)} color="#fff" />
      </div>

      {/* 控制栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setIsPlaying(p => !p)}
          style={{
            padding: '6px 18px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            minWidth: 70,
          }}
        >
          {isPlaying ? '暂停' : '播放'}
        </button>

        <button
          onClick={() => { setIsPlaying(false); setCurrentIndex(0); draw(0); }}
          style={{
            padding: '4px 10px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 10,
          }}
        >
          重置
        </button>

        <div style={{ flex: 1, minWidth: 120, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progress}
            onChange={handleSliderChange}
            style={{ flex: 1, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', minWidth: 50 }}>
            {Math.round(progress)}%
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>速度</span>
          {[0.5, 1, 2].map(s => (
            <button
              key={s}
              onClick={() => setPlaybackSpeed(s)}
              style={{
                padding: '3px 8px',
                background: playbackSpeed === s ? 'var(--accent)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                color: playbackSpeed === s ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 10,
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showTrail}
            onChange={e => setShowTrail(e.target.checked)}
          />
          显示轨迹
        </label>

        <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          {formatTime((currentPos.lapTime || 0))}
        </div>
      </div>
    </div>
  );
}

function TelemetryBox({ label, value, unit, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '8px 10px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: 'monospace', lineHeight: 1 }}>
        {value}{unit ? <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2 }}>{unit}</span> : null}
      </div>
    </div>
  );
}
