import { useEffect } from 'react';

export function useKeyboard(shortcuts) {
  useEffect(() => {
    const handler = (e) => {
      const key = (e.ctrlKey || e.metaKey ? 'ctrl+' : '') +
                  (e.altKey ? 'alt+' : '') +
                  (e.shiftKey ? 'shift+' : '') +
                  e.key.toLowerCase();
      const action = shortcuts[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
