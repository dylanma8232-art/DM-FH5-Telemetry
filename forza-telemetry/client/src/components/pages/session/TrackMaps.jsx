import { useEffect, useRef, useState } from 'react';
import { api } from '../../../services/api';

export function TrackThumbnail({ trackId }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const drawThumb = async () => {
      try {
        const res = await api.tracks.getThumbnailResponse(trackId);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.positions || data.positions.length < 2) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const positions = data.positions;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        positions.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.z < minZ) minZ = p.z;
          if (p.z > maxZ) maxZ = p.z;
        });
        const pad = 3;
        const rX = Math.max(1, maxX - minX);
        const rZ = Math.max(1, maxZ - minZ);
        const toX = x => pad + (x - minX) / rX * (w - pad * 2);
        const toY = z => h - pad - (z - minZ) / rZ * (h - pad * 2);
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        positions.forEach((p, i) => {
          if (i === 0) ctx.moveTo(toX(p.x), toY(p.z));
          else ctx.lineTo(toX(p.x), toY(p.z));
        });
        ctx.closePath();
        ctx.stroke();
      } catch (e) {
        // 静默忽略
      }
    };
    drawThumb();
  }, [trackId]);

  return (
    <canvas ref={canvasRef} width={60} height={40}
      style={{ width: 60, height: 40, borderRadius: 3, background: 'rgba(88,166,255,0.05)', flexShrink: 0 }}
    />
  );
}

