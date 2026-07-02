import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { defaultSettings } from '../themes';

const SettingsContext = createContext(null);

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

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const keys = key.split('.');
      if (keys.length === 1) {
        return { ...prev, [key]: value };
      }
      const result = { ...prev };
      let current = result;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return result;
    });
  }, []);

  const updatePreferences = useCallback((key, value) => {
    updateSetting('preferences.' + key, value);
  }, [updateSetting]);

  const updateLayout = useCallback((key, value) => {
    updateSetting('layout.' + key, value);
  }, [updateSetting]);

  const togglePanelVisibility = useCallback((panelId) => {
    setSettings(prev => {
      const hidden = prev.layout.hiddenPanels || [];
      const isHidden = hidden.includes(panelId);
      return {
        ...prev,
        layout: {
          ...prev.layout,
          hiddenPanels: isHidden 
            ? hidden.filter(id => id !== panelId)
            : [...hidden, panelId]
        }
      };
    });
  }, []);

  const togglePanelCollapse = useCallback((panelId) => {
    setSettings(prev => {
      const collapsed = prev.layout.collapsedPanels || [];
      const isCollapsed = collapsed.includes(panelId);
      return {
        ...prev,
        layout: {
          ...prev.layout,
          collapsedPanels: isCollapsed
            ? collapsed.filter(id => id !== panelId)
            : [...collapsed, panelId]
        }
      };
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...defaultSettings });
  }, []);

  const exportSettings = useCallback(() => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fh5-telemetry-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [settings]);

  const importSettings = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (imported.version === defaultSettings.version) {
            setSettings({ ...defaultSettings, ...imported });
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
  }, []);

  const contextValue = useMemo(() => ({
    settings,
    updateSetting,
    updatePreferences,
    updateLayout,
    togglePanelVisibility,
    togglePanelCollapse,
    resetSettings,
    exportSettings,
    importSettings,
    themeId: settings.theme
  }), [settings, updateSetting, updatePreferences, updateLayout, togglePanelVisibility, togglePanelCollapse, resetSettings, exportSettings, importSettings]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export default SettingsContext;