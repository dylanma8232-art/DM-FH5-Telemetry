import { useEffect } from 'react';

export function useKeyboard(shortcuts) {
  useEffect(() => {
    const handler = (e) => {
      // 如果焦点在输入元素上，不触发快捷键
      const isInput = e.target.tagName === 'INPUT' || 
                      e.target.tagName === 'TEXTAREA' || 
                      e.target.isContentEditable ||
                      e.target.tagName === 'SELECT';
      if (isInput) return;

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
