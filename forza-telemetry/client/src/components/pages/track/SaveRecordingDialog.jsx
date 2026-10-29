/**
 * A7：从 TrackManagerPage 机械搬移的「保存录制赛道」弹窗（行区间：原文件内该弹窗 JSX）。
 * 只把内部状态读写改为 props 回调，JSX 结构与样式数值逐字未改。
 */
export function SaveRecordingDialog({ name, positions, saving, onChangeName, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200
    }}>
      <div style={{
        width: 360, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#e6edf3' }}>保存录制赛道</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          已采集 {positions} 个轨迹点，请输入赛道名称后保存。
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
          style={{
            width: '100%', padding: 8, background: 'var(--bg-primary)',
            border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-primary)', fontSize: 11, boxSizing: 'border-box'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{ padding: '6px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{ padding: '6px 14px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          >
            {saving ? '保存中...' : '保存赛道'}
          </button>
        </div>
      </div>
    </div>
  );
}
