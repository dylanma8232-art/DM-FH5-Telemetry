import { useCallback } from 'react';

/**
 * PaceNoteExport - 路书导出子组件
 *
 * 从 PaceNotesPanel 拆出的导出功能，包含文本导出和图片导出。
 */
const SURFACE_MAP = {
  onRumble: { label: '路肩', icon: 'W', color: '#d29922' },
  puddle: { label: '积水', icon: '~', color: '#58a6ff' },
  surfaceRumble: { label: '碎石', icon: '*', color: '#a371f7' },
};

export function PaceNoteExport({ paceNotes, trackData, turnNotes }) {
  /** 生成纯文本路书 */
  const exportAsText = useCallback(() => {
    if (paceNotes.length === 0) return;
    const trackName = trackData?.name || '赛道';
    const trackLen = trackData?.length || 0;

    let text = `=== ${trackName} 路书 ===\n`;
    text += `长度: ${(trackLen / 1000).toFixed(2)} km | 弯道: ${turnNotes.length}个\n`;
    text += `${'='.repeat(40)}\n\n`;

    paceNotes.forEach((note, idx) => {
      if (note.type === 'turn') {
        text += `[${String(idx + 1).padStart(2, '0')}] ${note.dirLabel}转 ${note.turnTypeLabel} ${note.angle}°`;
        if (note.recommendedSpeed > 0) text += ` | ${note.recommendedSpeed}km/h`;
        if (note.recommendedGear !== null) text += ` | ${note.recommendedGear}档`;
        if (note.brakeDistance > 10) text += ` | -${note.brakeDistance}m刹车`;
        text += '\n';
      } else if (note.type === 'straight') {
        text += `    >> ${note.label} ${note.distance}m 加速区\n`;
      } else if (note.type === 'braking_zone') {
        text += `    !! 重刹区 Δ${note.speedDelta}km/h\n`;
      } else if (note.type === 'elevation') {
        text += `    ${note.label} (+${note.slopeMagnitude}m)\n`;
      } else if (note.type === 'surface') {
        const labels = note.surfaces.map((s) => SURFACE_MAP[s]?.label || s).join('+');
        text += `    ~* 路面: ${labels}\n`;
      }
    });

    text += `\n${'='.repeat(40)}\n生成时间: ${new Date().toLocaleString('zh-CN')}\n`;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trackName}_路书.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [paceNotes, trackData, turnNotes]);

  /** 导出为图片（Canvas 渲染） */
  const exportAsImage = useCallback(() => {
    if (paceNotes.length === 0) return;

    const trackName = trackData?.name || '赛道';
    const trackLen = trackData?.length || 0;
    const lineH = 24;
    const headerH = 50;
    const padding = 16;
    const width = 800;
    const height = headerH + paceNotes.length * lineH + padding * 2;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    // 标题
    ctx.fillStyle = '#58a6ff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`${trackName} - 路书`, padding, padding + 22);

    ctx.fillStyle = '#8b949e';
    ctx.font = '12px monospace';
    ctx.fillText(
      `长度: ${(trackLen / 1000).toFixed(2)} km | 弯道: ${turnNotes.length}个`,
      padding,
      padding + 40
    );

    // 路书条目
    let y = headerH + padding;
    paceNotes.forEach((note, idx) => {
      const typeLabels = {
        turn: 'T',
        straight: '>>',
        braking_zone: '!!',
        elevation: note.slopeType === 'uphill' ? '/\\' : '\\/',
        surface: '~*',
      };

      ctx.font = '13px monospace';

      if (note.type === 'turn') {
        ctx.fillStyle = note.direction === 'left' ? '#a371f7' : '#f0883e';
        ctx.fillText(`[${String(idx + 1).padStart(2, '0')}]`, padding, y + 16);
        ctx.fillText(
          `${note.dirLabel}转 ${note.turnTypeLabel} ${note.angle}°`,
          padding + 36,
          y + 16
        );

        let xPos = 320;
        if (note.recommendedSpeed > 0) {
          ctx.fillStyle = '#3fb950';
          ctx.fillText(`${note.recommendedSpeed}km/h`, xPos, y + 16);
          xPos += 80;
        }
        if (note.recommendedGear !== null) {
          ctx.fillStyle = '#58a6ff';
          ctx.fillText(`${note.recommendedGear}档`, xPos, y + 16);
          xPos += 40;
        }
        if (note.brakeDistance > 10) {
          ctx.fillStyle = '#f85149';
          ctx.fillText(`-${note.brakeDistance}m`, xPos, y + 16);
        }
      } else {
        ctx.fillStyle = '#8b949e';
        ctx.fillText(`    ${typeLabels[note.type] || ''} ${note.label || ''}`, padding, y + 16);
      }
      y += lineH;
    });

    // 下载
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${trackName}_路书.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [paceNotes, trackData, turnNotes]);

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexShrink: 0 }}>
      <button
        onClick={exportAsText}
        style={{
          flex: 1,
          background: 'rgba(63,185,80,0.1)',
          border: '1px solid rgba(63,185,80,0.3)',
          borderRadius: 4,
          padding: '4px 8px',
          color: '#3fb950',
          fontSize: 10,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        文本导出 (.txt)
      </button>
      <button
        onClick={exportAsImage}
        style={{
          flex: 1,
          background: 'rgba(163,113,247,0.1)',
          border: '1px solid rgba(163,113,247,0.3)',
          borderRadius: 4,
          padding: '4px 8px',
          color: '#a371f7',
          fontSize: 10,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        图片导出 (.png)
      </button>
    </div>
  );
}
