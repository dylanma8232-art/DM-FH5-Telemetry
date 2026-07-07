import { useRef, useEffect, useState } from 'react';
import { Card } from '../shared/Card';

// 油门/刹车热力图（V8）
// positions 中的 accel (油门 0-255) / brake (刹车 0-255) 沿赛道轨迹上色
export function ThrottleBrakeHeatmap({ session, mode: initialMode = 'throttle' }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState(initialMode); // 'throttle' | 'brake' | 'speed'
  // Round 4: 叠加模式
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (!session || !session.positions || session.positions.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const positions = session.positions;
    // 计算赛道边界
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    positions.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    const w = canvas.width;
    const h = canvas.height;
    const padding = 20;
    const trackW = w - padding * 2;
    const trackH = h - padding * 2;
    const rangeX = Math.max(1, maxX - minX);
    const rangeZ = Math.max(1, maxZ - minZ);
    const scale = Math.min(trackW / rangeX, trackH / rangeZ);
    const offsetX = padding + (trackW - rangeX * scale) / 2;
    const offsetY = padding + (trackH - rangeZ * scale) / 2;
    const toScreen = (p) => ({
      x: offsetX + (p.x - minX) * scale,
      // 翻转 Z 使北方朝上
      y: offsetY + (maxZ - p.z) * scale
    });

    // 清空 + 背景
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // 画赛道灰底
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    positions.forEach((p, i) => {
      const s = toScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();

    // 计算每个点的颜色
    let maxSpeed = 0;
    positions.forEach(p => { if ((p.speed || 0) > maxSpeed) maxSpeed = p.speed; });

    // 用分段插值画出彩色轨迹
    const segLen = 8; // 线宽
    ctx.lineWidth = segLen;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < positions.length; i++) {
      const p1 = positions[i - 1];
      const p2 = positions[i];
      const s1 = toScreen(p1);
      const s2 = toScreen(p2);
      let color;
      if (mode === 'throttle') {
        const v = (p1.accel || 0) / 255;
        color = lerpColor([40, 40, 40], [0, 200, 80], v);
      } else if (mode === 'brake') {
        const v = (p1.brake || 0) / 255;
        color = lerpColor([40, 40, 40], [220, 50, 50], v);
      } else if (mode === 'line') {
        // V9 走线偏离（drivingLine -128~127）
        const dl = Math.abs(p1.drivingLine || 0);
        if (dl < 20) color = 'rgb(63, 185, 80)';        // 绿：贴近赛车线
        else if (dl < 50) color = 'rgb(210, 153, 34)';  // 黄：轻微偏离
        else color = 'rgb(248, 81, 73)';                // 红：严重偏离
      } else {
        const v = maxSpeed > 0 ? (p1.speed || 0) / maxSpeed : 0;
        color = lerpColor([30, 30, 60], [120, 200, 255], v);
      }
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }

    // Round 4: 叠加模式 - 在基础层上叠加另一种数据
    if (overlay && positions.length > 1) {
      const overlayMode = mode === 'throttle' ? 'brake' : 'throttle';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < positions.length; i++) {
        const p1 = positions[i - 1];
        const p2 = positions[i];
        const s1 = toScreen(p1);
        const s2 = toScreen(p2);
        let color;
        if (overlayMode === 'brake') {
          const v = (p1.brake || 0) / 255;
          if (v < 0.1) continue; // 跳过无刹车区域
          color = `rgba(220, 50, 50, ${Math.min(1, v * 1.5)})`;
        } else {
          const v = (p1.accel || 0) / 255;
          if (v < 0.1) continue; // 跳过无油门区域
          color = `rgba(0, 200, 80, ${Math.min(1, v * 1.5)})`;
        }
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }

    // 起点标记（一个小旗）
    const start = toScreen(positions[0]);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [session, mode, overlay]);

  if (!session || !session.positions || session.positions.length === 0) {
    return <Card title="赛道热力图"><div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>无赛道位置数据</div></Card>;
  }

  return (
    <Card title="赛道热力图">
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[
          { id: 'throttle', label: '油门', color: '#00c850' },
          { id: 'brake', label: '刹车', color: '#dc3232' },
          { id: 'line', label: '走线', color: '#3fb950' },
          { id: 'speed', label: '速度', color: '#78c8ff' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            style={{
              padding: '4px 12px',
              background: mode === t.id ? t.color : 'var(--bg-tertiary)',
              color: mode === t.id ? '#000' : 'var(--text-primary)',
              border: mode === t.id ? 'none' : '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: mode === t.id ? 700 : 400
            }}
          >
            {t.label}
          </button>
        ))}
        {/* Round 4: 叠加模式切换 */}
        {(mode === 'throttle' || mode === 'brake') && (
          <button
            onClick={() => setOverlay(o => !o)}
            style={{
              padding: '4px 12px',
              background: overlay ? '#d29922' : 'var(--bg-tertiary)',
              color: overlay ? '#000' : 'var(--text-primary)',
              border: overlay ? 'none' : '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: overlay ? 700 : 400,
              marginLeft: 4,
            }}
          >
            {overlay ? '叠加: ' + (mode === 'throttle' ? '油门+刹车' : '刹车+油门') : '叠加显示'}
          </button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          起点
          <span style={{ display: 'inline-block', width: 8, height: 8, background: '#fff', borderRadius: '50%', marginLeft: 4, border: '1px solid #000' }} />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={760}
        height={420}
        style={{ width: '100%', height: 'auto', maxHeight: 420, background: '#0d1117', borderRadius: 4 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 10, color: 'var(--text-secondary)' }}>
        {mode === 'line' ? (
          <>
            <Legend color="#3fb950" label="理想(<20)" />
            <Legend color="#d29922" label="偏离(20-50)" />
            <Legend color="#f85149" label="严重(>50)" />
          </>
        ) : (
          <>
            <span>低</span>
            <div style={{
              flex: 1, maxWidth: 200, height: 8, borderRadius: 4,
              background: mode === 'throttle' ? 'linear-gradient(to right, rgb(40,40,40), rgb(0,200,80))' :
                         mode === 'brake' ? 'linear-gradient(to right, rgb(40,40,40), rgb(220,50,50))' :
                         'linear-gradient(to right, rgb(30,30,60), rgb(120,200,255))'
            }} />
            <span>高</span>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
          {mode === 'throttle' && '颜色越深绿 = 油门越大；灰 = 收油'}
          {mode === 'brake' && '颜色越深红 = 刹车越重；灰 = 不踩刹车'}
          {mode === 'line' && '绿=贴近赛车线，黄=轻微偏离，红=严重偏离'}
          {mode === 'speed' && '颜色越亮蓝 = 速度越高；暗 = 慢速区'}
        </span>
      </div>
    </Card>
  );
}

function Legend({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 12, height: 3, background: color, borderRadius: 1, display: 'inline-block' }} />
      <span>{label}</span>
    </span>
  );
}

function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
