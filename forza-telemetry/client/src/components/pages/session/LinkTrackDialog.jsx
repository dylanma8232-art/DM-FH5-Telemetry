/**
 * A7：从 SessionHistoryPage 机械搬移的「关联赛道」弹窗（原 B10 内联 JSX）。
 * 只把内部状态读写改为 props 回调，JSX 结构与样式数值逐字未改。
 */
export function LinkTrackDialog({ sessionCount, options, selectedTrackId, saving, onChangeTrack, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
      <div style={{ width: 380, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#e6edf3' }}>关联赛道</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          将 {sessionCount} 条比赛记录归入所选赛道（同步更新赛道名称与赛道标识）。
        </div>
        <select
          value={selectedTrackId}
          onChange={(e) => onChangeTrack(e.target.value)}
          style={{ width: '100%', padding: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 11 }}
        >
          <option value="">{options.length ? '请选择赛道…' : '赛道列表加载中…'}</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} disabled={saving} style={{ padding: '6px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>取消</button>
          <button onClick={onConfirm} disabled={saving} style={{ padding: '6px 14px', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            {saving ? '提交中…' : '确认关联'}
          </button>
        </div>
      </div>
    </div>
  );
}
