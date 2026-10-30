import React from 'react';
import ReactDOM from 'react-dom/client';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App.jsx';

function AppWithProviders() {
  return (
    <SettingsProvider>
      <AppWrapper />
    </SettingsProvider>
  );
}

function AppWrapper() {
  const { settings } = useSettings();
  return (
    <ThemeProvider themeId={settings.theme}>
      <App />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppWithProviders />
  </React.StrictMode>
);