import { useState, useEffect } from 'react';

let toastCallback = null;

export function toast(message, type = 'info', duration = 3000) {
  if (toastCallback) toastCallback({ message, type, duration });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    toastCallback = (t) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { ...t, id }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== id));
      }, t.duration || 3000);
    };
    return () => { toastCallback = null; };
  }, []);

  const colors = {
    info: { bg: 'rgba(88,166,255,0.15)', border: 'rgba(88,166,255,0.4)', color: '#58a6ff' },
    success: { bg: 'rgba(63,185,80,0.15)', border: 'rgba(63,185,80,0.4)', color: '#3fb950' },
    warning: { bg: 'rgba(210,153,34,0.15)', border: 'rgba(210,153,34,0.4)', color: '#d29922' },
    error: { bg: 'rgba(248,81,73,0.15)', border: 'rgba(248,81,73,0.4)', color: '#f85149' },
  };

  return (
    <div style={{
      position: 'fixed',
      top: 70,
      right: 16,
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 320,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const c = colors[t.type] || colors.info;
        return (
          <div key={t.id} style={{
            background: c.bg,
            border: `1px solid ${c.border}`,
            color: c.color,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: 12,
            fontWeight: 600,
            animation: 'toastIn 0.3s ease',
            backdropFilter: 'blur(4px)',
          }}>
            {t.message}
          </div>
        );
      })}
      <style>{`
        @keyframes toastIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
