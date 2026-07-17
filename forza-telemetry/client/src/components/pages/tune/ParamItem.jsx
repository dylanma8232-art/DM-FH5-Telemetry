import React from 'react';

export const ParamItem = React.memo(function ParamItem({ label, value, unit = '', defaultValue }) {
  const displayValue = value !== undefined && value !== null ? value : '-'
  const diff = defaultValue !== undefined && value !== undefined && value !== null && value !== defaultValue ? value - defaultValue : null
  const diffStr = diff !== null
    ? (diff > 0 ? '+' : '') + (Number.isInteger(diff) ? diff : diff.toFixed(2))
    : null
  const diffColor = diff !== null
    ? (label.includes('束角') || label.includes('Toe')
        ? (Math.abs(value) < Math.abs(defaultValue) ? '#3fb950' : '#f85149')
        : '#d29922')
    : 'inherit'

  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: 4,
      padding: '6px 8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
          {displayValue}{unit}
        </span>
        {diffStr && (
          <span style={{
            fontSize: 8, fontWeight: 600, fontFamily: 'monospace',
            color: diffColor,
            background: diffColor === '#3fb950' ? 'rgba(63,185,80,0.12)' : (diffColor === '#f85149' ? 'rgba(248,81,73,0.12)' : 'rgba(210,153,34,0.12)'),
            padding: '0 3px', borderRadius: 2
          }}>
            {diffStr}
          </span>
        )}
      </div>
    </div>
  )
});
