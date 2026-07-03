import { useState, useEffect, useRef, useCallback } from 'react';
import { EmptyState } from '../shared/EmptyState';
import { toast } from '../shared/Toast';

export function TrackManagerPage({ onNavigate }) {
  const [tracks, setTracks] = useState({});
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [editingTrack, setEditingTrack] = useState(null);
  // Round 8: 录制模式状态
  const [isRecording, setIsRecording] = useState(false);
  const [recordStartTime, setRecordStartTime] = useState(null);
  const [editName, setEditName] = useState('');
  const canvasRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  // Round 7: 验证结果状态
  const [validationResult, setValidationResult] = useState(null);

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Round 8: 录制计时器 - 每秒更新按钮显示
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  useEffect(() => {
    if (!isRecording || !recordStartTime) {
      setRecordingElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - recordStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording, recordStartTime]);

  const loadTracks = async () => {
    try {
      const res = await fetch('/api/tracks');
      const data = await res.json();
      setTracks(data);
    } catch (e) {
      toast('加载赛道失败', 'error');
    }
  };

  // Round 8: 赛道录制模式
  const startRecording = async () => {
    try {
      const res = await fetch('/api/record/start', { method: 'POST' });
      if (res.ok) {
        setIsRecording(true);
        setRecordStartTime(Date.now());
        toast('录制已开始！请在游戏中跑一圈，完成后点击"停止录制"保存赛道。', 'info');
      } else {
        toast('启动录制失败', 'error');
      }
    } catch (e) {
      toast('启动录制失败: ' + e.message, 'error');
    }
  };

  const stopRecording = async () => {
    try {
      const res = await fetch('/api/record/stop', { method: 'POST' });
      const data = await res.json();
      if (data.positions > 10) {
        toast(`录制完成！获得 ${data.positions} 个轨迹点。请前往保存页面（或重新加载赛道列表查看新赛道）。`, 'success');
      } else {
        toast('录制数据不足（少于10个轨迹点），请确保已在游戏中开启 Data Out 并行驶。', 'error');
      }
      setIsRecording(false);
      setRecordStartTime(null);
      loadTracks();
    } catch (e) {
      toast('停止录制失败', 'error');
    }
  };

  const deleteTrack = async (id) => {
    try {
      await fetch('/api/tracks/' + id, { method: 'DELETE' });
      loadTracks();
      if (selectedTrack === id) setSelectedTrack(null);
      setShowDeleteConfirm(null);
      toast('赛道已删除', 'success');
    } catch (e) {
      toast('删除失败', 'error');
    }
  };

  const renameTrack = async (id, name) => {
    try {
      await fetch('/api/tracks/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      loadTracks();
      setEditingTrack(null);
    } catch (e) {
      toast('重命名失败', 'error');
    }
  };

  // Round 7: 赛道数据质量验证
  const validateTrack = async (id) => {
    try {
      const res = await fetch(`/api/tracks/${id}/validate`);
      if (res.ok) {
        const result = await res.json();
        setValidationResult(prev => ({ ...prev, [id]: result }));
        toast(`验证完成：评分 ${result.overallScore}（${result.grade}级）`, result.overallScore >= 70 ? 'success' : 'info');
      }
    } catch (e) {
      toast('验证失败', 'error');
    }
  };

  const mergeTracks = async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) {
      toast('请选择不同的赛道进行合并', 'error');
      return;
    }
    try {
      await fetch('/api/tracks/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTrackId: mergeSource, targetTrackId: mergeTarget })
      });
      loadTracks();
      setShowMergeModal(false);
      toast('赛道合并成功', 'success');
    } catch (e) {
      toast('合并失败', 'error');
    }
  };

  const startTrackRace = async (trackId) => {
    try {
      const res = await fetch('/api/trackMode/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        toast('赛道模式已启动！赛道：' + data.trackName + '（' + data.turns.length + '弯），请在游戏中开始比赛，系统将自动录制。', 'success');
        if (onNavigate) {
          onNavigate('dashboard', { trackId, trackName: data.trackName });
        }
      } else {
        toast('启动赛道模式失败：' + (data.error || '未知错误'), 'error');
      }
    } catch (e) {
      toast('启动失败: ' + e.message, 'error');
    }
  };

  // Round 2: 导出PNG功能
  const exportTrackPNG = (id) => {
    const track = tracks[id];
    if (!track || !track.points || track.points.length < 2) {
      toast('赛道数据不足，无法导出', 'error');
      return;
    }
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1200;
    exportCanvas.height = 800;
    const ctx = exportCanvas.getContext('2d');
    drawTrack(ctx, exportCanvas, track, { x: 0, y: 0, scale: 1 });

    // Round 9: 叠加路书信息到导出图片
    drawRouteBookOverlay(ctx, exportCanvas, track);

    const link = document.createElement('a');
    link.download = (track.name || id) + '.png';
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
    toast('赛道图片已导出', 'success');
  };

  // Round 9: 导出赛道数据为JSON
  const exportTrackJSON = (id) => {
    const track = tracks[id];
    if (!track) {
      toast('赛道数据不足，无法导出', 'error');
      return;
    }
    const exportData = {
      name: track.name,
      length: track.length,
      pointCount: track.pointCount,
      trajectoryCount: track.trajectoryCount,
      dataSourceCount: track.dataSourceCount || track.trajectoryCount,
      turns: (track.turns || []).map((t, i) => ({
        index: i + 1,
        type: t.type,
        turnCategory: t.turnCategory,
        direction: t.direction,
        angle: t.angle,
        severity: t.severity,
        radius: t.radius,
        recommendedSpeed: t.recommendedSpeed,
        speedHint: t.speedHint,
        entrySpeed: t.entrySpeed,
        apexSpeed: t.apexSpeed,
        exitSpeed: t.exitSpeed,
        suggestedGearDrop: t.suggestedGearDrop,
        startX: t.startX, startZ: t.startZ,
        apexX: t.x, apexZ: t.z,
        endX: t.endX, endZ: t.endZ,
        brakePointX: t.brakePointX, brakePointZ: t.brakePointZ,
      })),
      routeBook: track.routeBook || null,
      centerline: track.centerline ? track.centerline.map(p => ({
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        speed: Math.round(p.speed),
        brake: Math.round(p.brake),
        gear: p.gear,
      })) : null,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = (track.name || id) + '.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast('赛道JSON数据已导出', 'success');
  };

  // Round 9: 导出路书为TXT（弯道列表，方便打印）
  const exportRouteBookTXT = (id) => {
    const track = tracks[id];
    if (!track || !track.turns || track.turns.length === 0) {
      toast('赛道无弯道数据，无法导出路书', 'error');
      return;
    }
    const turns = track.turns;
    const srcCount = track.routeBook?.dataSourceCount || track.dataSourceCount || track.trajectoryCount || 1;

    let txt = '';
    txt += '========================================\n';
    txt += `  路书: ${track.name || id}\n`;
    txt += `  长度: ${track.length ? Math.round(track.length) + 'm' : '未知'} | 弯道: ${turns.length}个\n`;
    txt += `  数据来源: ${srcCount}次比赛\n`;
    txt += '========================================\n\n';

    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      const dir = t.direction === 'left' ? '左转' : '右转';
      const type = t.turnCategory || t.type || '-';
      txt += `弯道 ${String(i + 1).padStart(2, ' ')}`.padEnd(14);
      txt += `${dir}${type}`.padEnd(10);
      txt += `${(t.angle || 0).toFixed(0).padStart(3)}°`.padEnd(6);
      if (t.recommendedSpeed || t.speedHint) {
        txt += `推荐: ${t.recommendedSpeed || t.speedHint}km/h`.padEnd(20);
      }
      if (t.entrySpeed) txt += `入弯: ${t.entrySpeed}km/h `.padEnd(14);
      if (t.apexSpeed) txt += `弯中: ${t.apexSpeed}km/h `.padEnd(14);
      if (t.exitSpeed) txt += `出弯: ${t.exitSpeed}km/h `.padEnd(14);
      if (t.suggestedGearDrop > 0) txt += `降${t.suggestedGearDrop}档`;
      txt += '\n';
    }

    txt += '\n----------------------------------------\n';
    txt += '注: 推荐速度基于半径计算和比赛数据。\n';
    txt += '    入/弯中/出弯速度为实际比赛数据。\n';
    txt += '    建议多次跑同赛道以获得更准确的路书。\n';
    txt += '========================================\n';

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.download = (track.name || id) + '_路书.txt';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast('路书TXT已导出', 'success');
  };

  // Round 9: 在导出图片上叠加路书信息
  const drawRouteBookOverlay = (ctx, canvas, track) => {
    const turns = track.turns || [];
    if (turns.length === 0) return;

    // 左下角路书摘要
    const turnsList = turns.slice(0, 8); // 最多显示8个弯道
    const lineH = 14;
    const startX = 15;
    const startY = canvas.height - turnsList.length * lineH - 30;

    // 半透明背景
    ctx.fillStyle = 'rgba(13,17,23,0.85)';
    const bgW = 260;
    const bgH = turnsList.length * lineH + 25;
    ctx.fillRect(startX - 5, startY - 5, bgW, bgH);

    // 标题
    ctx.fillStyle = '#c9d1d9';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${track.name || '赛道'} - 路书摘要`, startX, startY);

    // 弯道列表
    for (let i = 0; i < turnsList.length; i++) {
      const t = turnsList[i];
      const y = startY + 16 + i * lineH;
      const dir = t.direction === 'left' ? 'L' : 'R';
      const dirColor = t.direction === 'left' ? '#58a6ff' : '#f85149';
      const sevColor = t.severity === 'critical' ? '#f85149' : t.severity === 'high' ? '#f0883e' : t.severity === 'medium' ? '#d29922' : '#3fb950';

      ctx.font = '10px monospace';
      ctx.fillStyle = '#8b949e';
      ctx.fillText(`T${i + 1}`, startX, y);

      ctx.fillStyle = dirColor;
      ctx.fillText(dir, startX + 28, y);

      ctx.fillStyle = sevColor;
      ctx.fillText(`${(t.angle || 0).toFixed(0)}°`, startX + 45, y);

      ctx.fillStyle = '#3fb950';
      ctx.fillText(t.recommendedSpeed || t.speedHint || '-', startX + 75, y);

      ctx.fillStyle = '#484f58';
      ctx.fillText('km/h', startX + 105, y);

      if (t.suggestedGearDrop > 0) {
        ctx.fillStyle = '#d29922';
        ctx.fillText(`-${t.suggestedGearDrop}`, startX + 145, y);
      }

      if (t.entrySpeed) {
        ctx.fillStyle = '#58a6ff';
        ctx.fillText(`>${t.entrySpeed}`, startX + 170, y);
      }
    }

    if (turns.length > 8) {
      ctx.fillStyle = '#8b949e';
      ctx.font = '9px sans-serif';
      ctx.fillText(`... 共${turns.length}个弯道`, startX, startY + 16 + turnsList.length * lineH);
    }

    // 右下角数据来源
    const srcCount = track.routeBook?.dataSourceCount || track.dataSourceCount || track.trajectoryCount || 1;
    ctx.fillStyle = 'rgba(13,17,23,0.7)';
    ctx.fillRect(canvas.width - 180, canvas.height - 25, 170, 20);
    ctx.fillStyle = '#8b949e';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`基于 ${srcCount} 次比赛数据`, canvas.width - 15, canvas.height - 12);
    ctx.textAlign = 'left';
  };

  // Round 5: 弯道颜色映射 - 按严重程度着色
  const turnColorMap = useCallback((severity, type) => {
    switch (severity) {
      case 'critical': return { stroke: '#f85149', bg: 'rgba(248,81,73,0.15)', label: '发夹弯' };
      case 'high':     return { stroke: '#f0883e', bg: 'rgba(240,136,62,0.15)', label: '急弯' };
      case 'medium':   return { stroke: '#d29922', bg: 'rgba(210,153,34,0.15)', label: '中速弯' };
      case 'low':      return { stroke: '#3fb950', bg: 'rgba(63,185,80,0.15)', label: '慢弯' };
      case 'info':      return { stroke: '#58a6ff', bg: 'rgba(88,166,255,0.10)', label: '微弯' };
      default:         return { stroke: '#58a6ff', bg: 'rgba(88,166,255,0.10)', label: type || '' };
    }
  }, []);

  const drawTrack = useCallback((ctx, canvas, track, transform) => {
    if (!track || !track.points || track.points.length < 2) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    track.points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });

    if (maxX - minX < 0.01 && maxZ - minZ < 0.01) return;

    const pad = 40;
    const sx = (canvas.width - pad * 2) / (maxX - minX || 1);
    const sz = (canvas.height - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(sx, sz);
    const ox = (canvas.width - (maxX - minX) * sc) / 2;
    const oz = (canvas.height - (maxZ - minZ) * sc) / 2;

    // 坐标转换辅助
    const toScreen = (p) => ({
      sx: (p.x - minX) * sc + ox,
      sy: (p.z - minZ) * sc + oz
    });

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    let points = track.points;
    if (points.length > 1000) {
      const step = Math.ceil(points.length / 500);
      const sampled = [points[0]];
      for (let i = step; i < points.length - 1; i += step) {
        sampled.push(points[i]);
      }
      sampled.push(points[points.length - 1]);
      points = sampled;
    }

    // Round 5: 绘制弯道区域背景色（在主轨迹下方）
    const turns = track.turns || [];
    if (turns.length > 0 && track.centerline && track.centerline.length > 0) {
      for (let ti = 0; ti < turns.length; ti++) {
        const turn = turns[ti];
        const startIdx = turn.startIdx != null ? turn.startIdx : (turn.index || 0);
        const endIdx = turn.endIdx != null ? turn.endIdx : (turn.index || 0);
        const cl = track.centerline;

        if (startIdx < cl.length && endIdx < cl.length && startIdx !== endIdx) {
          const severity = turn.severity || (turn.type === 'hairpin' ? 'critical' : turn.type === 'sharp' ? 'high' : turn.type === 'medium' ? 'medium' : 'info');
          const colors = turnColorMap(severity, turn.type);

          // 绘制弯道区间高亮
          ctx.beginPath();
          const pStart = toScreen(cl[startIdx]);
          ctx.moveTo(pStart.sx, pStart.sy);
          for (let ci = startIdx + 1; ci <= endIdx && ci < cl.length; ci++) {
            const cp = toScreen(cl[ci]);
            ctx.lineTo(cp.sx, cp.sy);
          }
          ctx.lineWidth = 8 / transform.scale;
          ctx.strokeStyle = colors.bg;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();

          // 绘制弯道区间边框
          ctx.lineWidth = 3 / transform.scale;
          ctx.strokeStyle = colors.stroke;
          ctx.stroke();

          // Round 5: 弯道编号标注 + 推荐速度
          const apexIdx = turn.index != null ? turn.index : Math.floor((startIdx + endIdx) / 2);
          if (apexIdx < cl.length) {
            const apex = toScreen(cl[apexIdx]);
            const speed = turn.recommendedSpeed || turn.speedHint || '';

            // 背景圆圈
            const r = 14 / transform.scale;
            ctx.fillStyle = colors.stroke;
            ctx.beginPath();
            ctx.arc(apex.sx, apex.sy, r, 0, Math.PI * 2);
            ctx.fill();

            // 弯道编号
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(10 / transform.scale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ti + 1, apex.sx, apex.sy);

            // 推荐速度标签
            if (speed) {
              const speedText = typeof speed === 'number' ? speed + 'km/h' : speed;
              const labelY = apex.sy - r - 4 / transform.scale;
              ctx.font = `${Math.round(9 / transform.scale)}px monospace`;
              const textW = ctx.measureText(speedText).width;

              ctx.fillStyle = 'rgba(13,17,23,0.85)';
              const pad2 = 3 / transform.scale;
              ctx.fillRect(apex.sx - textW / 2 - pad2, labelY - 6 / transform.scale, textW + pad2 * 2, 10 / transform.scale);
              ctx.fillStyle = colors.stroke;
              ctx.fillText(speedText, apex.sx, labelY);
            }
          }

          // Round 5: 刹车点标记
          if (turn.brakePointX != null && turn.brakePointZ != null) {
            const bp = toScreen({ x: turn.brakePointX, z: turn.brakePointZ });
            const bSize = 5 / transform.scale;
            ctx.fillStyle = '#f85149';
            // 绘制菱形刹车标记
            ctx.beginPath();
            ctx.moveTo(bp.sx, bp.sy - bSize);
            ctx.lineTo(bp.sx + bSize, bp.sy);
            ctx.lineTo(bp.sx, bp.sy + bSize);
            ctx.lineTo(bp.sx - bSize, bp.sy);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }

    // 主轨迹线
    ctx.lineWidth = 2 / transform.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#58a6ff';
    ctx.beginPath();
    ctx.moveTo((points[0].x - minX) * sc + ox, (points[0].z - minZ) * sc + oz);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo((points[i].x - minX) * sc + ox, (points[i].z - minZ) * sc + oz);
    }
    ctx.stroke();

    // Round 5: 方向箭头 - 每隔一段距离绘制行驶方向箭头
    const arrowInterval = transform.scale > 2 ? 80 : transform.scale > 1.5 ? 150 : 250;
    let arrowDist = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i-1].x;
      const dz = points[i].z - points[i-1].z;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      arrowDist += segLen;

      if (arrowDist >= arrowInterval) {
        arrowDist = 0;
        const midIdx = Math.floor(i / 2);
        const p = toScreen(points[i]);
        const heading = Math.atan2(dz, dx);
        // 箭头指向行驶方向（屏幕坐标z轴朝下，需要取负）
        const arrowLen = 6 / transform.scale;
        const aX = p.sx - Math.cos(heading) * arrowLen;
        const aY = p.sy - Math.sin(heading) * arrowLen;

        ctx.fillStyle = 'rgba(88,166,255,0.7)';
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        ctx.lineTo(aX - Math.cos(heading - 2.5) * arrowLen * 0.6, aY - Math.sin(heading - 2.5) * arrowLen * 0.6);
        ctx.lineTo(aX - Math.cos(heading + 2.5) * arrowLen * 0.6, aY - Math.sin(heading + 2.5) * arrowLen * 0.6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 起点
    const p0 = track.points[0];
    const sx0 = (p0.x - minX) * sc + ox;
    const sy0 = (p0.z - minZ) * sc + oz;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx0, sy0, 6 / transform.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5 / transform.scale;
    ctx.stroke();

    // "S" 标记
    ctx.fillStyle = '#0d1117';
    ctx.font = `bold ${Math.round(8 / transform.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', sx0, sy0);

    // 终点
    const pN = track.points[track.points.length - 1];
    const sxN = (pN.x - minX) * sc + ox;
    const syN = (pN.z - minZ) * sc + oz;
    ctx.fillStyle = '#f85149';
    ctx.beginPath();
    ctx.arc(sxN, syN, 6 / transform.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5 / transform.scale;
    ctx.stroke();

    // "F" 标记
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(8 / transform.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', sxN, syN);

    // Round 5: 右上角图例
    if (turns.length > 0) {
      const legendX = canvas.width / transform.scale - 100 / transform.scale;
      const legendY = 15 / transform.scale;
      ctx.fillStyle = 'rgba(13,17,23,0.8)';
      const legW = 90 / transform.scale;
      const legH = (turns.length > 4 ? 5 : turns.length) * 14 / transform.scale + 10 / transform.scale;
      ctx.fillRect(legendX, legendY, legW, legH);

      const categories = [
        { severity: 'critical', label: '发夹弯' },
        { severity: 'high', label: '急弯' },
        { severity: 'medium', label: '中速弯' },
        { severity: 'low', label: '慢弯' },
        { severity: 'info', label: '微弯' }
      ];
      const foundSeverities = new Set(turns.map(t => t.severity || 'info'));
      let legIdx = 0;
      for (const cat of categories) {
        if (!foundSeverities.has(cat.severity)) continue;
        const colors = turnColorMap(cat.severity, '');
        const ly = legendY + 8 / transform.scale + legIdx * 14 / transform.scale;
        ctx.fillStyle = colors.stroke;
        ctx.fillRect(legendX + 5 / transform.scale, ly - 4 / transform.scale, 10 / transform.scale, 8 / transform.scale);
        ctx.fillStyle = '#c9d1d9';
        ctx.font = `${Math.round(9 / transform.scale)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(cat.label, legendX + 18 / transform.scale, ly);
        legIdx++;
      }
    }

    ctx.restore();
  }, [turnColorMap]);

  const drawCanvas = useCallback(() => {
    if (!selectedTrack) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const track = tracks[selectedTrack];
    if (!track) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    drawTrack(ctx, canvas, track, transform);
  }, [selectedTrack, tracks, transform, drawTrack]);

  const previewTrack = (id) => {
    setSelectedTrack(id);
    setTransform({ x: 0, y: 0, scale: 1 });

    const track = tracks[id];
    if (!track) return;

    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      drawTrack(ctx, canvas, track, { x: 0, y: 0, scale: 1 });
    }, 100);
  };

  useEffect(() => {
    drawCanvas();
  }, [transform, selectedTrack, tracks, drawCanvas]);

  useEffect(() => {
    const handleResize = () => {
      drawCanvas();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawCanvas]);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.5, Math.min(5, prev.scale * delta))
    }));
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  // Round 2: 排序支持升降序切换
  const handleSortBy = (key) => {
    if (sortBy === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const trackList = (() => {
    let list = Object.entries(tracks);
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      list = list.filter(([id, track]) => (track.name || id).toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = (a[1].name || a[0]).localeCompare(b[1].name || b[0], 'zh-CN');
      if (sortBy === 'length') cmp = (a[1].length || 0) - (b[1].length || 0);
      if (sortBy === 'trajectory') cmp = (a[1].trajectoryCount || 0) - (b[1].trajectoryCount || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  })();
  const selectedTrackData = selectedTrack ? tracks[selectedTrack] : null;

  // Round 2: 排序箭头指示
  // Round 7: 相对时间格式化
  const formatRelativeTime = (isoStr) => {
    try {
      const then = new Date(isoStr);
      const now = Date.now();
      const diff = now - then.getTime();
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
      if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
      return then.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const sortArrow = (key) => {
    if (sortBy !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 100px)' }}>
      <div style={{
        width: 300,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: 8,
          borderBottom: '1px solid #21262d',
          display: 'flex',
          gap: 6
        }}>
          {isRecording ? (
            <button onClick={stopRecording} style={{ ...btnPrimaryStyle, background: '#da3633' }}>
              停止录制 {recordingElapsed > 0 ? recordingElapsed + 's' : ''}
            </button>
          ) : (
            <button onClick={startRecording} style={btnPrimaryStyle}>录制赛道</button>
          )}
          <button onClick={() => setShowMergeModal(true)} style={btnSecondaryStyle}>合并</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {/* 搜索框 + 排序按钮 */}
          <div style={{ marginBottom: 8, display: 'flex', gap: 6 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索赛道名称..."
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            />
            {[
              { key: 'name', label: '名称' },
              { key: 'length', label: '长度' },
              { key: 'trajectory', label: '轨迹数' }
            ].map(s => (
              <button
                key={s.key}
                onClick={() => handleSortBy(s.key)}
                style={sortBy === s.key ? btnPrimarySmallStyle : btnSmallStyle}
              >
                {s.label}{sortArrow(s.key)}
              </button>
            ))}
          </div>
          {trackList.length === 0 ? (
            <EmptyState icon="&#x1F6E4;&#xFE0F;" title="暂无赛道数据" description="在游戏中完成比赛后会自动识别赛道。" />
          ) : (
            trackList.map(([id, track]) => (
              <div
                key={id}
                onClick={() => previewTrack(id)}
                style={{
                  padding: 8,
                  background: selectedTrack === id ? '#0d1117' : '#161b22',
                  borderRadius: 6,
                  marginBottom: 4,
                  cursor: 'pointer',
                  border: selectedTrack === id ? '1px solid #58a6ff' : '1px solid #21262d',
                  transition: 'all 0.2s'
                }}>
                {editingTrack === id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      style={inputStyle}
                      autoFocus
                    />
                    <button onClick={() => renameTrack(id, editName)} style={btnSmallStyle}>保存</button>
                    <button onClick={() => setEditingTrack(null)} style={btnSmallStyle}>取消</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, lineHeight: 1.2 }}>{track.name || id}</div>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {showDeleteConfirm === id ? (
                          <>
                            <span style={{ fontSize: 9, color: '#f85149', marginRight: 2 }}>确认删除？</span>
                            <button onClick={(e) => { e.stopPropagation(); deleteTrack(id); }} style={btnDangerSmallStyle}>确认</button>
                            <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null); }} style={btnSmallStyle}>取消</button>
                          </>
                        ) : (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); startTrackRace(id); }} style={btnIconStyle} title="开始赛道模式">▶</button>
                            <button onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate('leaderboard', { trackId: id }); }} style={btnIconStyle} title="排行榜">⏱</button>
                            <button onClick={(e) => { e.stopPropagation(); setShowDetailModal(id); }} style={btnIconStyle} title="赛道详情">ℹ</button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingTrack(id); setEditName(track.name || ''); }} style={btnIconStyle} title="重命名">✎</button>
                            <button onClick={(e) => { e.stopPropagation(); validateTrack(id); }} style={btnIconStyle} title="验证赛道数据质量">&#x2713;</button>
                            <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(id); }} style={btnDangerIconStyle} title="删除">✕</button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Round 7: 紧凑信息行 - 单行显示长度/弯道/轨迹/比赛场次/最后使用 */}
                    <div style={{ fontSize: 9, color: '#8b949e', lineHeight: 1.4 }}>
                      {track.length ? Math.round(track.length) + 'm' : '-'} ·
                      {track.turns ? track.turns.length + '弯' : '0弯'} ·
                      {track.trajectoryCount || 0}轨迹
                      {track.sessionCount > 0 ? <span style={{ color: '#58a6ff' }}> · {track.sessionCount}场比赛</span> : ''}
                    </div>
                    {track.lastUsedAt && (
                      <div style={{ fontSize: 8, color: '#484f58', lineHeight: 1.3 }}>
                        最近: {formatRelativeTime(track.lastUsedAt)}
                      </div>
                    )}
                    {/* Round 7: 验证结果内联显示 */}
                    {validationResult && validationResult[id] && (
                      <div style={{ fontSize: 8, lineHeight: 1.3, marginTop: 2 }}>
                        <span style={{
                          fontWeight: 700,
                          color: validationResult[id].overallScore >= 85 ? '#3fb950' : validationResult[id].overallScore >= 60 ? '#d29922' : '#f85149',
                        }}>
                          数据质量: {validationResult[id].overallScore}/100 ({validationResult[id].grade}级)
                        </span>
                        {validationResult[id].suggestions && validationResult[id].suggestions.length > 0 && (
                          <div style={{ color: '#8b949e', marginTop: 1 }}>
                            {validationResult[id].suggestions[0]}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: 8,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          justifyContent: 'flex-end'
        }}>
          {selectedTrack && (
            <>
              <button onClick={() => exportTrackPNG(selectedTrack)} style={btnSmallStyle}>导出图片</button>
              <button onClick={() => exportTrackJSON(selectedTrack)} style={btnSmallStyle}>导出JSON</button>
              <button onClick={() => exportRouteBookTXT(selectedTrack)} style={btnSmallStyle}>导出路书TXT</button>
            </>
          )}
          <button onClick={resetView} style={btnSmallStyle}>重置视图</button>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {Math.round(transform.scale * 100)}%
          </span>
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              background: '#0d1117',
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {!selectedTrack && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'var(--text-muted)',
              fontSize: 14
            }}>
              选择赛道查看预览
            </div>
          )}
        </div>

        {/* Round 3: 底部信息栏长度单位统一为 m */}
        {selectedTrackData && (
          <div style={{
            padding: 12,
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            gap: 16
          }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedTrackData.name}</div>
            <span style={{ fontSize: 11 }}>
              长度: {selectedTrackData.length ? Math.round(selectedTrackData.length) + 'm' : '未计算'}
            </span>
            <span style={{ fontSize: 11 }}>
              弯道: {selectedTrackData.turns ? selectedTrackData.turns.length : 0}
            </span>
          </div>
        )}

        {/* Round 9: 路书编辑 - 弯道列表与推荐速度 */}
        {selectedTrackData && selectedTrackData.turns && selectedTrackData.turns.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            maxHeight: 200,
            overflow: 'auto'
          }}>
            <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>路书 - 弯道列表</span>
              {/* Round 8: 数据来源显示 */}
              {(selectedTrackData.routeBook?.dataSourceCount || selectedTrackData.dataSourceCount || selectedTrackData.trajectoryCount || 0) > 0 && (
                <span style={{ fontSize: 9, color: '#58a6ff', fontWeight: 600 }}>
                  基于 {selectedTrackData.routeBook?.dataSourceCount || selectedTrackData.dataSourceCount || selectedTrackData.trajectoryCount} 次比赛数据
                </span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>#</th>
                  <th style={{ padding: '4px 4px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>类型</th>
                  <th style={{ padding: '4px 4px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>方向</th>
                  <th style={{ padding: '4px 4px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>角度</th>
                  <th style={{ padding: '4px 4px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>推荐</th>
                </tr>
              </thead>
              <tbody>
                {selectedTrackData.turns.map((turn, idx) => {
                  const severityColor = turn.severity === 'critical' ? '#f85149' : turn.severity === 'high' ? '#f0883e' : turn.severity === 'medium' ? '#d29922' : turn.severity === 'low' ? '#3fb950' : '#58a6ff';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)', background: turn.severity === 'critical' ? 'rgba(248,81,73,0.06)' : 'transparent' }}>
                      <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: '4px 4px', color: severityColor, fontSize: 9 }}>
                        {turn.turnCategory || turn.type || '-'}
                      </td>
                      <td style={{ padding: '4px 4px', fontWeight: 600, color: turn.direction === 'left' ? '#58a6ff' : '#f85149' }}>
                        {turn.direction === 'left' ? '左' : '右'}
                      </td>
                      <td style={{ padding: '4px 4px', fontFamily: 'monospace' }}>
                        {turn.angle != null ? turn.angle.toFixed(0) + '\u00B0' : '-'}
                      </td>
                      <td style={{ padding: '4px 4px' }}>
                        <input
                          value={turn.speedHint || (turn.recommendedSpeed ? turn.recommendedSpeed + '' : '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            const newTurns = [...selectedTrackData.turns];
                            newTurns[idx] = { ...newTurns[idx], speedHint: val };
                            setTracks(prev => ({
                              ...prev,
                              [selectedTrack]: { ...prev[selectedTrack], turns: newTurns }
                            }));
                          }}
                          onBlur={() => {
                            fetch(`/api/tracks/${selectedTrack}/turns/${idx}/speedHint`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ speedHint: turn.speedHint || '' })
                            }).catch(() => toast('保存速度建议失败', 'error'));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur();
                          }}
                          placeholder="km/h"
                          style={{
                            width: 52,
                            padding: '2px 4px',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border)',
                            borderRadius: 3,
                            color: 'var(--text-primary)',
                            fontSize: 10,
                            fontFamily: 'monospace'
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 合并弹窗 */}
      {showMergeModal && (
        <div style={modalOverlayStyle} onClick={() => setShowMergeModal(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>合并赛道</h2>
              <button onClick={() => setShowMergeModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>

            {/* 合并预览：对比信息表格 */}
            {mergeSource && mergeTarget && mergeSource !== mergeTarget && tracks[mergeSource] && tracks[mergeTarget] && (
              <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-primary)' }}>
                      <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>对比项</th>
                      <th style={{ padding: 6, textAlign: 'left', color: '#58a6ff', borderBottom: '1px solid var(--border)' }}>目标赛道（保留）</th>
                      <th style={{ padding: 6, textAlign: 'left', color: '#f85149', borderBottom: '1px solid var(--border)' }}>源赛道（删除）</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: 5, color: 'var(--text-secondary)' }}>名称</td>
                      <td style={{ padding: 5 }}>{tracks[mergeTarget].name || mergeTarget}</td>
                      <td style={{ padding: 5 }}>{tracks[mergeSource].name || mergeSource}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: 5, color: 'var(--text-secondary)' }}>长度</td>
                      <td style={{ padding: 5, fontFamily: 'monospace' }}>{tracks[mergeTarget].length ? Math.round(tracks[mergeTarget].length) + 'm' : '-'}</td>
                      <td style={{ padding: 5, fontFamily: 'monospace' }}>{tracks[mergeSource].length ? Math.round(tracks[mergeSource].length) + 'm' : '-'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: 5, color: 'var(--text-secondary)' }}>弯道数</td>
                      <td style={{ padding: 5, fontFamily: 'monospace' }}>{tracks[mergeTarget].turns ? tracks[mergeTarget].turns.length + '弯' : '0弯'}</td>
                      <td style={{ padding: 5, fontFamily: 'monospace' }}>{tracks[mergeSource].turns ? tracks[mergeSource].turns.length + '弯' : '0弯'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: 5, color: 'var(--text-secondary)' }}>轨迹数</td>
                      <td style={{ padding: 5, fontFamily: 'monospace' }}>{tracks[mergeTarget].trajectoryCount || 0}</td>
                      <td style={{ padding: 5, fontFamily: 'monospace' }}>{tracks[mergeSource].trajectoryCount || 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 合并预览（红线+蓝线） */}
            {mergeSource && mergeTarget && mergeSource !== mergeTarget && tracks[mergeSource] && tracks[mergeTarget] && (
              <MergePreviewCanvas trackA={tracks[mergeSource]} trackB={tracks[mergeTarget]} />
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>目标赛道（保留，蓝色）</label>
              <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} style={inputStyle}>
                <option value="">选择赛道</option>
                {Object.entries(tracks).map(([id, t]) => (
                  <option key={id} value={id}>{t.name || id}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>源赛道（合并后删除，红色）</label>
              <select value={mergeSource} onChange={e => setMergeSource(e.target.value)} style={inputStyle}>
                <option value="">选择赛道</option>
                {Object.entries(tracks).map(([id, t]) => (
                  <option key={id} value={id}>{t.name || id}</option>
                ))}
              </select>
            </div>
            {!mergeSource || !mergeTarget || mergeSource === mergeTarget ? (
              <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12 }}>请选择两个不同的赛道</div>
            ) : (
              <div style={{ fontSize: 10, color: '#d29922', marginBottom: 12, padding: 8, background: 'rgba(210,153,34,0.1)', borderRadius: 4, border: '1px solid rgba(210,153,34,0.3)' }}>⚠ 合并后源赛道将被删除，轨迹将合并到目标赛道，此操作不可撤销</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowMergeModal(false)} style={btnSecondaryStyle}>取消</button>
              <button onClick={mergeTracks} disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget} style={mergeSource && mergeTarget && mergeSource !== mergeTarget ? btnPrimaryStyle : { ...btnPrimaryStyle, opacity: 0.5 }}>确认合并</button>
            </div>
          </div>
        </div>
      )}

      {/* Round 8: 录制中提示横幅 */}
      {isRecording && (
        <div style={{
          position: 'fixed',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(218,54,51,0.9)',
          color: '#fff',
          padding: '6px 16px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#fff',
            animation: 'pulse 1s infinite'
          }} />
          录制中 - 请在游戏中驾驶以采集赛道轨迹
        </div>
      )}

      {/* Round 4: 赛道详情弹窗 */}
      {showDetailModal && tracks[showDetailModal] && (
        <TrackDetailModal
          track={tracks[showDetailModal]}
          trackId={showDetailModal}
          onClose={() => setShowDetailModal(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

// Round 3: 合并预览Canvas组件
function MergePreviewCanvas({ trackA, trackB }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    if (!trackA?.points || trackA.points.length < 2 || !trackB?.points || trackB.points.length < 2) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    [...trackA.points, ...trackB.points].forEach(p => {
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

    // 目标赛道（蓝色）
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#58a6ff';
    ctx.beginPath();
    ctx.moveTo((trackB.points[0].x - minX) * sc + ox, (trackB.points[0].z - minZ) * sc + oz);
    for (let i = 1; i < trackB.points.length; i++) {
      ctx.lineTo((trackB.points[i].x - minX) * sc + ox, (trackB.points[i].z - minZ) * sc + oz);
    }
    ctx.stroke();

    // 源赛道（红色）
    ctx.strokeStyle = '#f85149';
    ctx.beginPath();
    ctx.moveTo((trackA.points[0].x - minX) * sc + ox, (trackA.points[0].z - minZ) * sc + oz);
    for (let i = 1; i < trackA.points.length; i++) {
      ctx.lineTo((trackA.points[i].x - minX) * sc + ox, (trackA.points[i].z - minZ) * sc + oz);
    }
    ctx.stroke();

    // 图例
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#58a6ff';
    ctx.fillRect(10, 10, 12, 3);
    ctx.fillText('目标（保留）', 26, 14);
    ctx.fillStyle = '#f85149';
    ctx.fillRect(10, 22, 12, 3);
    ctx.fillText('源（删除）', 26, 26);
  }, [trackA, trackB]);

  return (
    <div style={{ marginBottom: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: 240, background: '#0d1117', display: 'block' }} />
    </div>
  );
}

// Round 4: 赛道详情弹窗组件
function TrackDetailModal({ track, trackId, onClose, onNavigate }) {
  const turns = track.turns || [];
  const routeBook = track.routeBook || null;
  // Round 7: 验证结果
  const [validation, setValidation] = useState(null);
  const [loadingValidation, setLoadingValidation] = useState(false);

  useEffect(() => {
    // 弹窗打开时自动验证
    const doValidate = async () => {
      setLoadingValidation(true);
      try {
        const res = await fetch(`/api/tracks/${trackId}/validate`);
        if (res.ok) setValidation(await res.json());
      } catch {}
      setLoadingValidation(false);
    };
    doValidate();
  }, [trackId]);

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={{ ...modalContentStyle, maxWidth: 650, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{track.name || trackId}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {/* Round 7: 验证结果面板 */}
        <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-primary)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
            数据质量验证
          </div>
          {loadingValidation ? (
            <div style={{ padding: 10, fontSize: 10, color: '#8b949e' }}>验证中...</div>
          ) : validation ? (
            <div style={{ padding: '8px 12px' }}>
              {/* 综合评分 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 900, fontFamily: 'monospace',
                  background: validation.overallScore >= 85 ? 'rgba(63,185,80,0.15)' : validation.overallScore >= 60 ? 'rgba(210,153,34,0.15)' : 'rgba(248,81,73,0.15)',
                  color: validation.overallScore >= 85 ? '#3fb950' : validation.overallScore >= 60 ? '#d29922' : '#f85149',
                  border: `2px solid ${validation.overallScore >= 85 ? '#3fb950' : validation.overallScore >= 60 ? '#d29922' : '#f85149'}`,
                }}>
                  {validation.grade}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                    综合评分: {validation.overallScore}/100
                  </div>
                  <div style={{ fontSize: 9, color: '#8b949e' }}>
                    基于{validation.metadata?.trajectoryCount || '?'}次比赛数据 · {validation.metadata?.pointCount || '?'}个轨迹点
                  </div>
                </div>
              </div>
              {/* 分项评分 */}
              {validation.details && Object.keys(validation.details).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {Object.entries(validation.details).map(([key, val]) => {
                    const labels = { points: '轨迹点', turns: '弯道质量', routeBook: '路书完整性', dataRichness: '数据丰富度', coverage: '赛道覆盖度' };
                    const barColor = val >= 80 ? '#3fb950' : val >= 50 ? '#d29922' : '#f85149';
                    return (
                      <div key={key} style={{ flex: 1, minWidth: 100 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b949e', marginBottom: 2 }}>
                          <span>{labels[key] || key}</span>
                          <span style={{ fontFamily: 'monospace', color: barColor }}>{val}</span>
                        </div>
                        <div style={{ height: 3, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${val}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 警告信息 */}
              {validation.warnings && validation.warnings.length > 0 && (
                <div style={{ fontSize: 9, color: '#d29922', marginBottom: 4 }}>
                  {validation.warnings.map((w, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>&#x26A0; {w}</div>
                  ))}
                </div>
              )}
              {/* 改进建议 */}
              {validation.suggestions && validation.suggestions.length > 0 && (
                <div style={{ fontSize: 9, color: '#58a6ff' }}>
                  {validation.suggestions.map((s, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>&#x1F4A1; {s}</div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* 基础信息 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ ...statCardStyle }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>长度</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#58a6ff' }}>
              {track.length ? Math.round(track.length) + 'm' : '未计算'}
            </div>
          </div>
          <div style={{ ...statCardStyle }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>弯道数</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#58a6ff' }}>
              {turns.length}
            </div>
          </div>
          <div style={{ ...statCardStyle }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>轨迹数</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#58a6ff' }}>
              {track.trajectoryCount || 0}
            </div>
          </div>
          <div style={{ ...statCardStyle }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>轨迹点</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#58a6ff' }}>
              {track.points ? track.points.length : 0}
            </div>
          </div>
        </div>

        {/* 弯道列表 */}
        {turns.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>弯道列表</h3>
            <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                    <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-secondary)' }}>#</th>
                    <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-secondary)' }}>类型</th>
                    <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-secondary)' }}>方向</th>
                    <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-secondary)' }}>角度</th>
                    <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-secondary)' }}>半径</th>
                    <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-secondary)' }}>推荐</th>
                  </tr>
                </thead>
                <tbody>
                  {turns.map((turn, idx) => {
                    const sevColor = turn.severity === 'critical' ? '#f85149' : turn.severity === 'high' ? '#f0883e' : turn.severity === 'medium' ? '#d29922' : turn.severity === 'low' ? '#3fb950' : '#58a6ff';
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: 5, fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: 5, color: sevColor, fontSize: 9 }}>{turn.turnCategory || turn.type || '-'}</td>
                        <td style={{ padding: 5, fontWeight: 600, color: turn.direction === 'left' ? '#58a6ff' : '#f85149' }}>
                          {turn.direction === 'left' ? '左' : '右'}
                        </td>
                        <td style={{ padding: 5, fontFamily: 'monospace' }}>{turn.angle != null ? turn.angle.toFixed(0) + '\u00B0' : '-'}</td>
                        <td style={{ padding: 5, fontFamily: 'monospace', color: '#8b949e' }}>{turn.radius ? turn.radius + 'm' : '-'}</td>
                        <td style={{ padding: 5, fontFamily: 'monospace' }}>{turn.speedHint || turn.recommendedSpeed || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 路书信息 */}
        {routeBook && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>路书信息</h3>
            <div style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: 10, border: '1px solid var(--border)', fontSize: 11 }}>
              {routeBook.notes && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>备注: </span>
                  <span>{routeBook.notes}</span>
                </div>
              )}
              {routeBook.segments && routeBook.segments.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>分段: </span>
                  <span>{routeBook.segments.length} 段</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              onClose();
              onNavigate && onNavigate('dashboard', { trackId, trackName: track.name });
            }}
            style={btnPrimaryStyle}
          >
            编辑路书
          </button>
          <button
            onClick={() => {
              onClose();
              onNavigate && onNavigate('leaderboard', { trackId });
            }}
            style={btnSecondaryStyle}
          >
            查看排行榜
          </button>
        </div>
      </div>
    </div>
  );
}

const statCardStyle = {
  background: 'var(--bg-primary)',
  borderRadius: 6,
  padding: 10,
  border: '1px solid var(--border)'
};

const btnPrimaryStyle = {
  padding: '6px 14px',
  background: '#238636',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600
};

const btnSecondaryStyle = {
  padding: '6px 14px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 11
};

const btnSmallStyle = {
  padding: '3px 8px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10
};

const btnPrimarySmallStyle = {
  padding: '3px 8px',
  background: '#238636',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10
};

const btnDangerSmallStyle = {
  padding: '3px 8px',
  background: '#da3633',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10
};

const btnIconStyle = {
  padding: '2px 5px',
  background: '#0d1117',
  color: '#8b949e',
  border: '1px solid #21262d',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 9,
  lineHeight: 1
};

const btnDangerIconStyle = {
  padding: '2px 5px',
  background: 'rgba(218,54,51,0.1)',
  color: '#f85149',
  border: '1px solid rgba(248,81,73,0.3)',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 9,
  lineHeight: 1
};

const inputStyle = {
  width: '100%',
  padding: 8,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.8)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center'
};

const modalContentStyle = {
  background: 'var(--bg-secondary)',
  borderRadius: 10,
  padding: 20,
  maxWidth: 500,
  width: '90%',
  border: '1px solid var(--border)'
};
