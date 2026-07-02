import React, { createContext, useContext, useMemo } from 'react';
import { themes, getThemeCSSVariables } from '../themes';

const ThemeContext = createContext(null);

export function ThemeProvider({ themeId, children }) {
  const theme = useMemo(() => {
    return themes[themeId] || themes.dark;
  }, [themeId]);

  const cssVariables = useMemo(() => {
    return getThemeCSSVariables(theme);
  }, [theme]);

  const contextValue = useMemo(() => {
    return {
      theme,
      themeId,
      colors: theme.colors,
      cssVariables
    };
  }, [theme, themeId, cssVariables]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <div style={cssVariables}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;