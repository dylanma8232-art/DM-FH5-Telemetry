import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { EmptyState } from '../shared/EmptyState';
import { toast } from '../shared/Toast';
import { PaceNoteGlossaryModal } from '../dashboard/PaceNotesPanel';
import { MergePreviewCanvas } from './track/MergePreviewCanvas';
import { SearchableTrackSelect } from './track/SearchableTrackSelect';
import { movingAverageSmooth } from '../../utils/movingAverageSmooth';
import { api } from '../../services/api';

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
  background: 'rgba(0,0,0,0.7)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center'
};

const modalContentStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  width: 500,
  maxWidth: '90%',
  padding: 24,
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
};

export const TrackManagerPage = React.memo(function TrackManagerPage({ onNavigate, socket }) {
  const [tracks, setTracks] = useState({});
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [editingTrack, setEditingTrack] = useState(null);
  const [editingTurnIndex, setEditingTurnIndex] = useState(null); // 当前正在编辑的弯道索引 (0, 1, 2...)
  const [editTurnForm, setEditTurnForm] = useState(null); // 当前编辑弯道的表单参数
  const [showGlossary, setShowGlossary] = useState(false);
  // Round 8: 录制模式状态
  const [isRecording, setIsRecording] = useState(false);
  const [recordStartTime, setRecordStartTime] = useState(null);
  const [editName, setEditName] = useState('');
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const mapContextRef = useRef({});
  const [dragMode, setDragMode] = useState(null); // null, "start", "end"
  const [isHoveringHandle, setIsHoveringHandle] = useState(false); // 是否悬停在拖拽手柄上
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortBy, setSortBy] = useState('time');
  const [sortDir, setSortDir] = useState('desc');
  // Round 7: 验证结果状态
  const [validationResult, setValidationResult] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }
  const [showCandidate, setShowCandidate] = useState(true);

  useEffect(() => {
    loadTracks();
  }, []);

  // 监听后端赛道实时更新事件，自动刷出最新赛道列表
  useEffect(() => {
    if (!socket) return;
    const handleTrackUpdate = (data) => {
      loadTracks();
      if (data && data.trackId && selectedTrack === data.trackId) {
        previewTrack(selectedTrack);
      }
    };
    socket.on('trackUpdated', handleTrackUpdate);
    socket.on('trackDeleted', loadTracks);
    return () => {
      socket.off('trackUpdated', handleTrackUpdate);
      socket.off('trackDeleted', loadTracks);
    };
  }, [socket, selectedTrack]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 切换选中赛道时，自动触发后台质量验证
  useEffect(() => {
    if (selectedTrack) {
      const autoValidate = async () => {
        try {
          const res = await api.tracks.validateResponse(selectedTrack);
          if (res.ok) {
            const result = await res.json();
            setValidationResult(prev => ({ ...prev, [selectedTrack]: result }));
          }
        } catch {}
      };
      autoValidate();
    }
  }, [selectedTrack]);

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
      const res = await api.tracks.listResponse();
      const data = await res.json();
      setTracks(data);
    } catch (e) {
      toast('加载赛道失败', 'error');
    }
  };

  const adoptCandidate = async (id) => {
    try {
      const res = await api.tracks.adoptCandidateResponse(id);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '采用候选地图失败');
      toast(`已采用候选地图：${data.turnCount} 个弯道，${Math.round(data.length)} 米`, 'success');
      const detailRes = await api.tracks.getResponse(id);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setTracks(prev => ({ ...prev, [id]: { ...prev[id], ...detail } }));
      }
      await previewTrack(id);
    } catch (error) {
      toast(error.message || '采用候选地图失败', 'error');
    }
  };

  // Round 8: 赛道录制模式
  const startRecording = async () => {
    try {
      const res = await api.record.startResponse();
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
      const res = await api.record.stopResponse();
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
      await api.tracks.deleteResponse(id);
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
      await api.tracks.updateResponse(id, { name });
      loadTracks();
      setEditingTrack(null);
    } catch (e) {
      toast('重命名失败', 'error');
    }
  };

  // Round 7: 赛道数据质量验证

  // 重建赛道中心线（修复历史数据中稀疏中心线/弯道数量偏少问题）
  const rebuildTrack = async (id) => {
    try {
      toast('正在重建中心线，请稍候...', 'info');
      const res = await api.tracks.rebuildResponse(id);
      if (res.ok) {
        const result = await res.json();
        const { before, after } = result;
        // 刷新本地赛道数据
        loadTracks();
        if (selectedTrack === id) previewTrack(id);
        toast(
          `重建完成！中心线 ${before.centerlineLength} → ${after.centerlineLength} 点，弯道 ${before.turnCount} → ${after.turnCount} 个`,
          'success'
        );
      } else {
        const err = await res.json();
        toast('重建失败：' + (err.error || '未知错误'), 'error');
      }
    } catch (e) {
      toast('重建失败: ' + e.message, 'error');
    }
  };

  const updateSelectedTrackTurns = (turns, routeBook = null) => {
    setTracks(prev => {
      const track = prev[selectedTrack];
      if (!track) return prev;
      return {
        ...prev,
        [selectedTrack]: {
          ...track,
          turns: turns,
          routeBook: routeBook || track.routeBook,
          turnCount: turns.length
        }
      };
    });
  };

  // 选中编辑弯道
  const selectTurnForEdit = (idx) => {
    const track = tracks[selectedTrack];
    if (!track || !track.turns || !track.turns[idx]) return;
    const turn = track.turns[idx];
    setEditingTurnIndex(idx);
    
    // 换算 severity 默认值
    let sev = turn.severity || '3';
    if (!['1', '2', '3', '4', '5', '6'].includes(String(sev))) {
      const angle = turn.angle || 0;
      if (angle > 120) sev = '1';
      else if (angle > 90) sev = '2';
      else if (angle > 60) sev = '3';
      else if (angle > 40) sev = '4';
      else if (angle > 25) sev = '5';
      else sev = '6';
    }

    setEditTurnForm({
      direction: turn.direction || 'left',
      severity: String(sev),
      customNote: turn.customNote || '',
      camber: turn.camber || null,
      crest: turn.crest || null,
      startIdx: turn.startIdx,
      endIdx: turn.endIdx
    });
  };

  // 保存弯道修改
  const saveTurnChanges = async () => {
    const track = tracks[selectedTrack];
    if (!track || editingTurnIndex === null || !editTurnForm) return;
    
    const updatedTurns = [...(track.turns || [])];
    const originalTurn = updatedTurns[editingTurnIndex];
    
    // 合并修改后的字段
    updatedTurns[editingTurnIndex] = {
      ...originalTurn,
      direction: editTurnForm.direction,
      severity: editTurnForm.severity,
      customNote: editTurnForm.customNote,
      camber: editTurnForm.camber,
      crest: editTurnForm.crest,
      // 顺便把 turnCategory / type 更新为我们修改后的级别
      turnCategory: editTurnForm.severity + '级弯',
      type: 'normal',
      isLockedByUser: true // 人工编辑后默认局部锁定
    };

    try {
      const res = await api.tracks.updateTurnsResponse(selectedTrack, {
          turns: updatedTurns,
          isPaceNoteLocked: track.isPaceNoteLocked,
          deletedTurns: track.deletedTurns
      });
      
      if (res.ok) {
        const data = await res.json();
        // 更新本地 tracks 字典
        setTracks(prev => ({
          ...prev,
          [selectedTrack]: {
            ...prev[selectedTrack],
            turns: data.turns,
            routeBook: data.routeBook,
            turnCount: data.turnCount
          }
        }));
        
        // 重置编辑状态
        setEditingTurnIndex(null);
        setEditTurnForm(null);
        toast('路书弯道保存成功！', 'success');
        
        // 自动触发质量分数的重新验证拉取
        const qRes = await api.tracks.validateResponse(selectedTrack);
        if (qRes.ok) {
          const qResult = await qRes.json();
          setValidationResult(prev => ({
            ...prev,
            [selectedTrack]: qResult
          }));
        }
      } else {
        toast('保存弯道失败', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('保存弯道请求出错: ' + e.message, 'error');
    }
  };

  // 删除当前弯道
  const deleteTurn = async (idxToDelete) => {
    const track = tracks[selectedTrack];
    if (!track || idxToDelete === null) return;
    
    setConfirmDialog({
      message: `确认从路书中删除 弯道 T${idxToDelete + 1} 吗？`,
      onConfirm: async () => {
        const turnToDelete = track.turns[idxToDelete];
        const updatedTurns = (track.turns || []).filter((_, idx) => idx !== idxToDelete);
        const updatedDeletedTurns = [...(track.deletedTurns || []), turnToDelete];

        try {
          const res = await api.tracks.updateTurnsResponse(selectedTrack, {
              turns: updatedTurns,
              deletedTurns: updatedDeletedTurns,
              isPaceNoteLocked: track.isPaceNoteLocked
          });
          
          if (res.ok) {
            const data = await res.json();
            setTracks(prev => ({
              ...prev,
              [selectedTrack]: {
                ...prev[selectedTrack],
                turns: data.turns,
                routeBook: data.routeBook,
                turnCount: data.turnCount
              }
            }));
            
            // 重置编辑状态
            setEditingTurnIndex(null);
            setEditTurnForm(null);
            toast('弯道删除成功！', 'success');
            
            // 自动重新拉取质量分数
            const qRes = await api.tracks.validateResponse(selectedTrack);
            if (qRes.ok) {
              const qResult = await qRes.json();
              setValidationResult(prev => ({
                ...prev,
                [selectedTrack]: qResult
              }));
            }
          } else {
            toast('删除弯道失败', 'error');
          }
        } catch (e) {
          console.error(e);
          toast('删除弯道请求出错: ' + e.message, 'error');
        }
      }
    });
  };

  const mergeTurnDown = async (idxToMerge) => {
    const track = tracks[selectedTrack];
    if (!track || idxToMerge === null || idxToMerge >= track.turns.length - 1) return;
    
    setConfirmDialog({
      message: `确认将 弯道 T${idxToMerge + 1} 和下一个弯道合并吗？`,
      onConfirm: async () => {
        try {
          const res = await api.tracks.mergeTurnsResponse(selectedTrack, { turnIndex: idxToMerge });
          
          if (res.ok) {
            const data = await res.json();
            setTracks(prev => ({
              ...prev,
              [selectedTrack]: {
                ...prev[selectedTrack],
                turns: data.track.turns,
                routeBook: data.track.routeBook,
                turnCount: data.track.turnCount
              }
            }));
            
            toast('弯道合并成功！', 'success');
            
            // 自动重新拉取质量分数
            const qRes = await api.tracks.validateResponse(selectedTrack);
            if (qRes.ok) {
              const qResult = await qRes.json();
              setValidationResult(prev => ({
                ...prev,
                [selectedTrack]: qResult
              }));
            }
          } else {
            toast('合并弯道失败', 'error');
          }
        } catch (e) {
          console.error(e);
          toast('合并弯道请求出错: ' + e.message, 'error');
        }
      }
    });
  };


  const toggleTurnLock = async (idxToToggle) => {
    const track = tracks[selectedTrack];
    if (!track || !track.turns || !track.turns[idxToToggle]) return;

    const originalTurn = track.turns[idxToToggle];
    const newLockStatus = !originalTurn.isLockedByUser;
    const updatedTurns = [...track.turns];
    updatedTurns[idxToToggle] = { ...originalTurn, isLockedByUser: newLockStatus };

    try {
      const res = await api.tracks.updateTurnsResponse(selectedTrack, {
          turns: updatedTurns,
          isPaceNoteLocked: track.isPaceNoteLocked,
          deletedTurns: track.deletedTurns
      });

      if (res.ok) {
        const data = await res.json();
        setTracks(prev => ({
          ...prev,
          [selectedTrack]: {
            ...prev[selectedTrack],
            turns: data.turns
          }
        }));
        toast(`弯道 T${idxToToggle + 1} 已${newLockStatus ? '锁定' : '解锁'}`, 'success');
      }
    } catch (e) {
      toast('切换锁定失败: ' + e.message, 'error');
    }
  };


  const mergeTracks = async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) {
      toast('请选择不同的赛道进行合并', 'error');
      return;
    }
    try {
      const res = await api.tracks.mergeResponse({ sourceTrackId: mergeSource, targetTrackId: mergeTarget });
      const data = await res.json();
      if (!res.ok) {
        toast('合并失败: ' + (data.error || '服务器错误'), 'error');
        return;
      }
      await loadTracks();
      setSelectedTrack(mergeTarget);
      setShowMergeModal(false);
      toast('赛道已成功合并并已显示在列表中，您可以直接修改赛道名称！地图与路书后台生成中...', 'success');
    } catch (e) {
      toast('合并失败: ' + e.message, 'error');
    }
  };

  const startTrackRace = async (trackId) => {
    try {
      const res = await api.trackMode.startResponse({ trackId });
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
    const points = track ? (
      (track.points && track.points.length > 0) ? track.points :
      (track.centerline && track.centerline.length > 0) ? track.centerline :
      (track.trajectories && track.trajectories[0] && track.trajectories[0].length > 0) ? track.trajectories[0] :
      null
    ) : null;
    if (!track || !points || points.length < 2) {
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
    const bgW = 200;
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

      if (t.suggestedGearDrop > 0) {
        ctx.fillStyle = '#d29922';
        ctx.fillText(`-${t.suggestedGearDrop}`, startX + 75, y);
      }

      if (t.entrySpeed) {
        ctx.fillStyle = '#58a6ff';
        ctx.fillText(`>${t.entrySpeed}`, startX + 105, y);
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

  const drawTrack = useCallback((ctx, canvas, track, transform) => {
    const resolvedPoints = track ? (
      (track.centerline && track.centerline.length > 0) ? track.centerline :
      (track.points && track.points.length > 0) ? track.points :
      (track.trajectories && track.trajectories[0] && track.trajectories[0].length > 0) ? track.trajectories[0] :
      null
    ) : null;
    if (!track || !resolvedPoints || resolvedPoints.length < 2) return;
    const candidate = showCandidate ? track.geometryCandidate : null;
    const candidatePoints = candidate?.centerline?.length > 1 ? candidate.centerline : null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bboxPoints = candidatePoints ? [...resolvedPoints, ...candidatePoints] : resolvedPoints;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    bboxPoints.forEach(p => {
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

    const toScreen = (p) => ({
      sx: (p.x - minX) * sc + ox,
      sy: (maxZ - p.z) * sc + oz
    });

    const points = movingAverageSmooth(resolvedPoints, track.isLoop === true, 50, 5);
    const isLoop = track.isLoop === true;
    const smoothedCandidate = candidatePoints
      ? movingAverageSmooth(candidatePoints, candidate.isLoop === true, 50, 5)
      : null;
    
    // Save to ref for interactions
    if (mapContextRef) {
      mapContextRef.current = {
        minX, minZ, maxZ, sc, ox, oz,
        points: points,
        toScreen
      };
    }

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 每场比赛更新的候选地图：紫色虚线，仅用于对比，不参与当前路书编辑。
    if (smoothedCandidate) {
      ctx.setLineDash([7 / transform.scale, 5 / transform.scale]);
      ctx.lineWidth = 3 / transform.scale;
      ctx.strokeStyle = '#bc8cff';
      ctx.beginPath();
      const candidateStart = toScreen(smoothedCandidate[0]);
      ctx.moveTo(candidateStart.sx, candidateStart.sy);
      for (let i = 1; i < smoothedCandidate.length; i++) {
        const point = toScreen(smoothedCandidate[i]);
        ctx.lineTo(point.sx, point.sy);
      }
      if (candidate.isLoop) ctx.lineTo(candidateStart.sx, candidateStart.sy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 1. 绘制整体赛道底色（直道颜色）
    ctx.lineWidth = 12 * sc; // 基础路宽 12 米
    ctx.strokeStyle = 'rgba(56, 139, 253, 0.12)';
    ctx.beginPath();
    let s0 = toScreen(points[0]);
    ctx.moveTo(s0.sx, s0.sy);
    for (let i = 1; i < points.length; i++) {
      const sPt = toScreen(points[i]);
      ctx.lineTo(sPt.sx, sPt.sy);
    }
    if (isLoop) {
      const sLast = toScreen(points[0]);
      ctx.lineTo(sLast.sx, sLast.sy);
    }
    ctx.stroke();

    // 2. 绘制每个弯道的高亮色
    const turns = track.turns || [];
    turns.forEach((turn, tIdx) => {
      const isEditing = editingTurnIndex === tIdx;
      // 恢复所有的弯道区间高亮
      ctx.lineWidth = (isEditing ? 16 : 8) / transform.scale;
      ctx.strokeStyle = isEditing ? 'rgba(255, 211, 61, 0.85)' : 'rgba(240, 136, 62, 0.45)';
      ctx.beginPath();
      
      // 找到弯道在平滑点阵中的对应点
      let startPt = null;
      // 如果正在编辑，使用实时的边界，否则用原本的
      const currentStartIdx = (isEditing && editTurnForm) ? editTurnForm.startIdx : turn.startIdx;
      const currentEndIdx = (isEditing && editTurnForm) ? editTurnForm.endIdx : turn.endIdx;

      for(let i=0; i<points.length; i++) {
        const origIdx = (points[i].origIdx !== undefined) ? points[i].origIdx : i;
        if (origIdx >= currentStartIdx && !startPt) {
          const s = toScreen(points[i]);
          ctx.moveTo(s.sx, s.sy);
          startPt = true;
        } else if (startPt && origIdx <= currentEndIdx) {
          const s = toScreen(points[i]);
          ctx.lineTo(s.sx, s.sy);
        } else if (startPt && origIdx > currentEndIdx) {
          break;
        }
      }
      ctx.stroke();
    });

    // 3. 绘制两侧白色边缘线 (细线，保持1个像素粗细)
    ctx.lineWidth = 1 / transform.scale;
    
    // 平滑边缘线法线计算，避免锯齿与尖刺
    const drawEdge = (isLeft) => {
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        let nx = 0, nz = 0;
        
        // 使用更宽的采样窗口来计算法线，过滤局部噪点
        const lookAhead = Math.min(i + 3, points.length - 1);
        const lookBehind = Math.max(i - 3, 0);
        
        if (lookAhead > lookBehind) {
          const dx = points[lookAhead].x - points[lookBehind].x;
          const dz = points[lookAhead].z - points[lookBehind].z;
          const len = Math.sqrt(dx*dx + dz*dz) || 1;
          nx = -dz/len; nz = dx/len;
        }
        
        const w = Math.max(isLeft ? (p1.widthLeft || 0) : (p1.widthRight || 0), 6.0);
        const ex = p1.x + (isLeft ? nx : -nx) * w;
        const ez = p1.z + (isLeft ? nz : -nz) * w;
        const s = toScreen({x: ex, z: ez});
        
        if (i === 0) ctx.moveTo(s.sx, s.sy);
        else ctx.lineTo(s.sx, s.sy);
      }
      if (isLoop) {
        const lookAhead = Math.min(3, points.length - 1);
        const lookBehind = Math.max(points.length - 4, 0);
        const dx = points[lookAhead].x - points[lookBehind].x;
        const dz = points[lookAhead].z - points[lookBehind].z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const nx = -dz/len, nz = dx/len;
        const p1 = points[0];
        const w = Math.max(isLeft ? (p1.widthLeft || 0) : (p1.widthRight || 0), 6.0);
        const ex = p1.x + (isLeft ? nx : -nx) * w;
        const ez = p1.z + (isLeft ? nz : -nz) * w;
        const s = toScreen({x: ex, z: ez});
        ctx.lineTo(s.sx, s.sy);
      }
      ctx.stroke();
    };

    ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)';
    drawEdge(true);
    drawEdge(false);

    // 4. 绘制主行车线 (中心线)
    ctx.lineWidth = 1.5 / transform.scale;
    ctx.strokeStyle = '#58a6ff';
    ctx.beginPath();
    const sStart = toScreen(points[0]);
    ctx.moveTo(sStart.sx, sStart.sy);
    for (let i = 1; i < points.length; i++) {
      const sPt = toScreen(points[i]);
      ctx.lineTo(sPt.sx, sPt.sy);
    }
    if (isLoop) {
      const sFirst = toScreen(points[0]);
      ctx.lineTo(sFirst.sx, sFirst.sy);
    }
    ctx.stroke();

    // 5. 绘制起点/终点标记
    const sF = toScreen(points[0]);
    ctx.beginPath();
    ctx.arc(sF.sx, sF.sy, 6 / transform.scale, 0, Math.PI * 2);
    ctx.fillStyle = '#f85149';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${7 / transform.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isLoop ? 'S/F' : 'S', sF.sx, sF.sy);

    if (!isLoop && points.length > 10) {
      const sE = toScreen(points[points.length - 1]);
      ctx.beginPath();
      ctx.arc(sE.sx, sE.sy, 6 / transform.scale, 0, Math.PI * 2);
      ctx.fillStyle = '#3fb950';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('F', sE.sx, sE.sy);
    }

    // 6. 绘制弯道数字标记
    turns.forEach((turn, tIdx) => {
      // 寻找弯道的中点
      const centerOrigIdx = Math.floor((turn.startIdx + turn.endIdx) / 2);
      let centerPt = null;
      for (let i = 0; i < points.length; i++) {
        const origIdx = (points[i].origIdx !== undefined) ? points[i].origIdx : i;
        if (origIdx >= centerOrigIdx) {
          centerPt = points[i];
          break;
        }
      }
      if (centerPt) {
        const sC = toScreen(centerPt);
        
        // 如果是当前编辑的弯道，画出起始(入弯)和结束(出弯)的拖拽锚点，以及中心光环
        if (editingTurnIndex === tIdx) {
          ctx.beginPath();
          ctx.arc(sC.sx, sC.sy, 16 / transform.scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 211, 61, 0.3)';
          ctx.fill();

          // 画出起止点锚点供拖拽
          const currentStartIdx = editTurnForm ? editTurnForm.startIdx : turn.startIdx;
          const currentEndIdx = editTurnForm ? editTurnForm.endIdx : turn.endIdx;

          const ptStart = points.find(p => (p.origIdx !== undefined ? p.origIdx : points.indexOf(p)) >= currentStartIdx);
          const ptEnd = points.find(p => (p.origIdx !== undefined ? p.origIdx : points.indexOf(p)) >= currentEndIdx);
          
          if (ptStart) {
            const sStart = toScreen(ptStart);
            ctx.beginPath();
            ctx.arc(sStart.sx, sStart.sy, 10 / transform.scale, 0, Math.PI * 2);
            ctx.fillStyle = '#ffd33d';
            ctx.fill();
            ctx.lineWidth = 2 / transform.scale;
            ctx.strokeStyle = '#161b22';
            ctx.stroke();
          }

          if (ptEnd) {
            const sEnd = toScreen(ptEnd);
            ctx.beginPath();
            ctx.arc(sEnd.sx, sEnd.sy, 10 / transform.scale, 0, Math.PI * 2);
            ctx.fillStyle = '#f85149';
            ctx.fill();
            ctx.lineWidth = 2 / transform.scale;
            ctx.strokeStyle = '#161b22';
            ctx.stroke();
          }
        }

        const dotRadius = 7 / transform.scale;
        ctx.beginPath();
        ctx.arc(sC.sx, sC.sy, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = editingTurnIndex === tIdx ? '#ffd33d' : '#f0883e';
        ctx.fill();
        ctx.lineWidth = 1.5 / transform.scale;
        ctx.strokeStyle = '#161b22';
        ctx.stroke();
        
        ctx.fillStyle = '#161b22';
        ctx.font = `bold ${8 / transform.scale}px sans-serif`;
        ctx.fillText((tIdx + 1).toString(), sC.sx, sC.sy + (0.5 / transform.scale));
      }
    });

    // 7. 绘制正在编辑弯道的拖拽锚点（红/黄点）
    if (editingTurnIndex !== null && editTurnForm) {
      const sPt = points.find(p => p.origIdx === editTurnForm.startIdx) || points[editTurnForm.startIdx];
      const ePt = points.find(p => p.origIdx === editTurnForm.endIdx) || points[editTurnForm.endIdx];
      
      if (sPt) {
        const p1 = toScreen(sPt);
        ctx.beginPath();
        ctx.arc(p1.sx, p1.sy, 6 / transform.scale, 0, Math.PI * 2);
        ctx.fillStyle = '#f85149'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / transform.scale; ctx.stroke();
      }
      if (ePt) {
        const p2 = toScreen(ePt);
        ctx.beginPath();
        ctx.arc(p2.sx, p2.sy, 6 / transform.scale, 0, Math.PI * 2);
        ctx.fillStyle = '#d29922'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / transform.scale; ctx.stroke();
      }
    }

    ctx.restore();
  }, [editingTurnIndex, editTurnForm, showCandidate]);

  const previewTrack = async (id) => {
    setSelectedTrack(id);
    setTransform({ x: 0, y: 0, scale: 1 });

    let track = tracks[id];
    if (!track) return;

    // 如果该赛道尚未拉取完整的几何点数据，进行一次异步加载，并混入本地 tracks 字典中
    if (!track.points || track.points.length === 0) {
      try {
        const res = await api.tracks.getResponse(id);
        const detailed = await res.json();
        if (detailed && detailed.id === id) {
          setTracks(prev => ({
            ...prev,
            [id]: { ...prev[id], ...detailed }
          }));
          track = { ...track, ...detailed };
        }
      } catch (err) {
        console.error('Failed to load track detailed coordinates:', err);
      }
    }

    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      drawTrack(ctx, canvas, track, { x: 0, y: 0, scale: 1 });
    }, 100);
  };

  // 搜索结果与左侧列表共用同一筛选状态：选择结果后列表立即收窄到该赛道，
  // 让选中高亮、地图和右侧详情始终指向同一个对象。
  const selectTrackFromSearch = (id) => {
    if (!id) {
      setSearchQuery('');
      setDebouncedQuery('');
      return;
    }
    const query = tracks[id]?.name || id;
    setSearchQuery(query);
    setDebouncedQuery(query);
    previewTrack(id);
  };

  const drawCanvas = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    animFrameRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || !selectedTrack) return;
      const ctx = canvas.getContext('2d');
      const track = tracks[selectedTrack];
      if (!track) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight || 300;
      drawTrack(ctx, canvas, track, transform);
    });
  }, [selectedTrack, tracks, transform, drawTrack]);

  // 候选地图由比赛保存线程在每次完赛后写入；轮询完整详情，确保管理页无需刷新即可看到变化。
  useEffect(() => {
    if (!selectedTrack || editingTurnIndex !== null) return undefined;
    const refreshCandidate = async () => {
      try {
        const res = await api.tracks.getResponse(selectedTrack);
        if (!res.ok) return;
        const detail = await res.json();
        setTracks(prev => ({ ...prev, [selectedTrack]: { ...prev[selectedTrack], ...detail } }));
      } catch {}
    };
    const timer = setInterval(refreshCandidate, 15000);
    return () => clearInterval(timer);
  }, [selectedTrack, editingTurnIndex]);


  useEffect(() => {
    if (editingTurnIndex === null || !selectedTrack) return;
    const track = tracks[selectedTrack];
    if (!track || !track.turns || !track.turns[editingTurnIndex]) return;
    
    const turn = track.turns[editingTurnIndex];
    const resolvedPoints = track.centerline || track.points || (track.trajectories && track.trajectories[0]);
    if (!resolvedPoints || resolvedPoints.length < 2) return;
    
    const bboxPoints = resolvedPoints;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    bboxPoints.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = 40;
    const sx = (canvas.width - pad * 2) / (maxX - minX || 1);
    const sz = (canvas.height - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(sx, sz);
    const ox = (canvas.width - (maxX - minX) * sc) / 2;
    const oz = (canvas.height - (maxZ - minZ) * sc) / 2;
    
    const toScreen = (p) => ({
      sx: (p.x - minX) * sc + ox,
      sy: (maxZ - p.z) * sc + oz
    });

    mapContextRef.current = { minX, minZ, maxZ, sc, ox, oz, points: resolvedPoints, toScreen };
    
    const centerOrigIdx = Math.floor((turn.startIdx + turn.endIdx) / 2);
    let centerPt = null;
    for (let i = 0; i < resolvedPoints.length; i++) {
      const origIdx = (resolvedPoints[i].origIdx !== undefined) ? resolvedPoints[i].origIdx : i;
      if (origIdx >= centerOrigIdx) {
        centerPt = resolvedPoints[i];
        break;
      }
    }
    
    if (centerPt) {
      const sC = toScreen(centerPt);
      // Zoom 目标设为 3x
      const targetScale = 3;
      // 使目标点位于 Canvas 中心
      const tx = canvas.width / 2 - sC.sx * targetScale;
      const ty = canvas.height / 2 - sC.sy * targetScale;
      setTransform({ x: tx, y: ty, scale: targetScale });
    }
  }, [editingTurnIndex, selectedTrack, tracks]);

  useEffect(() => {
    drawCanvas();
  }, [transform, selectedTrack, tracks, drawCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          drawCanvas();
        }
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawCanvas]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // 只有处于弯道编辑状态，且焦点不在输入框内时才响应快捷键
      if (editingTurnIndex === null || !editTurnForm) return;
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      const track = tracks[selectedTrack];
      if (!track || !track.turns) return;

      // 1. [ 和 ] 翻页
      if (e.key === '[') {
        e.preventDefault();
        if (editingTurnIndex > 0) {
          selectTurnForEdit(editingTurnIndex - 1);
        }
      } else if (e.key === ']') {
        e.preventDefault();
        if (editingTurnIndex < track.turns.length - 1) {
          selectTurnForEdit(editingTurnIndex + 1);
        }
      }
      // 2. 左/右方向键切换左右弯
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setEditTurnForm(prev => ({ ...prev, direction: 'left' }));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setEditTurnForm(prev => ({ ...prev, direction: 'right' }));
      }
      // 3. 数字键 1-6 设定 WRC 级别
      else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault();
        setEditTurnForm(prev => ({ ...prev, severity: e.key }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingTurnIndex, editTurnForm, selectedTrack, tracks]);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.5, Math.min(5, prev.scale * delta))
    }));
  };

  
  const getClosestPointIndex = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas || !mapContextRef.current) return -1;
    const rect = canvas.getBoundingClientRect();
    const pixelX = clientX - rect.left;
    const pixelY = clientY - rect.top;
    
    const { minX,  maxZ, sc, ox, oz, points } = mapContextRef.current;
    if (!points || points.length === 0) return -1;
    
    // Reverse map from pixel to world
    const sx = (pixelX - transform.x) / transform.scale;
    const sy = (pixelY - transform.y) / transform.scale;
    const worldX = (sx - ox) / sc + minX;
    const worldZ = maxZ - (sy - oz) / sc;
    
    let closestIdx = -1;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - worldX;
      const dz = points[i].z - worldZ;
      const dist = dx * dx + dz * dz;
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }
    return { closestIdx, sx, sy };
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    
    if (editingTurnIndex !== null && editTurnForm && mapContextRef.current) {
      const { toScreen, points } = mapContextRef.current;
      const {  sx, sy } = getClosestPointIndex(e.clientX, e.clientY);
      
      const sPt = points.find(p => (p.origIdx !== undefined ? p.origIdx : points.indexOf(p)) === editTurnForm.startIdx) || points[editTurnForm.startIdx];
      const ePt = points.find(p => (p.origIdx !== undefined ? p.origIdx : points.indexOf(p)) === editTurnForm.endIdx) || points[editTurnForm.endIdx];
      if (sPt && ePt) {
        const sScreen = toScreen(sPt);
        const eScreen = toScreen(ePt);
        
        const distToStart = Math.hypot(sScreen.sx - sx, sScreen.sy - sy);
        const distToEnd = Math.hypot(eScreen.sx - sx, eScreen.sy - sy);
        
        const hitRadius = 40 / transform.scale;
        
        if (distToStart < hitRadius) {
          setDragMode('start');
          return;
        } else if (distToEnd < hitRadius) {
          setDragMode('end');
          return;
        }
      }
    }
    
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e) => {
    if (dragMode) {
      const { closestIdx } = getClosestPointIndex(e.clientX, e.clientY);
      if (closestIdx !== -1 && editTurnForm) {
        if (dragMode === 'start' && closestIdx < editTurnForm.endIdx) {
          setEditTurnForm(prev => ({ ...prev, startIdx: closestIdx }));
        } else if (dragMode === 'end' && closestIdx > editTurnForm.startIdx) {
          setEditTurnForm(prev => ({ ...prev, endIdx: closestIdx }));
        }
      }
      return;
    }

    if (isDragging) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
      return;
    }

    // 检测鼠标是否悬停在正在编辑的弯道的黄色/红色手柄上
    if (editingTurnIndex !== null && editTurnForm && mapContextRef.current) {
      const { toScreen, points } = mapContextRef.current;
      const { sx, sy } = getClosestPointIndex(e.clientX, e.clientY);
      
      const sPt = points.find(p => (p.origIdx !== undefined ? p.origIdx : points.indexOf(p)) === editTurnForm.startIdx) || points[editTurnForm.startIdx];
      const ePt = points.find(p => (p.origIdx !== undefined ? p.origIdx : points.indexOf(p)) === editTurnForm.endIdx) || points[editTurnForm.endIdx];
      if (sPt && ePt) {
        const sScreen = toScreen(sPt);
        const eScreen = toScreen(ePt);
        
        const distToStart = Math.hypot(sScreen.sx - sx, sScreen.sy - sy);
        const distToEnd = Math.hypot(eScreen.sx - sx, eScreen.sy - sy);
        
        const hitRadius = 40 / transform.scale;
        
        if (distToStart < hitRadius || distToEnd < hitRadius) {
          setIsHoveringHandle(true);
        } else {
          setIsHoveringHandle(false);
        }
      } else {
        setIsHoveringHandle(false);
      }
    } else {
      setIsHoveringHandle(false);
    }
  };

  const handleMouseUp = async (e) => {
    if (dragMode) {
      setDragMode(null);
      setIsHoveringHandle(false);
      
      // Auto save bounds!
      if (editTurnForm && selectedTrack && editingTurnIndex !== null) {
         try {
           const res = await api.tracks.updateTurnBoundsResponse(selectedTrack, editingTurnIndex, { startIdx: editTurnForm.startIdx, endIdx: editTurnForm.endIdx });
           if (res.ok) {
             const data = await res.json();
             updateSelectedTrackTurns(data.turns);
             toast('弯道边界已更新', 'success');
           }
         } catch (err) {
           console.error(err);
         }
      }
      return;
    }
    setIsDragging(false);
  };

  const handleDoubleClick = async (e) => {
    if (editingTurnIndex === null || !selectedTrack) return;
    const { closestIdx } = getClosestPointIndex(e.clientX, e.clientY);
    if (closestIdx !== -1 && editTurnForm) {
       // Check if click is inside the current turn
       if (closestIdx >= editTurnForm.startIdx && closestIdx <= editTurnForm.endIdx) {
          setConfirmDialog({
            message: '确认在此处拆分弯道吗？',
            onConfirm: async () => {
              try {
                const res = await api.tracks.splitTurnResponse(selectedTrack, { turnIndex: editingTurnIndex, splitIdx: closestIdx });
                if (res.ok) {
                  const data = await res.json();
                  updateSelectedTrackTurns(data.turns);
                  setEditingTurnIndex(null);
                  setEditTurnForm(null);
                  toast('弯道拆分成功', 'success');
                } else {
                  toast('拆分失败: ' + (await res.json()).error, 'error');
                }
              } catch(err) {
                 console.error(err);
              }
            }
          });
       }
    }
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
      if (sortBy === 'name') {
        cmp = (a[1].name || a[0]).localeCompare(b[1].name || b[0], 'zh-CN');
      } else if (sortBy === 'length') {
        cmp = (a[1].length || 0) - (b[1].length || 0);
      } else if (sortBy === 'trajectory') {
        cmp = (a[1].trajectoryCount || 0) - (b[1].trajectoryCount || 0);
      } else if (sortBy === 'time') {
        const timeA = new Date(a[1].lastUsedAt || a[1].updatedAt || a[1].createdAt || 0).getTime();
        const timeB = new Date(b[1].lastUsedAt || b[1].updatedAt || b[1].createdAt || 0).getTime();
        cmp = timeA - timeB;
      }
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
      {editingTurnIndex === null && (
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
          <button onClick={() => setShowMergeModal(true)} style={btnSecondaryStyle}>合并赛道</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {/* 下拉搜索框 + 排序按钮 */}
          <div style={{ marginBottom: 8, display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <SearchableTrackSelect
                tracks={tracks}
                value={selectedTrack || ''}
                onChange={selectTrackFromSearch}
                placeholder="搜索赛道名称..."
              />
            </div>
            {[
              { key: 'time', label: '时间' },
              { key: 'trajectory', label: '轨迹' }
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
            <EmptyState icon="&#x1F6E4;&#xFE0F;" title="暂无赛道数据" description="在游戏中记录并保存赛道后可在此查看和管理。" />
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
                            <button onClick={(e) => { e.stopPropagation(); onNavigate?.('leaderboard', { trackId: id, trackName: track.name || '' }); }} style={btnIconStyle} title="查看比赛中心">⏱</button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingTrack(id); setEditName(track.name || ''); }} style={btnIconStyle} title="重命名">✎</button>
                            <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(id); }} style={btnDangerIconStyle} title="删除">✕</button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Round 7: 紧凑信息行 - 单行显示长度/弯道/轨迹/比赛场次/最后使用 */}
                    <div style={{ fontSize: 9, color: '#8b949e', lineHeight: 1.4 }}>
                      {track.length ? Math.round(track.length) + 'm' : '-'} ·
                      {(track.turns ? track.turns.length : (track.turnCount || 0)) + '弯'} ·
                      {track.trajectoryCount || 0}轨迹
                      {track.sessionCount > 0 ? <span style={{ color: '#58a6ff' }}> · {track.sessionCount}场比赛</span> : ''}
                    </div>
                    {track.lastUsedAt && (
                      <div style={{ fontSize: 8, color: '#484f58', lineHeight: 1.3 }}>
                        最近: {formatRelativeTime(track.lastUsedAt)}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      )}

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
              {selectedTrackData?.geometryCandidate && (
                <button onClick={() => setShowCandidate(value => !value)} style={showCandidate ? btnPrimarySmallStyle : btnSmallStyle}>
                  {showCandidate ? '隐藏候选' : '显示候选'}
                </button>
              )}
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

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左侧地图预览 */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: '100%',
                  background: '#0d1117',
                  cursor: isDragging ? 'grabbing' : (isHoveringHandle ? 'pointer' : 'grab')
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onMouseLeave={handleMouseUp}
              />
              {/* 悬浮缩放按钮组 */}
              <div style={{
                position: 'absolute',
                top: 8,
                right: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                zIndex: 10,
              }}>
                {[
                  { label: '+', title: '放大', onClick: () => setTransform(prev => ({ ...prev, scale: Math.min(5, prev.scale * 1.25) })) },
                  { label: '−', title: '缩小', onClick: () => setTransform(prev => ({ ...prev, scale: Math.max(0.5, prev.scale * 0.8) })) },
                  { label: '⊙', title: '还原全景', onClick: resetView },
                ].map(btn => (
                  <button
                    key={btn.label}
                    onClick={btn.onClick}
                    title={btn.title}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 5,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(22,27,34,0.85)',
                      color: '#c9d1d9',
                      fontSize: btn.label === '⊙' ? 14 : 18,
                      lineHeight: 1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backdropFilter: 'blur(4px)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(48,54,61,0.95)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(22,27,34,0.85)'}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
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

            {/* 赛道长度/弯道汇总信息栏 */}
            {selectedTrackData && (
              <div style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                gap: 16
              }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{selectedTrackData.name}</div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  长度: {selectedTrackData.length ? Math.round(selectedTrackData.length) + 'm' : '未计算'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  弯道: {selectedTrackData.turns ? selectedTrackData.turns.length : 0}
                </span>
                {selectedTrackData.geometryCandidate && (
                  <span style={{ fontSize: 11, color: '#bc8cff' }}>
                    候选: {Math.round(selectedTrackData.geometryCandidate.length || 0)}m · {selectedTrackData.geometryCandidate.turns?.length || 0}弯
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 右侧赛道详情与质量面板 */}
          {selectedTrackData && (
            <div style={{
              width: 340,
              borderLeft: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden'
            }}>
              {/* 头部标题与返回按钮 */}
              <div style={{
                padding: '10px 12px 6px',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{editingTurnIndex !== null ? `编辑弯道 T${editingTurnIndex + 1}` : '赛道详情与评分'}</span>
                {editingTurnIndex !== null ? (
                  <button
                    onClick={() => { setEditingTurnIndex(null); setEditTurnForm(null); }}
                    style={btnSmallStyle}
                  >
                    返回列表
                  </button>
                ) : (
                  (selectedTrackData.routeBook?.dataSourceCount || selectedTrackData.dataSourceCount || selectedTrackData.trajectoryCount || 0) > 0 && (
                    <span style={{ fontSize: 9, color: '#58a6ff', fontWeight: 600 }}>
                      基于 {selectedTrackData.routeBook?.dataSourceCount || selectedTrackData.dataSourceCount || selectedTrackData.trajectoryCount} 次比赛数据
                    </span>
                  )
                )}
              </div>

              {/* 核心内容区：编辑状态 vs. 列表状态 */}
              {editingTurnIndex !== null && editTurnForm ? (
                <div style={{
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  flex: 1,
                  overflow: 'auto',
                  background: 'var(--bg-primary)'
                }}>
                  {/* 顶部翻页导航 */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    marginBottom: 4
                  }}>
                    <button
                      disabled={editingTurnIndex === 0}
                      onClick={() => selectTurnForEdit(editingTurnIndex - 1)}
                      style={{
                        ...btnSmallStyle,
                        opacity: editingTurnIndex === 0 ? 0.5 : 1,
                        cursor: editingTurnIndex === 0 ? 'default' : 'pointer'
                      }}
                      title="快捷键: ["
                    >
                      ← 上一弯
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                      弯道 {editingTurnIndex + 1} / {selectedTrackData.turns?.length || 0}
                    </span>
                    <button
                      disabled={!selectedTrackData.turns || editingTurnIndex === selectedTrackData.turns.length - 1}
                      onClick={() => selectTurnForEdit(editingTurnIndex + 1)}
                      style={{
                        ...btnSmallStyle,
                        opacity: (!selectedTrackData.turns || editingTurnIndex === selectedTrackData.turns.length - 1) ? 0.5 : 1,
                        cursor: (!selectedTrackData.turns || editingTurnIndex === selectedTrackData.turns.length - 1) ? 'default' : 'pointer'
                      }}
                      title="快捷键: ]"
                    >
                      下一弯 →
                    </button>
                  </div>

                  {/* 提示信息 */}
                  <div style={{ padding: 8, background: 'rgba(88,166,255,0.06)', border: '1px dashed rgba(88,166,255,0.2)', borderRadius: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                    <div style={{ marginBottom: 4 }}>💡 <strong>调整边界</strong>：在地图中按住拖拽黄色(入弯)或红色(出弯)手柄。</div>
                    <div style={{ marginBottom: 4 }}>✂️ <strong>拆分弯道</strong>：在地图轨迹线上双击即可在此处切开弯道。</div>
                    <div>⌨️ <strong>快捷键流</strong>：非输入框状态下可使用快捷键 <code>[</code>、<code>]</code> 翻页，<code>1</code>-<code>6</code> 设级别，<code>←/→</code> 切换方向。</div>
                  </div>

                  {/* 方向选择 */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>转向方向</div>
                    <div style={{ display: 'flex', background: '#21262d', borderRadius: 6, padding: 2, border: '1px solid #30363d' }}>
                      <button
                        onClick={() => setEditTurnForm(prev => ({ ...prev, direction: 'left' }))}
                        style={{
                          flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: 'none',
                          background: editTurnForm.direction === 'left' ? '#1f6feb' : 'transparent',
                          color: editTurnForm.direction === 'left' ? '#fff' : 'var(--text-muted)',
                          fontWeight: editTurnForm.direction === 'left' ? 700 : 400,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        ⬅️ 左
                      </button>
                      <button
                        onClick={() => setEditTurnForm(prev => ({ ...prev, direction: 'right' }))}
                        style={{
                          flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: 'none',
                          background: editTurnForm.direction === 'right' ? '#da3633' : 'transparent',
                          color: editTurnForm.direction === 'right' ? '#fff' : 'var(--text-muted)',
                          fontWeight: editTurnForm.direction === 'right' ? 700 : 400,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        右 ➡️
                      </button>
                    </div>
                  </div>

                  {/* WRC 级别 */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>WRC 严重度</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['1', '2', '3', '4', '5', '6'].map(num => {
                        const isSelected = editTurnForm.severity === num;
                        let activeBg = '#3fb950'; // 5, 6
                        if (num === '1' || num === '2') activeBg = '#da3633'; // 1, 2
                        else if (num === '3' || num === '4') activeBg = '#d29922'; // 3, 4

                        return (
                          <button
                            key={num}
                            onClick={() => setEditTurnForm(prev => ({ ...prev, severity: num }))}
                            style={{
                              flex: 1,
                              height: 28,
                              fontSize: 12,
                              fontWeight: 700,
                              borderRadius: 6,
                              border: isSelected ? 'none' : '1px solid #30363d',
                              background: isSelected ? activeBg : '#21262d',
                              color: isSelected ? '#fff' : 'var(--text-primary)',
                              cursor: 'pointer',
                              boxShadow: isSelected ? `0 0 6px ${activeBg}80` : 'none',
                              transition: 'all 0.1s ease'
                            }}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-muted)', marginTop: 2, padding: '0 2px' }}>
                      <span>急弯 1</span>
                      <span>缓弯 6</span>
                    </div>
                  </div>

                  {/* 附加特征 (Pills) */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>路面倾角</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => setEditTurnForm(prev => ({ ...prev, camber: prev.camber === 'banking' ? null : 'banking' }))}
                          style={{
                            flex: 1, padding: '5px 0', fontSize: 10, borderRadius: 6, cursor: 'pointer',
                            border: editTurnForm.camber === 'banking' ? 'none' : '1px solid #30363d',
                            background: editTurnForm.camber === 'banking' ? '#238636' : '#21262d',
                            color: editTurnForm.camber === 'banking' ? '#fff' : 'var(--text-primary)',
                            fontWeight: editTurnForm.camber === 'banking' ? 600 : 400
                          }}
                        >
                          📐 带倾角
                        </button>
                        <button
                          onClick={() => setEditTurnForm(prev => ({ ...prev, camber: prev.camber === 'off-camber' ? null : 'off-camber' }))}
                          style={{
                            flex: 1, padding: '5px 0', fontSize: 10, borderRadius: 6, cursor: 'pointer',
                            border: editTurnForm.camber === 'off-camber' ? 'none' : '1px solid #30363d',
                            background: editTurnForm.camber === 'off-camber' ? '#f0883e' : '#21262d',
                            color: editTurnForm.camber === 'off-camber' ? '#fff' : 'var(--text-primary)',
                            fontWeight: editTurnForm.camber === 'off-camber' ? 600 : 400
                          }}
                        >
                          🚨 反倾角
                        </button>
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>坡度起伏</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => setEditTurnForm(prev => ({ ...prev, crest: prev.crest === 'crest' ? null : 'crest' }))}
                          style={{
                            flex: 1, padding: '5px 0', fontSize: 10, borderRadius: 6, cursor: 'pointer',
                            border: editTurnForm.crest === 'crest' ? 'none' : '1px solid #30363d',
                            background: editTurnForm.crest === 'crest' ? '#1f6feb' : '#21262d',
                            color: editTurnForm.crest === 'crest' ? '#fff' : 'var(--text-primary)',
                            fontWeight: editTurnForm.crest === 'crest' ? 600 : 400
                          }}
                        >
                          ⛰️ 盲坡
                        </button>
                        <button
                          onClick={() => setEditTurnForm(prev => ({ ...prev, crest: prev.crest === 'jump' ? null : 'jump' }))}
                          style={{
                            flex: 1, padding: '5px 0', fontSize: 10, borderRadius: 6, cursor: 'pointer',
                            border: editTurnForm.crest === 'jump' ? 'none' : '1px solid #30363d',
                            background: editTurnForm.crest === 'jump' ? '#f0883e' : '#21262d',
                            color: editTurnForm.crest === 'jump' ? '#fff' : 'var(--text-primary)',
                            fontWeight: editTurnForm.crest === 'jump' ? 600 : 400
                          }}
                        >
                          ✈️ 飞跳
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 自定义语音备注 */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>自定义语音备注</div>
                    <input
                      type="text"
                      placeholder="例如：压路肩 / 靠内侧 / 出弯有积水"
                      value={editTurnForm.customNote || ''}
                      onChange={(e) => setEditTurnForm(prev => ({ ...prev, customNote: e.target.value }))}
                      style={{
                        width: '100%', padding: '6px 8px', fontSize: 11, borderRadius: 6,
                        background: '#21262d', color: '#fff', border: '1px solid #30363d',
                        boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>

                  {/* 操作按钮组 */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      onClick={saveTurnChanges}
                      style={{
                        flex: 1.5, padding: '8px 0', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: '#238636', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                      }}
                    >
                      💾 保存修改
                    </button>
                    {selectedTrackData && selectedTrackData.turns && editingTurnIndex < selectedTrackData.turns.length - 1 && (
                      <button
                        onClick={() => mergeTurnDown(editingTurnIndex)}
                        style={{
                          flex: 1, padding: '8px 0', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: '#1f6feb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                        }}
                      >
                        🔗 向下合并
                      </button>
                    )}
                    <button
                      onClick={() => deleteTurn(editingTurnIndex)}
                      style={{
                        flex: 1, padding: '8px 0', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: '#da3633', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                      }}
                    >
                      🗑️ 删除
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 数据质量卡片 */}
                  {(() => {
                    const q = validationResult && validationResult[selectedTrack];
                    const gradeColor = q?.overallScore >= 85 ? '#3fb950' : q?.overallScore >= 70 ? '#58a6ff' : q?.overallScore >= 50 ? '#d29922' : '#f85149';
                    const gradeBg = q?.overallScore >= 85 ? 'rgba(63,185,80,0.15)' : q?.overallScore >= 70 ? 'rgba(88,166,255,0.15)' : q?.overallScore >= 50 ? 'rgba(210,153,34,0.15)' : 'rgba(248,81,73,0.15)';
                    return (
                      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 14, fontWeight: 900, fontFamily: 'monospace',
                              background: gradeBg,
                              color: gradeColor,
                              border: `2px solid ${gradeColor}`
                            }}>
                              {q?.grade || '?'}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                                质量评分: {q ? q.overallScore + '/100' : '计算中...'}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                {selectedTrackData.pointCount || 0}点 · {selectedTrackData.turns?.length || 0}弯 · {selectedTrackData.trajectoryCount || 0}轨迹
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => rebuildTrack(selectedTrack)}
                            style={btnSmallStyle}
                            title="重新构建中心线与弯道"
                          >
                            🔄 重建
                          </button>
                        </div>

                        {selectedTrackData.geometryCandidate && (
                          <div style={{ marginBottom: 8, padding: 8, borderRadius: 5, border: '1px solid rgba(188,140,255,0.45)', background: 'rgba(188,140,255,0.08)' }}>
                            <div style={{ fontSize: 10, color: '#d2a8ff', marginBottom: 5 }}>
                              最新候选地图：{Math.round(selectedTrackData.geometryCandidate.length || 0)}m · {selectedTrackData.geometryCandidate.turns?.length || 0}弯
                            </div>
                            <button
                              onClick={() => setConfirmDialog({
                                message: '采用候选地图将替换当前正式地图，并根据候选弯道更新自动路书。已编辑路书中的锁定弯道会继续映射保留。',
                                onConfirm: () => adoptCandidate(selectedTrack)
                              })}
                              style={btnPrimarySmallStyle}
                            >
                              采用候选地图
                            </button>
                          </div>
                        )}

                        {/* 分项进度条 */}
                        {q?.details && (
                          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                            {Object.entries(q.details).map(([key, val]) => {
                              const labels = { points: '点', turns: '弯', routeBook: '路', dataRichness: '富', coverage: '覆' };
                              const barColor = val >= 80 ? '#3fb950' : val >= 50 ? '#d29922' : '#f85149';
                              return (
                                <div key={key} style={{ flex: 1 }} title={`${labels[key] || key}: ${val}/100`}>
                                  <div style={{ height: 2, background: '#21262d', borderRadius: 1, overflow: 'hidden' }}>
                                    <div style={{ width: `${val}%`, height: '100%', background: barColor }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 警告/建议 */}
                        {q?.warnings && q.warnings.length > 0 && (
                          <div style={{ fontSize: 9, color: '#d29922', display: 'flex', gap: 4, marginBottom: 2 }}>
                            <span>⚠️</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={q.warnings[0]}>
                              {q.warnings[0]}
                            </span>
                          </div>
                        )}
                        {q?.suggestions && q.suggestions.length > 0 && (
                          <div style={{ fontSize: 9, color: '#58a6ff', display: 'flex', gap: 4 }}>
                            <span>💡</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={q.suggestions[0]}>
                              {q.suggestions[0]}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 弯道列表 */}
                  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        弯道列表 (点击行定位与编辑)
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowGlossary(true);
                          }}
                          style={{
                            cursor: 'pointer',
                            color: '#8b949e',
                            fontSize: 10,
                            fontWeight: 'bold',
                            padding: '0 4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.08)',
                            width: 14,
                            height: 14
                          }}
                          title="路书术语释义"
                        >
                          ?
                        </span>
                      </span>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
                      {selectedTrackData.turns && selectedTrackData.turns.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ padding: '6px 4px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>#</th>
                              <th style={{ padding: '6px 4px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>严重度</th>
                              <th style={{ padding: '6px 4px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>方向</th>
                              <th style={{ padding: '6px 4px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>角度</th>
                              <th style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedTrackData.turns || []).map((turn, idx) => {
                              const isCurrentEditing = editingTurnIndex === idx;
                              let sev = turn.severity || '3';
                              let severityColor = '#58a6ff';
                              if (sev === '1') severityColor = '#f85149';
                              else if (['2', '3'].includes(String(sev))) severityColor = '#f0883e';
                              else if (['4', '5', '6'].includes(String(sev))) severityColor = '#3fb950';

                              return (
                                <tr 
                                  key={idx} 
                                  onClick={() => selectTurnForEdit(idx)}
                                  style={{ 
                                    borderBottom: '1px solid var(--border-light)', 
                                    cursor: 'pointer',
                                    background: isCurrentEditing 
                                      ? 'rgba(255, 211, 61, 0.15)' 
                                      : (turn.severity === 'critical' ? 'rgba(248,81,73,0.04)' : 'transparent'),
                                    borderLeft: isCurrentEditing ? '3px solid #ffd33d' : 'none'
                                  }}
                                >
                                  <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>{idx + 1}</td>
                                  <td style={{ padding: '6px 4px', color: severityColor, fontSize: 9, fontWeight: 600 }}>
                                    {sev + '级弯'}
                                  </td>
                                  <td style={{ padding: '6px 4px', fontWeight: 600, color: turn.direction === 'left' ? '#58a6ff' : '#f85149' }}>
                                    {turn.direction === 'left' ? '左' : '右'}
                                  </td>
                                  <td style={{ padding: '6px 4px', fontFamily: 'monospace' }}>
                                    {turn.angle != null ? turn.angle.toFixed(0) + '°' : '-'}
                                  </td>
                                  <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleTurnLock(idx);
                                        }}
                                        style={{
                                          background: turn.isLockedByUser ? 'rgba(63, 185, 80, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                          border: turn.isLockedByUser ? '1px solid #3fb950' : '1px solid var(--border)',
                                          borderRadius: 4,
                                          color: turn.isLockedByUser ? '#3fb950' : 'var(--text-secondary)',
                                          cursor: 'pointer',
                                          fontSize: 10,
                                          padding: '2px 6px',
                                          fontWeight: 600,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 2
                                        }}
                                        title={turn.isLockedByUser ? "点击解锁 (下次合并/重建可能会覆盖此弯道)" : "点击锁定 (保留您的编辑属性)"}
                                      >
                                        {turn.isLockedByUser ? '🔒 已锁' : '🔓 未锁'}
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteTurn(idx);
                                        }}
                                        style={{
                                          background: 'rgba(248, 81, 73, 0.1)',
                                          border: '1px solid #f85149',
                                          borderRadius: 4,
                                          color: '#f85149',
                                          cursor: 'pointer',
                                          fontSize: 10,
                                          padding: '2px 6px',
                                          fontWeight: 600
                                        }}
                                        title="从路书中删除此弯道 (不再生成)"
                                      >
                                        删除
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                          暂无弯道数据。<br />
                          <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>点击上方“重建”尝试生成中心线。</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 确认操作弹窗 */}
      {confirmDialog && createPortal(
        <div style={modalOverlayStyle} onClick={() => setConfirmDialog(null)}>
          <div style={{...modalContentStyle, maxWidth: 320, padding: 24, textAlign: 'center'}} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 20, fontWeight: 500 }}>
              {confirmDialog.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button 
                onClick={() => setConfirmDialog(null)}
                style={{ ...btnSecondaryStyle, padding: '6px 20px', fontSize: 12 }}
              >取消</button>
              <button 
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                style={{ ...btnDangerSmallStyle, padding: '6px 20px', fontSize: 12 }}
              >确认</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* 合并弹窗 */}
      {showMergeModal && createPortal(
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
              <label style={{ fontSize: 11, color: '#58a6ff', display: 'block', marginBottom: 4, fontWeight: 600 }}>目标赛道（保留，蓝色）</label>
              <SearchableTrackSelect
                tracks={tracks}
                value={mergeTarget}
                onChange={setMergeTarget}
                placeholder="搜索目标赛道..."
                excludeId={mergeSource}
                highlightColor="#58a6ff"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#f85149', display: 'block', marginBottom: 4, fontWeight: 600 }}>源赛道（合并后删除，红色）</label>
              <SearchableTrackSelect
                tracks={tracks}
                value={mergeSource}
                onChange={setMergeSource}
                placeholder="搜索源赛道..."
                excludeId={mergeTarget}
                highlightColor="#f85149"
              />
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
      , document.body)}

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

      {showGlossary && <PaceNoteGlossaryModal onClose={() => setShowGlossary(false)} />}
    </div>
  );
});

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
  padding: '4px 8px',
  background: '#0d1117',
  color: '#8b949e',
  border: '1px solid #21262d',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1
};

const btnDangerIconStyle = {
  padding: '4px 8px',
  background: 'rgba(218,54,51,0.1)',
  color: '#f85149',
  border: '1px solid rgba(248,81,73,0.3)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1
};