// 赛道 3D 地图渲染
export function InteractiveTrackMap({ trackId, fallbackPositions = [], highlightedPoints = [], cursorPoint = null, width = 300, height = 300, zoomOnSelect = false, channelsData = null }) {
  const canvasRef = useRef(null);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    const fetchPositions = async () => {
      if (!trackId) return;
      try {
        const res = await api.tracks.getResponse(trackId);
        if (!res.ok) return;
        const data = await res.json();
        const resolved = (data.centerline && data.centerline.length > 2) ? data.centerline
          : (data.points && data.points.length > 2) ? data.points
          : (data.trajectories && data.trajectories.length > 0 && data.trajectories[0].length > 2) ? data.trajectories[0]
          : [];
        setPositions(resolved);
      } catch (e) {
        console.error('加载赛道地图坐标失败', e);
      }
    };
    fetchPositions();
  }, [trackId]);

  const drawPositions = positions.length >= 2 ? positions : fallbackPositions;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawPositions.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const activePt = highlightedPoints.find(p => p.isActive);
    const hasActiveZoom = zoomOnSelect && activePt && typeof activePt.x === 'number' && typeof activePt.z === 'number';

    if (hasActiveZoom) {
      const zoomRange = 150;
      minX = activePt.x - zoomRange;
      maxX = activePt.x + zoomRange;
      minZ = activePt.z - zoomRange;
      maxZ = activePt.z + zoomRange;
    } else {
      drawPositions.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      });
    }

    if (maxX - minX < 0.01 && maxZ - minZ < 0.01) return;

    const pad = hasActiveZoom ? 20 : 40;
    const sx = (w - pad * 2) / (maxX - minX || 1);
    const sz = (h - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(sx, sz);
    const ox = (w - (maxX - minX) * sc) / 2;
    const oz = (h - (maxZ - minZ) * sc) / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    let pts = drawPositions;
    if (pts.length > 1000) {
      const step = Math.ceil(pts.length / 500);
      const sampled = [pts[0]];
      for (let i = step; i < pts.length - 1; i += step) sampled.push(pts[i]);
      sampled.push(pts[pts.length - 1]);
      pts = sampled;
    }

    // 绘制路面
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = (p.x - minX) * sc + ox;
      const pz = h - oz - (p.z - minZ) * sc;
      if (i === 0) ctx.moveTo(px, pz);
      else ctx.lineTo(px, pz);
    });
    ctx.stroke();

    // 绘制中心线走线
    ctx.strokeStyle = '#223049';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = (p.x - minX) * sc + ox;
      const pz = h - oz - (p.z - minZ) * sc;
      if (i === 0) ctx.moveTo(px, pz);
      else ctx.lineTo(px, pz);
    });
    ctx.stroke();

    // 绘制遥测异常热力图层
    if (channelsData?.channels && channelsData.channels.length >= 2) {
      const channels = channelsData.channels;
      const lockupSegments = [];
      const slipSegments = [];
      const bottomingSegments = [];

      let prevPt = null;
      channels.forEach((c) => {
        const cx = (c.x - minX) * sc + ox;
        const cz = h - oz - (c.z - minZ) * sc;
        const currPt = { x: cx, y: cz };

        if (prevPt) {
          // 锁死 (刹车>100 且 任意轮胎滑移<-0.15)
          const isLockup = c.brake > 100 && (c.slipFL < -0.15 || c.slipFR < -0.15 || c.slipRL < -0.15 || c.slipRR < -0.15);
          if (isLockup) {
            lockupSegments.push({ p1: prevPt, p2: currPt });
          }

          // 打滑 (油门>100 且 任意轮胎滑移>0.15)
          const isSlip = c.accel > 100 && (c.slipFL > 0.15 || c.slipFR > 0.15 || c.slipRL > 0.15 || c.slipRR > 0.15);
          if (isSlip) {
            slipSegments.push({ p1: prevPt, p2: currPt });
          }

          // 托底 (归一化悬挂行程<0.05)
          const isBottoming = c.suspFL < 0.05 || c.suspFR < 0.05 || c.suspRL < 0.05 || c.suspRR < 0.05;
          if (isBottoming) {
            bottomingSegments.push({ p1: prevPt, p2: currPt });
          }
        }
        prevPt = currPt;
      });

      // 绘制托底段 (紫色)
      ctx.strokeStyle = 'rgba(188, 136, 255, 0.8)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      bottomingSegments.forEach(seg => {
        ctx.moveTo(seg.p1.x, seg.p1.y);
        ctx.lineTo(seg.p2.x, seg.p2.y);
      });
      ctx.stroke();

      // 绘制打滑段 (橙色)
      ctx.strokeStyle = 'rgba(210, 153, 34, 0.85)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      slipSegments.forEach(seg => {
        ctx.moveTo(seg.p1.x, seg.p1.y);
        ctx.lineTo(seg.p2.x, seg.p2.y);
      });
      ctx.stroke();

      // 绘制锁死段 (红色)
      ctx.strokeStyle = 'rgba(248, 81, 73, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      lockupSegments.forEach(seg => {
        ctx.moveTo(seg.p1.x, seg.p1.y);
        ctx.lineTo(seg.p2.x, seg.p2.y);
      });
      ctx.stroke();
    }

    // 绘制弯心标记点
    highlightedPoints.forEach((pt) => {
      if (!pt.x || !pt.z) return;
      const tx = (pt.x - minX) * sc + ox;
      const ty = h - oz - (pt.z - minZ) * sc;
      const color = pt.color || '#f85149';
      const isActive = pt.isActive;

      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(tx, ty, isActive ? 6 : 4, 0, Math.PI * 2);
      ctx.stroke();
      if (isActive) {
        ctx.fillStyle = color;
        ctx.fill();
      }
    });

    // 绘制实时游标点与 HUD
    if (cursorPoint && typeof cursorPoint.x === 'number' && typeof cursorPoint.z === 'number') {
      const cx = (cursorPoint.x - minX) * sc + ox;
      const cz = h - oz - (cursorPoint.z - minZ) * sc;

      // 绘制十字定位辅助线
      ctx.strokeStyle = 'rgba(210, 153, 34, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
      ctx.moveTo(0, cz); ctx.lineTo(w, cz);
      ctx.stroke();

      ctx.fillStyle = '#d29922';
      ctx.beginPath();
      ctx.arc(cx, cz, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // HUD 悬浮信息文字
      if (cursorPoint.speed !== undefined || cursorPoint.gear !== undefined) {
        ctx.font = 'bold 9px monospace';

        let hudText = '';
        if (cursorPoint.speed !== undefined) hudText += `${Math.round(cursorPoint.speed)} km/h`;
        if (cursorPoint.gear !== undefined) {
          const gearNames = { 0: '倒挡', 1: '空挡' };
          const gearName = gearNames[cursorPoint.gear] || `${cursorPoint.gear - 1}档`;
          hudText += ` · ${gearName}`;
        }

        const textWidth = ctx.measureText(hudText).width;
        ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx.fillRect(cx + 10, cz - 16, textWidth + 8, 13);

        ctx.fillStyle = '#ffdf80';
        ctx.textAlign = 'left';
        ctx.fillText(hudText, cx + 14, cz - 6);
      }
    }
  }, [drawPositions, highlightedPoints, cursorPoint, zoomOnSelect, channelsData]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas ref={canvasRef} width={width} height={height}
        style={{ width, height, borderRadius: 6, background: '#0d1117', border: '1px solid var(--border)' }}
      />
      {channelsData?.channels && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'rgba(22, 27, 34, 0.85)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '4px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          pointerEvents: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: 'var(--text-secondary)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f85149' }} /> 制动锁死
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: 'var(--text-secondary)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d29922' }} /> 出弯打滑
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: 'var(--text-secondary)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#bc88ff' }} /> 底盘托底
          </div>
        </div>
      )}
    </div>
  );
}
