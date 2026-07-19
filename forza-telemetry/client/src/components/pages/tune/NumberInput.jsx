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
    <div className="param-row" style={{
      position: 'relative',
      marginBottom: 12,
      padding: '4px 6px',
      borderRadius: 6,
      border: '1px solid transparent',
      transition: 'all 0.18s ease'
    }}>
      <style>{`
        @keyframes recommendedGlow {
          0% { box-shadow: 0 0 4px rgba(63, 185, 80, 0.3), inset 0 0 2px rgba(63, 185, 80, 0.2); border-color: rgba(63, 185, 80, 0.4); }
          50% { box-shadow: 0 0 12px rgba(63, 185, 80, 0.85), inset 0 0 4px rgba(63, 185, 80, 0.4); border-color: #3fb950; }
          100% { box-shadow: 0 0 4px rgba(63, 185, 80, 0.3), inset 0 0 2px rgba(63, 185, 80, 0.2); border-color: rgba(63, 185, 80, 0.4); }
        }
        .input-glow-recommended {
          animation: recommendedGlow 2.5s infinite ease-in-out;
        }
        .fh5-range-slider {
          -webkit-appearance: none;
          appearance: none;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
          outline: none;
          transition: background 0.2s;
        }
        .fh5-range-slider:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
        }
        .fh5-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--thumb-color, var(--accent));
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 0 6px var(--thumb-glow, rgba(56, 139, 253, 0.4));
          transition: transform 0.15s, background-color 0.15s;
        }
        .fh5-range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.35);
        }
        
        .param-row {
          background: transparent;
        }
        .param-row:hover {
          background: rgba(255, 255, 255, 0.02);
          border-color: rgba(255, 255, 255, 0.04);
        }
        .param-row .reset-icon-btn {
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(88, 166, 255, 0.08);
          border: 1px solid rgba(88, 166, 255, 0.2);
          color: #58a6ff;
          cursor: pointer;
          border-radius: 4px;
          width: 18px;
          height: 18px;
          font-size: 10px;
          padding: 0;
          line-height: 1;
        }
        .param-row:hover .reset-icon-btn {
          opacity: 1;
          pointer-events: auto;
        }
        .param-row .reset-icon-btn:hover {
          background: #58a6ff;
          color: #0d1117;
          border-color: #58a6ff;
          transform: rotate(-180deg);
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label className="label-ctrl" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>
          {label} {unit && <span style={{ color: 'var(--text-muted)' }}>({unit})</span>}
          {locked && <span style={{ color: '#da3633', marginLeft: 4, fontSize: 9, fontWeight: 400 }} title={lockedHint}>🔒 {lockedHint || '需升级'}</span>}
          {highlighted && <span style={{ color: '#3fb950', marginLeft: 4, fontSize: 9, fontWeight: 600 }}>遥测推荐</span>}
        </label>
        {defaultValue !== undefined && !locked && isOffDefault && onResetDefault && (
          <button
            type="button"
            className="reset-icon-btn"
            onClick={(e) => { e.stopPropagation(); onResetDefault(); }}
            title={`重置到默认推荐值: ${defaultValue}`}
          >
            ↺
          </button>
        )}
      </div>

      {suggestedValue !== undefined && !locked ? (
        <div style={{
          fontSize: 8, color: '#3fb950', marginTop: -2, marginBottom: 4,
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
          className="fh5-range-slider"
          value={locked ? min : (value === '' || value === '-' ? min : value)}
          onChange={(e) => { if (!locked) onChange(parseFloat(e.target.value)) }}
          disabled={locked}
          style={{
            flex: 1,
            height: 5,
            cursor: locked ? 'not-allowed' : 'pointer',
            opacity: locked ? 0.3 : 1,
            '--thumb-color': highlighted ? '#3fb950' : 'var(--accent)',
            '--thumb-glow': highlighted ? 'rgba(63, 185, 80, 0.6)' : 'rgba(56, 139, 253, 0.4)'
          }}
        />

        <input
          type="number"
          className={highlighted ? 'input-glow-recommended' : ''}
          value={locked ? '-' : value}
          onChange={handleChange}
          onBlur={handleBlur}
          min={min}
          max={max}
          step={step}
          disabled={locked}
          style={{
            width: 54,
            height: 24,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: highlighted ? '#3fb950' : 'var(--text-primary)',
            fontWeight: highlighted ? 700 : 400,
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 10,
            outline: 'none',
            boxShadow: highlighted ? 'none' : (isOffDefault ? 'inset 0 0 0 1px rgba(210, 153, 34, 0.15)' : 'none'),
            borderColor: highlighted ? 'transparent' : (isOffDefault ? 'rgba(210, 153, 34, 0.3)' : 'var(--border)'),
            opacity: locked ? 0.4 : 1,
            cursor: locked ? 'not-allowed' : 'auto',
            transition: 'border-color 0.25s, box-shadow 0.25s, color 0.25s'
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
