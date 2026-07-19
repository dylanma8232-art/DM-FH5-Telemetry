import { useEffect, useRef, useState } from 'react';
import { api } from '../../../services/api';

// 合并前的赛道几何预览。
export function MergePreviewCanvas({ trackA, trackB }) {
  const canvasRef = useRef(null);
  const [dataA, setDataA] = useState(null);
  const [dataB, setDataB] = useState(null);

  useEffect(() => {
    const loadDetail = async (track, setData) => {
      if (!track) return;
      if (track.points && track.points.length > 0) {
        setData(track);
        return;
      }
      try {
        const res = await api.tracks.getResponse(track.id);
        const detailed = await res.json();
        setData(detailed);
      } catch (e) {
        console.error('Failed to load merge track detail:', e);
      }
    };

    loadDetail(trackA, setDataA);
    loadDetail(trackB, setDataB);
  }, [trackA, trackB]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    const pointsA = dataA ? (dataA.centerline || dataA.points || (dataA.trajectories && dataA.trajectories[0])) : null;
    const pointsB = dataB ? (dataB.centerline || dataB.points || (dataB.trajectories && dataB.trajectories[0])) : null;

    if (!pointsA || pointsA.length < 2 || !pointsB || pointsB.length < 2) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    [...pointsA, ...pointsB].forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });

    if (maxX - minX < 0.01 && maxZ - minZ < 0.01) return;

    const pad = 30;
    const sx = (canvas.width - pad * 2) / (maxX - minX || 1);
    const sz = (canvas.height - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(sx, sz);
    const ox = (canvas.width - (maxX - minX) * sc) / 2;
    const oz = (canvas.height - (maxZ - minZ) * sc) / 2;

    const toScreen = (p) => ({ sx: (p.x - minX) * sc + ox, sy: (maxZ - p.z) * sc + oz });

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#58a6ff';
    ctx.beginPath();
    const sStartB = toScreen(pointsB[0]);
    ctx.moveTo(sStartB.sx, sStartB.sy);
    for (let i = 1; i < pointsB.length; i++) {
      const sPt = toScreen(pointsB[i]);
      ctx.lineTo(sPt.sx, sPt.sy);
    }
    ctx.stroke();

    ctx.strokeStyle = '#f85149';
    ctx.beginPath();
    const sStartA = toScreen(pointsA[0]);
    ctx.moveTo(sStartA.sx, sStartA.sy);
    for (let i = 1; i < pointsA.length; i++) {
      const sPt = toScreen(pointsA[i]);
      ctx.lineTo(sPt.sx, sPt.sy);
    }
    ctx.stroke();

    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#58a6ff';
    ctx.fillRect(10, 10, 12, 3);
    ctx.fillText('目标（保留）', 26, 14);
    ctx.fillStyle = '#f85149';
    ctx.fillRect(10, 22, 12, 3);
    ctx.fillText('源（删除）', 26, 26);
  }, [dataA, dataB]);

  return (
    <div style={{ marginBottom: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: 240, background: '#0d1117', display: 'block' }} />
    </div>
  );
}
