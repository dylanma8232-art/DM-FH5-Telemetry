import React from 'react';

// AI 遥测诊断剧场全屏弹窗（原 SessionHistoryPage.jsx L1938–L1987 的机械搬移）。
// 仅移动代码，未改任何表达式、props 名、JSX 结构。
export function AiDiagnosisModal({ open, analysis, report, onClose, renderMarkdown }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(13, 17, 23, 0.94)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 36px'
      }}
    >
      {/* 弹窗 Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #30363d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🤖</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#58a6ff' }}>AI 赛车教练深度遥测问诊报告（全屏剧场视图）</h3>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>
              赛道：{analysis?.track?.name || analysis?.trackName || '本场比赛'} · 车辆：{analysis?.vehicle?.name || '当前车辆'} · 全宽大屏视窗
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '6px 18px',
            background: '#21262d',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#f85149',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          ✕ 退出全屏阅读
        </button>
      </div>

      {/* 弹窗 Body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 10 }}>
        {renderMarkdown(report)}
      </div>
    </div>
  );
}
