import React, { useEffect, useRef } from 'react';

export function InteractiveTrackMap({ 
  points = [], 
  highlightedPoints = [], 
  width = 300, 
  height = 300 
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    // 1. 计算轨迹在画布上的缩放与居中包围盒
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });

    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    
    // 留出 15px 边缘填充
    const padding = 15;
    const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeZ);
    
    const offsetX = (width - rangeX * scale) / 2;
    const offsetZ = (height - rangeZ * scale) / 2;

    const transform = (p) => ({
      x: (p.x - minX) * scale + offsetX,
      y: (p.z - minZ) * scale + offsetZ
    });

    // 2. 绘制赛道静态灰色中心线
    ctx.beginPath();
    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    points.forEach((p, i) => {
      const coord = transform(p);
      if (i === 0) ctx.moveTo(coord.x, coord.y);
      else ctx.lineTo(coord.x, coord.y);
    });
    ctx.stroke();

    // 3. 绘制实时高亮的行驶位置或轨迹点
    if (highlightedPoints.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#58a6ff';
      ctx.lineWidth = 4;
      highlightedPoints.forEach((p, i) => {
        const coord = transform(p);
        if (i === 0) ctx.moveTo(coord.x, coord.y);
        else ctx.lineTo(coord.x, coord.y);
      });
      ctx.stroke();
    }
  }, [points, highlightedPoints, width, height]); // 仅在几何点或高亮变化时才重画，阻断高频重绘

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      style={{ background: '#0d1117', borderRadius: 6, border: '1px solid #21262d' }} 
    />
  );
}
