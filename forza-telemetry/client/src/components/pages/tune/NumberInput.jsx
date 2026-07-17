import React from 'react';

export const NumberInput = React.memo(function NumberInput({ label, value, onChange, min, max, step, unit = '', locked = false, lockedHint = '', defaultValue, highlighted = false, onResetDefault, suggestedValue }) {
  const handleChange = (e) => {
    if (locked) return
    const raw = e.target.value
    if (raw === '' || raw === '-') {
      onChange(raw)
      return
    }
    const num = parseFloat(raw)
    if (isNaN(num)) return
    onChange(num)
  }

  const handleBlur = () => {
    if (locked) return
    if (value === '' || value === '-') {
      onChange(min)
      return
    }
    let num = parseFloat(value)
    if (isNaN(num)) num = min
    if (num < min) num = min
    if (num > max) num = max
    onChange(num)
  }

  const isOffDefault = defaultValue !== undefined && value !== undefined && parseFloat(value) !== parseFloat(defaultValue)

  return (
    <div style={{ position: 'relative' }}>
      <label className="label-ctrl">
        {label} {unit && <span style={{ color: 'var(--text-muted)' }}>({unit})</span>}
        {locked && <span style={{ color: '#da3633', marginLeft: 4, fontSize: 9, fontWeight: 400 }} title={lockedHint}>🔒 {lockedHint || '需升级'}</span>}
        {highlighted && <span style={{ color: '#d29922', marginLeft: 4, fontSize: 9, fontWeight: 600 }}>遥测推荐</span>}
      </label>
      {suggestedValue !== undefined && !locked ? (
        <div style={{
          fontSize: 8, color: '#d29922', marginTop: -2, marginBottom: 2,
          display: 'flex', alignItems: 'center', gap: 3
        }}>
          <span>遥测预填建议: {suggestedValue}</span>
          <span style={{ color: 'var(--text-muted)' }}>(差值: {Number((parseFloat(value) - suggestedValue).toFixed(2)) > 0 ? `+${(parseFloat(value) - suggestedValue).toFixed(2)}` : (parseFloat(value) - suggestedValue).toFixed(2)})</span>
        </div>
      ) : (defaultValue !== undefined && !locked && isOffDefault && (
        <div style={{
          fontSize: 8, color: '#d29922', marginTop: -2, marginBottom: 2,
          display: 'flex', alignItems: 'center', gap: 3
        }}>
          <span>推荐: {typeof defaultValue === 'number' ? (Number.isInteger(defaultValue) ? defaultValue : defaultValue.toFixed(1)) : defaultValue}</span>
          {onResetDefault && (
            <span onClick={(e) => { e.stopPropagation(); onResetDefault() }} style={{
              cursor: 'pointer', color: '#58a6ff', textDecoration: 'underline', fontSize: 7
            }}>重置</span>
          )}
        </div>
      ))}
      <input
        type="number"
        value={locked ? '-' : value}
        onChange={handleChange}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        disabled={locked}
        className="input-ctrl"
        style={{
          opacity: locked ? 0.4 : 1,
          cursor: locked ? 'not-allowed' : 'auto',
          boxShadow: highlighted ? '0 0 10px rgba(210, 153, 34, 0.6)' : (isOffDefault ? 'inset 0 0 0 1px rgba(210, 153, 34, 0.3)' : 'none'),
          borderColor: highlighted ? '#d29922' : (isOffDefault ? 'rgba(210, 153, 34, 0.5)' : 'var(--border)'),
          animation: highlighted ? 'paramAmberBreathing 1.5s ease-in-out infinite' : 'none'
        }}
      />
    </div>
  )
});
