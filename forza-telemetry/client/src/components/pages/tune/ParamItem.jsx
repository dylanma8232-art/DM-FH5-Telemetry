import React from 'react';

export const ParamItem = React.memo(function ParamItem({ label, value, unit = '', defaultValue }) {
  const displayValue = value !== undefined && value !== null && value !== '' ? value : '-'
  
  // 检查是否被修改过 (与默认值不同)
  const isModified = defaultValue !== undefined && defaultValue !== null && defaultValue !== '' && 
                     value !== undefined && value !== null && value !== '' && 
                     Number(value) !== Number(defaultValue);
  
  const diff = isModified ? Number(value) - Number(defaultValue) : null;
  const diffStr = diff !== null
    ? (diff > 0 ? '+' : '') + (Number.isInteger(diff) ? diff : diff.toFixed(2))
    : null;
    
  // 确定差值颜色
  let diffColor = '#8b949e';
  let diffBg = 'rgba(139, 148, 158, 0.12)';
  
  if (diff !== null) {
    if (label.includes('束角') || label.includes('Toe')) {
      const better = Math.abs(Number(value)) < Math.abs(Number(defaultValue));
      diffColor = better ? '#3fb950' : '#f85149';
      diffBg = better ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)';
    } else {
      diffColor = '#58a6ff'; // 蓝色高亮改动
      diffBg = 'rgba(88, 166, 255, 0.12)';
    }
  }

  return (
    <div style={{
      background: isModified ? 'rgba(56, 139, 253, 0.05)' : 'rgba(22, 27, 34, 0.2)',
      borderRadius: 6,
      padding: '8px 10px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      border: isModified ? '1px solid rgba(56, 139, 253, 0.2)' : '1px solid rgba(48, 54, 66, 0.25)',
      opacity: isModified ? 1 : 0.6,
      transition: 'all 0.2s ease',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ 
          fontSize: 10, 
          color: isModified ? 'var(--text-primary)' : 'var(--text-muted)',
          fontWeight: isModified ? 600 : 400
        }}>
          {label}
        </span>
        {isModified && (
          <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
            原厂: {defaultValue}{unit}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ 
          fontSize: 11, 
          fontWeight: 700, 
          fontFamily: 'monospace', 
          color: isModified ? '#58a6ff' : 'var(--text-primary)' 
        }}>
          {displayValue}{unit}
        </span>
        {diffStr && (
          <span style={{
            fontSize: 8, 
            fontWeight: 700, 
            fontFamily: 'monospace',
            color: diffColor,
            background: diffBg,
            padding: '1px 4px', 
            borderRadius: 3,
            border: `1px solid ${diffColor}25`
          }}>
            {diffStr}
          </span>
        )}
      </div>
    </div>
  )
});

