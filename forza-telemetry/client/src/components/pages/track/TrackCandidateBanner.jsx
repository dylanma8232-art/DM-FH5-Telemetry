import React from 'react';

// 候选地图卡片（原 TrackManagerPage.jsx L2104–L2119 的机械搬移）。
// 仅移动代码，未改任何表达式、props 名、JSX 结构。
export function TrackCandidateBanner({ geometryCandidate, onAdopt, adoptButtonStyle }) {
  if (!geometryCandidate) return null;
  return (
    <div style={{ marginBottom: 8, padding: 8, borderRadius: 5, border: '1px solid rgba(188,140,255,0.45)', background: 'rgba(188,140,255,0.08)' }}>
      <div style={{ fontSize: 10, color: '#d2a8ff', marginBottom: 5 }}>
        最新候选地图：{Math.round(geometryCandidate.length || 0)}m · {geometryCandidate.turns?.length || 0}弯
      </div>
      <button
        onClick={onAdopt}
        style={adoptButtonStyle}
      >
        采用候选地图
      </button>
    </div>
  );
}
