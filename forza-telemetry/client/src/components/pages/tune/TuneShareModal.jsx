import React, { useState } from 'react';
import { parseShareCode } from '../../../utils/tuneForm';

export const TuneShareModal = React.memo(function TuneShareModal(props) {
  const {
    shareCodeModal,
    setShareCodeModal,
    modalOverlayStyle,
    modalContentStyle,
    btnSmallStyle,
    btnPrimaryStyle,
    inputStyle,
    importFromShareCode,
    importPreview,
    setImportPreview,
    getPerformanceClassBadge,
    getVehicleName,
    getCarStats
  } = props;

      if (!shareCodeModal) return null;

  return (
        <div style={modalOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { setShareCodeModal(null); setImportPreview(null); } }}>
          <div style={{ ...modalContentStyle, maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>通过分享码导入调校</h2>
              <button onClick={() => { setShareCodeModal(null); setImportPreview(null); }} style={{ ...btnSmallStyle, border: 'none' }}>关闭</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>分享码</label>
              <textarea
                id="shareCodeInput"
                placeholder="粘贴分享码..."
                rows={4}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                onClick={() => {
                  const code = document.getElementById('shareCodeInput').value
                  if (!code.trim()) return
                  // Round 4: 先预览
                  const preview = parseShareCode(code.trim())
                  if (preview && preview.error) {
                    alert(preview.error)
                  } else if (preview) {
                    setImportPreview(preview)
                  } else {
                    alert('分享码无效')
                  }
                }}
                style={{ ...btnSmallStyle, flex: 1, background: 'rgba(88, 166, 255, 0.15)', borderColor: 'rgba(88, 166, 255, 0.3)', color: '#58a6ff', fontWeight: 600 }}
              >
                预览调校
              </button>
              <button
                onClick={() => {
                  const code = document.getElementById('shareCodeInput').value
                  if (code.trim()) importFromShareCode(code.trim())
                }}
                style={{ ...btnPrimaryStyle, flex: 1 }}
              >
                直接导入
              </button>
            </div>

            {/* Round 4: 导入预览面板 */}
            {importPreview && (
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 6, padding: 10,
                border: '1px solid var(--border)',
                maxHeight: 350, overflow: 'auto'
              }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>
                  调校预览: {importPreview.name}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
                  <div style={{ color: 'var(--text-secondary)' }}>车辆</div>
                  <div style={{ color: 'var(--text-primary)' }}>{importPreview.vehicleId || '未指定'}</div>

                  <div style={{ color: 'var(--text-secondary)', marginTop: 6 }}>轮胎参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9, marginTop: 6 }}>
                    {importPreview.tires ? Object.entries(importPreview.tires).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>悬挂参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.suspension ? Object.entries(importPreview.suspension).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>传动参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.drivetrain ? Object.entries(importPreview.drivetrain).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>空力参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.aero ? Object.entries(importPreview.aero).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const code = document.getElementById('shareCodeInput').value
                    if (code.trim()) importFromShareCode(code.trim())
                  }}
                  style={{
                    ...btnPrimaryStyle, width: '100%', marginTop: 10
                  }}
                >
                  确认导入
                </button>
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
              提示：在调校卡片上点击"分享码"按钮即可复制该调校的分享码。支持中文调校名称。
            </div>
          </div>
        </div>
      );

});
