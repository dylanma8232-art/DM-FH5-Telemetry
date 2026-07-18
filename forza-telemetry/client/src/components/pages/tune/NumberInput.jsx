import React from 'react';

export const NumberInput = React.memo(function NumberInput({
  label, value, onChange, min, max, step, unit = '', locked = false,
  lockedHint = '', defaultValue, highlighted = false, onResetDefault, suggestedValue
}) {
  
  const handleChange = (e) => {
    if (locked) return;
    const raw = e.target.value;
    if (raw === '' || raw === '-') {
      onChange(raw);
      return;
    }
    const num = parseFloat(raw);
    if (isNaN(num)) return;
    onChange(num);
  };

  const handleBlur = () => {
    if (locked) return;
    if (value === '' || value === '-') {
      onChange(min);
      return;
    }
    let num = parseFloat(value);
    if (isNaN(num)) num = min;
    if (num < min) num = min;
    if (num > max) num = max;
    onChange(num);
  };

  const adjust = (delta) => {
    if (locked) return;
    let num = parseFloat(value);
    if (isNaN(num)) num = defaultValue !== undefined ? defaultValue : min;
    const stepStr = step.toString();
    const precision = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
    num = parseFloat((num + delta).toFixed(precision));
    if (num < min) num = min;
    if (num > max) num = max;
    onChange(num);
  };

  const isOffDefault = defaultValue !== undefined && value !== undefined && parseFloat(value) !== parseFloat(defaultValue);

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label className="label-ctrl" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>
          {label} {unit && <span style={{ color: 'var(--text-muted)' }}>({unit})</span>}
          {locked && <span style={{ color: '#da3633', marginLeft: 4, fontSize: 9, fontWeight: 400 }} title={lockedHint}>🔒 {lockedHint || '需升级'}</span>}
          {highlighted && <span style={{ color: '#d29922', marginLeft: 4, fontSize: 9, fontWeight: 600 }}>遥测推荐</span>}
        </label>
      </div>

      {suggestedValue !== undefined && !locked ? (
        <div style={{
          fontSize: 8, color: '#d29922', marginTop: -2, marginBottom: 4,
          display: 'flex', alignItems: 'center', gap: 3
        }}>
          <span>遥测预填建议: {suggestedValue}</span>
          <span style={{ color: 'var(--text-muted)' }}>(差值: {Number((parseFloat(value) - suggestedValue).toFixed(2)) > 0 ? `+${(parseFloat(value) - suggestedValue).toFixed(2)}` : (parseFloat(value) - suggestedValue).toFixed(2)})</span>
        </div>
      ) : (defaultValue !== undefined && !locked && isOffDefault && (
        <div style={{
          fontSize: 8, color: '#d29922', marginTop: -2, marginBottom: 4,
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <button
          type="button"
          disabled={locked}
          onClick={() => adjust(-step)}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            borderRadius: 4,
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: locked ? 'not-allowed' : 'pointer',
            userSelect: 'none',
            fontSize: 12,
            fontWeight: 'bold',
            opacity: locked ? 0.3 : 1
          }}
        >
          -
        </button>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={locked ? min : (value === '' || value === '-' ? min : value)}
          onChange={(e) => { if (!locked) onChange(parseFloat(e.target.value)) }}
          disabled={locked}
          style={{
            flex: 1,
            height: 4,
            accentColor: highlighted ? '#d29922' : 'var(--accent)',
            cursor: locked ? 'not-allowed' : 'pointer',
            opacity: locked ? 0.3 : 1
          }}
        />

        <input
          type="number"
          value={locked ? '-' : value}
          onChange={handleChange}
          onBlur={handleBlur}
          min={min}
          max={max}
          step={step}
          disabled={locked}
          style={{
            width: 52,
            height: 24,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 10,
            outline: 'none',
            boxShadow: highlighted ? '0 0 10px rgba(210, 153, 34, 0.6)' : (isOffDefault ? 'inset 0 0 0 1px rgba(210, 153, 34, 0.2)' : 'none'),
            borderColor: highlighted ? '#d29922' : (isOffDefault ? 'rgba(210, 153, 34, 0.4)' : 'var(--border)'),
            opacity: locked ? 0.4 : 1,
            cursor: locked ? 'not-allowed' : 'auto'
          }}
        />

        <button
          type="button"
          disabled={locked}
          onClick={() => adjust(step)}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            borderRadius: 4,
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: locked ? 'not-allowed' : 'pointer',
            userSelect: 'none',
            fontSize: 12,
            fontWeight: 'bold',
            opacity: locked ? 0.3 : 1
          }}
        >
          +
        </button>
      </div>
    </div>
  );
});
