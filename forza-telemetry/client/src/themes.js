export const themes = {
  dark: {
    id: 'dark',
    name: 'Dark',
    description: '默认深色主题，适合夜间驾驶',
    colors: {
      bgPrimary: '#0d1117',
      bgSecondary: '#1a1a1a',
      bgTertiary: '#21262d',
      bgQuaternary: '#161b22',
      textPrimary: '#c9d1d9',
      textSecondary: '#8b949e',
      textMuted: '#484f58',
      accent: '#58a6ff',
      success: '#3fb950',
      warning: '#d29922',
      danger: '#f85149',
      info: '#58a6ff',
      border: '#30363d',
      borderLight: '#21262d',
      rpmGradient: ['#3fb950', '#d29922', '#f85149'],
      speedColor: '#3fb950',
      gearColor: '#58a6ff',
      throttleColor: '#3fb950',
      brakeColor: '#f85149',
      steerColor: '#58a6ff',
      gForceColors: {
        low: '#3fb950',
        medium: '#58a6ff',
        high: '#d29922',
        extreme: '#f85149'
      },
      tireTempColors: {
        cold: '#58a6ff',
        optimal: '#3fb950',
        warm: '#d29922',
        hot: '#f85149'
      }
    }
  },
  oled: {
    id: 'oled',
    name: 'OLED Black',
    description: '纯黑主题，OLED屏幕省电/高对比',
    colors: {
      bgPrimary: '#000000',
      bgSecondary: '#0a0a0a',
      bgTertiary: '#141414',
      bgQuaternary: '#0f0f0f',
      textPrimary: '#e6edf3',
      textSecondary: '#8b949e',
      textMuted: '#484f58',
      accent: '#79c0ff',
      success: '#56d364',
      warning: '#e3b341',
      danger: '#ff7b72',
      info: '#79c0ff',
      border: '#21262d',
      borderLight: '#141414',
      rpmGradient: ['#56d364', '#e3b341', '#ff7b72'],
      speedColor: '#56d364',
      gearColor: '#79c0ff',
      throttleColor: '#56d364',
      brakeColor: '#ff7b72',
      steerColor: '#79c0ff',
      gForceColors: {
        low: '#56d364',
        medium: '#79c0ff',
        high: '#e3b341',
        extreme: '#ff7b72'
      },
      tireTempColors: {
        cold: '#79c0ff',
        optimal: '#56d364',
        warm: '#e3b341',
        hot: '#ff7b72'
      }
    }
  },
  light: {
    id: 'light',
    name: 'Light',
    description: '浅色主题，适合日间/强光环境',
    colors: {
      bgPrimary: '#f6f8fa',
      bgSecondary: '#ffffff',
      bgTertiary: '#eaeef2',
      bgQuaternary: '#f0f2f5',
      textPrimary: '#1f2328',
      textSecondary: '#656d76',
      textMuted: '#8b949e',
      accent: '#0969da',
      success: '#1a7f37',
      warning: '#9a6700',
      danger: '#cf222e',
      info: '#0969da',
      border: '#d0d7de',
      borderLight: '#eaeef2',
      rpmGradient: ['#1a7f37', '#9a6700', '#cf222e'],
      speedColor: '#1a7f37',
      gearColor: '#0969da',
      throttleColor: '#1a7f37',
      brakeColor: '#cf222e',
      steerColor: '#0969da',
      gForceColors: {
        low: '#1a7f37',
        medium: '#0969da',
        high: '#9a6700',
        extreme: '#cf222e'
      },
      tireTempColors: {
        cold: '#0969da',
        optimal: '#1a7f37',
        warm: '#9a6700',
        hot: '#cf222e'
      }
    }
  }
};

export const defaultSettings = {
  version: 1,
  theme: 'dark',
  preferences: {
    speedUnit: 'kmh',
    tempUnit: 'celsius',
    gForceDecimals: 2,
    gForceTrailLength: 30,
    warningSound: true,
    warningVisualEffects: true,
    dataRefreshRate: 'realtime',
    showFullDataPanel: true
  },
  layout: {
    columns: 3,
    columnWidths: [200, '1fr', 220],
    zones: {
      left: ['speedGear', 'controls'],
      center: ['warning', 'gforce', 'throttleBrake'],
      right: ['recording', 'vehicle', 'lap', 'tire'],
      bottom: ['fullData']
    },
    hiddenPanels: [],
    collapsedPanels: []
  }
};

export function getThemeCSSVariables(theme) {
  const colors = theme.colors;
  return {
    '--bg-primary': colors.bgPrimary,
    '--bg-secondary': colors.bgSecondary,
    '--bg-tertiary': colors.bgTertiary,
    '--bg-quaternary': colors.bgQuaternary,
    '--text-primary': colors.textPrimary,
    '--text-secondary': colors.textSecondary,
    '--text-muted': colors.textMuted,
    '--accent': colors.accent,
    '--success': colors.success,
    '--warning': colors.warning,
    '--danger': colors.danger,
    '--info': colors.info,
    '--border': colors.border,
    '--border-light': colors.borderLight,
    '--speed-color': colors.speedColor,
    '--gear-color': colors.gearColor,
    '--throttle-color': colors.throttleColor,
    '--brake-color': colors.brakeColor,
    '--steer-color': colors.steerColor
  };
}