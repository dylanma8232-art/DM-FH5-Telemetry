export function TelemetryRecommendationList({ result }) {
  if (!result?.recommendations?.length) return null
  const hasAbsoluteTargets = result.mode === 'absolute'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#3fb950', marginBottom: 5 }}>
        {hasAbsoluteTargets ? '当前值 → 遥测建议目标值' : '在游戏当前数值基础上的建议增减量'}
      </div>
      {result.recommendations.map(item => (
        <div key={item.id} style={{ padding: '6px 7px', marginBottom: 5, background: 'var(--bg-primary)', borderRadius: 4, border: '1px solid rgba(63,185,80,0.2)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-primary)', fontWeight: 700 }}>{item.title}</div>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', margin: '2px 0 4px' }}>{item.evidence}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {item.changes.map(change => {
              const delta = `${change.delta > 0 ? '+' : ''}${change.delta}${change.unit}`
              const text = hasAbsoluteTargets && Number.isFinite(change.current) && Number.isFinite(change.target)
                ? `${change.parameter}: ${change.current.toFixed(2)} → ${change.target.toFixed(2)}${change.unit}`
                : `${change.parameter}: ${change.direction} ${delta}`
              return <span key={change.key} style={{ fontSize: 8, padding: '2px 4px', borderRadius: 3, background: 'rgba(63,185,80,0.10)', color: '#3fb950' }}>{text}</span>
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
