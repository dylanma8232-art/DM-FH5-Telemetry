import { useRef, useState } from 'react';

// 可搜索赛道下拉组件。
export function SearchableTrackSelect({ tracks, value, onChange, placeholder, excludeId, highlightColor = '#58a6ff' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const entries = Object.entries(tracks).filter(([id]) => id !== excludeId);
  const filtered = entries.filter(([id, t]) => (t.name || id).toLowerCase().includes(query.toLowerCase()));
  const selectedName = value && tracks[value] ? (tracks[value].name || value) : '';

  return (
    <div style={{ position: 'relative' }}>
      <input ref={inputRef} type="text" value={open ? query : selectedName}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onBlur={() => { setTimeout(() => setOpen(false), 200); }} placeholder={placeholder}
        style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-primary)', border: `1px solid ${value ? highlightColor : 'var(--border)'}`, borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
      {value && <button onClick={() => { onChange(''); setQuery(''); }} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>}
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, maxHeight: 220, overflowY: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, marginTop: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          {filtered.map(([id, t]) => (
            <div key={id} onMouseDown={() => { onChange(id); setOpen(false); setQuery(''); }}
              style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 11, background: id === value ? `${highlightColor}22` : 'transparent', color: id === value ? highlightColor : 'var(--text-primary)', borderBottom: '1px solid rgba(48,54,61,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(88,166,255,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = id === value ? `${highlightColor}22` : 'transparent'}>
              <span>{t.name || id}</span>
              <span style={{ fontSize: 9, color: '#484f58', fontFamily: 'monospace' }}>{t.length ? Math.round(t.length) + 'm' : ''} {t.turns ? t.turns.length + '弯' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
