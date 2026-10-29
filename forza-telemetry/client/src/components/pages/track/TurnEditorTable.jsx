import React from 'react';

// 弯道列表表格（原 TrackManagerPage.jsx L2158–L2296 的机械搬移）。
// 仅移动代码，未改任何表达式、props 名、JSX 结构。
export function TurnEditorTable({
  turns,
  editingTurnIndex,
  onSelectTurn,
  onToggleLock,
  onDeleteTurn,
  onShowGlossary,
}) {
  return (
    <>
      {/* 弯道列表 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            弯道列表 (点击行定位与编辑)
            <span
              onClick={(e) => {
                e.stopPropagation();
                onShowGlossary();
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
          {turns && turns.length > 0 ? (
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
                {(turns || []).map((turn, idx) => {
                  const isCurrentEditing = editingTurnIndex === idx;
                  let sev = turn.severity || '3';
                  let severityColor = '#58a6ff';
                  if (sev === '1') severityColor = '#f85149';
                  else if (['2', '3'].includes(String(sev))) severityColor = '#f0883e';
                  else if (['4', '5', '6'].includes(String(sev))) severityColor = '#3fb950';

                  return (
                    <tr
                      key={idx}
                      onClick={() => onSelectTurn(idx)}
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
                              onToggleLock(idx);
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
                              onDeleteTurn(idx);
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
  );
}
