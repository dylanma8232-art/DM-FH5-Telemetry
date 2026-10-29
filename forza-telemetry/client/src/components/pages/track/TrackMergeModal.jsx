import React from 'react';
import { createPortal } from 'react-dom';
import { MergePreviewCanvas } from './MergePreviewCanvas';
import { SearchableTrackSelect } from './SearchableTrackSelect';

// 合并赛道弹窗（原 TrackManagerPage.jsx L2191–L2273 的机械搬移）。
// 仅移动代码，未改任何表达式、props 名、JSX 结构。
export function TrackMergeModal({
  tracks,
  mergeSource,
  mergeTarget,
  onSetMergeSource,
  onSetMergeTarget,
  onClose,
  onConfirm,
  overlayStyle,
  contentStyle,
  cancelButtonStyle,
  confirmButtonStyle,
}) {
  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>合并赛道</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>×</button>
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
            onChange={onSetMergeTarget}
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
            onChange={onSetMergeSource}
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
          <button onClick={onClose} style={cancelButtonStyle}>取消</button>
          <button onClick={onConfirm} disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget} style={mergeSource && mergeTarget && mergeSource !== mergeTarget ? confirmButtonStyle : { ...confirmButtonStyle, opacity: 0.5 }}>确认合并</button>
        </div>
      </div>
    </div>
  , document.body);
}
