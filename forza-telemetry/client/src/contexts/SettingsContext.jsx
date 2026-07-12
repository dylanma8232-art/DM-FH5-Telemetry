import { create } from 'zustand';
import { defaultSettings } from '../themes';
import React, { createContext } from 'react';

const STORAGE_KEY = 'fh5-telemetry-settings';

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.version === defaultSettings.version) {
        return { ...defaultSettings, ...parsed };
      }
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return { ...defaultSettings };
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

const useSettingsStore = create((set, get) => ({
  settings: loadSettings(),
  
  updateSetting: (key, value) => set(state => {
    const keys = key.split('.');
    if (keys.length === 1) {
      const newSettings = { ...state.settings, [key]: value };
      saveSettings(newSettings);
      return { settings: newSettings };
    }
    const result = { ...state.settings };
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = { ...current[keys[i]] };
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    saveSettings(result);
    return { settings: result };
  }),

  updatePreferences: (key, value) => {
    get().updateSetting('preferences.' + key, value);
  },

  updateLayout: (key, value) => {
    get().updateSetting('layout.' + key, value);
  },

  togglePanelVisibility: (panelId) => set(state => {
    const hidden = state.settings.layout.hiddenPanels || [];
    const isHidden = hidden.includes(panelId);
    const newSettings = {
      ...state.settings,
      layout: {
        ...state.settings.layout,
        hiddenPanels: isHidden 
          ? hidden.filter(id => id !== panelId)
          : [...hidden, panelId]
      }
    };
    saveSettings(newSettings);
    return { settings: newSettings };
  }),

  togglePanelCollapse: (panelId) => set(state => {
    const collapsed = state.settings.layout.collapsedPanels || [];
    const isCollapsed = collapsed.includes(panelId);
    const newSettings = {
      ...state.settings,
      layout: {
        ...state.settings.layout,
        collapsedPanels: isCollapsed
          ? collapsed.filter(id => id !== panelId)
          : [...collapsed, panelId]
      }
    };
    saveSettings(newSettings);
    return { settings: newSettings };
  }),

  resetSettings: () => {
    const newSettings = { ...defaultSettings };
    saveSettings(newSettings);
    set({ settings: newSettings });
  },

  exportSettings: () => {
    const blob = new Blob([JSON.stringify(get().settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fh5-telemetry-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importSettings: (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (imported.version === defaultSettings.version) {
            const newSettings = { ...defaultSettings, ...imported };
            saveSettings(newSettings);
            set({ settings: newSettings });
            resolve(true);
          } else {
            reject(new Error('Settings version mismatch'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
}));

// Export a dummy provider to avoid breaking existing imports in App.jsx
export function SettingsProvider({ children }) {
  return <>{children}</>;
}

// Export the hook that returns exactly the same shape as the old context
export function useSettings() {
  const store = useSettingsStore();
  return {
    ...store,
    themeId: store.settings.theme
  };
}

const SettingsContext = createContext(null);
export default SettingsContext;