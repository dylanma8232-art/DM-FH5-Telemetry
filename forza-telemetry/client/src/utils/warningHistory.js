export class WarningHistory {
  constructor(maxSize = 20) {
    this.history = [];
    this.maxSize = maxSize;
    this.cooldowns = new Map();
  }

  addWarning(warning) {
    const now = Date.now();
    const cooldownKey = `${warning.type}_${warning.category}`;
    const lastTime = this.cooldowns.get(cooldownKey) || 0;
    const cooldown = warning.cooldown || 2000;

    if (now - lastTime < cooldown) {
      return false;
    }

    this.cooldowns.set(cooldownKey, now);
    
    const historyEntry = {
      ...warning,
      timestamp: now,
      id: `warning_${now}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.history.unshift(historyEntry);
    
    if (this.history.length > this.maxSize) {
      this.history.pop();
    }

    return true;
  }

  getHistory() {
    return [...this.history];
  }

  getRecentWarnings(count = 5) {
    return this.history.slice(0, count);
  }

  getWarningStats() {
    const stats = {};
    this.history.forEach(warning => {
      const key = warning.category;
      if (!stats[key]) {
        stats[key] = { count: 0, lastTime: 0 };
      }
      stats[key].count++;
      stats[key].lastTime = warning.timestamp;
    });
    return stats;
  }

  clear() {
    this.history = [];
    this.cooldowns.clear();
  }

  clearOldCooldowns(maxAge = 10000) {
    const now = Date.now();
    for (const [key, time] of this.cooldowns.entries()) {
      if (now - time > maxAge) {
        this.cooldowns.delete(key);
      }
    }
  }
}