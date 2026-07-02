export const WARNING_TYPES = {
  DANGER: 'danger',
  WARNING: 'warning',
  INFO: 'info'
};

export const WARNING_CATEGORIES = {
  TIRE: 'tire',
  ENGINE: 'engine',
  BRAKE: 'brake',
  SUSPENSION: 'suspension',
  TRACK: 'track',
  FUEL: 'fuel',
  GFORCE: 'gforce'
};

export const defaultWarningConfig = {
  enabled: true,
  visualEffects: 'full', // 'full', 'minimal', 'off'
  categories: {
    [WARNING_CATEGORIES.TIRE]: {
      enabled: true,
      priority: WARNING_TYPES.DANGER
    },
    [WARNING_CATEGORIES.ENGINE]: {
      enabled: true,
      priority: WARNING_TYPES.WARNING
    },
    [WARNING_CATEGORIES.BRAKE]: {
      enabled: true,
      priority: WARNING_TYPES.DANGER
    },
    [WARNING_CATEGORIES.SUSPENSION]: {
      enabled: true,
      priority: WARNING_TYPES.WARNING
    },
    [WARNING_CATEGORIES.TRACK]: {
      enabled: true,
      priority: WARNING_TYPES.INFO
    },
    [WARNING_CATEGORIES.FUEL]: {
      enabled: true,
      priority: WARNING_TYPES.INFO
    },
    [WARNING_CATEGORIES.GFORCE]: {
      enabled: true,
      priority: WARNING_TYPES.WARNING
    }
  },
  thresholds: {
    tireOverheat: 130,      // °F
    tireOvercold: 50,       // °F
    tireSlipSevere: 1.2,
    tireSlipModerate: 0.8,
    engineRedline: 0.9,     // 90% of max RPM
    brakeLockSevere: -0.8,
    brakeLockModerate: -0.5,
    powerSlipSevere: 0.6,
    powerSlipModerate: 0.4,
    suspensionCompress: 0.15,
    suspensionExtend: 0.85,
    gforceHigh: 1.8,
    fuelLow: 0.15,
    boostHigh: 2.0
  },
  cooldowns: {
    [WARNING_TYPES.DANGER]: 1000,   // 1 second
    [WARNING_TYPES.WARNING]: 2000,  // 2 seconds
    [WARNING_TYPES.INFO]: 5000      // 5 seconds
  }
};

export function getWarningColor(type) {
  switch (type) {
    case WARNING_TYPES.DANGER: return '#f85149';
    case WARNING_TYPES.WARNING: return '#d29922';
    case WARNING_TYPES.INFO: return '#58a6ff';
    default: return '#8b949e';
  }
}

export function getWarningAnimation(type, visualEffects) {
  if (visualEffects === 'off') return 'none';
  if (visualEffects === 'minimal') {
    return type === WARNING_TYPES.DANGER ? 'pulse 1s infinite' : 'none';
  }
  
  switch (type) {
    case WARNING_TYPES.DANGER: return 'pulse 0.5s infinite';
    case WARNING_TYPES.WARNING: return 'pulse 1s infinite';
    default: return 'none';
  }
}