export const SESSION_PAGE_SIZE = 20;

const LEADERBOARD_VEHICLE_CLASSES = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];

export function getUniqueTracks(sessions) {
  return [...new Set(sessions.map(session => session.trackName || '未知赛道'))].filter(Boolean);
}

export function buildGroupedAchievements(lbEntries, sessions, vehiclesList) {
  const map = new Map();
  for (const entry of lbEntries) {
    const trackId = entry.trackId || 'unknown';
    if (!map.has(trackId)) {
      map.set(trackId, {
        trackId,
        trackName: entry.trackName || '未知赛道',
        bestLap: entry.bestLap || 0,
        firstLap: entry.firstLap || 0,
        totalLaps: 0,
        sessionCount: 0,
        recentBreakthrough: false,
        daysSinceLastSession: Infinity,
        vehicles: [],
        lastSessionAt: null,
        recentBestLaps: []
      });
    }
    const item = map.get(trackId);
    item.vehicles.push({
      vehicleOrdinal: entry.vehicleOrdinal,
      vehicleName: vehiclesList[entry.vehicleOrdinal]?.name || entry.vehicleName,
      vehicleClass: entry.vehicleClass,
      vehiclePI: entry.vehiclePI,
      bestLap: entry.bestLap,
      sessionCount: entry.sessionCount,
      totalLaps: entry.totalLaps
    });
    item.totalLaps += entry.totalLaps || 0;
    item.sessionCount += entry.sessionCount || 0;

    if (entry.bestLap > 0 && (item.bestLap === 0 || entry.bestLap < item.bestLap)) {
      item.bestLap = entry.bestLap;
      item.vehicleOrdinal = entry.vehicleOrdinal;
      item.vehicleName = vehiclesList[entry.vehicleOrdinal]?.name || entry.vehicleName;
      item.vehicleClass = entry.vehicleClass;
      item.vehiclePI = entry.vehiclePI;
    }
    if (entry.recentBreakthrough) item.recentBreakthrough = true;
    if (entry.daysSinceLastSession < item.daysSinceLastSession) item.daysSinceLastSession = entry.daysSinceLastSession;
    if (!item.lastSessionAt || (entry.lastSessionAt && new Date(entry.lastSessionAt) > new Date(item.lastSessionAt))) {
      item.lastSessionAt = entry.lastSessionAt;
    }
  }

  const list = [];
  map.forEach(item => {
    item.vehicles.sort((a, b) => {
      if (a.bestLap === 0) return 1;
      if (b.bestLap === 0) return -1;
      return a.bestLap - b.bestLap;
    });
    const validFirstLaps = lbEntries
      .filter(entry => entry.trackId === item.trackId && entry.firstLap > 0)
      .map(entry => entry.firstLap);
    item.firstLap = validFirstLaps.length > 0 ? Math.min(...validFirstLaps) : 0;

    const trackSessions = [...sessions].filter(session => session.trackId === item.trackId).reverse();
    item.recentBestLaps = trackSessions
      .filter(session => session.laps?.best > 0)
      .slice(-5)
      .map((session, index) => ({ index: index + 1, bestLap: session.laps.best }));
    list.push(item);
  });
  list.sort((a, b) => new Date(b.lastSessionAt) - new Date(a.lastSessionAt));
  return list;
}

export function buildGgData(channelsData) {
  const channels = channelsData?.channels || [];
  if (channels.length === 0) return { sampled: [], maxLat: 0, maxBrake: 0 };

  const threshold = 0.8;
  const sampled = [];
  for (let index = 0; index < channels.length; index += 4) {
    const channel = channels[index];
    const lateral = Math.abs(channel.gLat || 0);
    const longitudinal = Math.abs(channel.gLong || 0);
    sampled.push(channel);
    if (lateral > threshold || longitudinal > threshold) {
      for (let nearbyIndex = Math.max(0, index - 2); nearbyIndex < Math.min(channels.length, index + 3); nearbyIndex++) {
        if (nearbyIndex !== index) sampled.push(channels[nearbyIndex]);
      }
    }
  }

  let maxLat = 0;
  let maxBrake = 0;
  for (const channel of channels) {
    const lateral = Math.abs(channel.gLat || 0);
    const brake = channel.gLong < 0 ? Math.abs(channel.gLong) : 0;
    if (lateral > maxLat) maxLat = lateral;
    if (brake > maxBrake) maxBrake = brake;
  }
  return { sampled, maxLat, maxBrake };
}

export function buildSectorTimingData(advancedData) {
  if (!advancedData || !advancedData.lapSectorDetails || advancedData.lapSectorDetails.length === 0) return null;
  const isMultiLap = advancedData.lapCount > 1;
  const allLosses = advancedData.lapSectorDetails.flatMap(lap => lap.sectors.map(sector => sector.loss));
  const allTimes = advancedData.lapSectorDetails.flatMap(lap => lap.sectors.map(sector => sector.time));
  const maxTime = Math.max(...allTimes);
  const maxLoss = Math.max(...allLosses.map(loss => Math.max(0, loss)), 0.01);
  return { isMultiLap, maxTime, maxLoss };
}

export function filterSessions(sessions, sessionSearchQuery, trackFilter) {
  const normalizedSearch = sessionSearchQuery.trim().toLowerCase();
  return sessions.filter(session => {
    const trackName = session.trackName || '未知赛道';
    const vehicleName = session.vehicle?.name || '';
    const matchSearch = !normalizedSearch ||
      trackName.toLowerCase().includes(normalizedSearch) ||
      vehicleName.toLowerCase().includes(normalizedSearch);
    const matchTrack = !trackFilter || session.trackId === trackFilter || trackName === trackFilter;
    return matchSearch && matchTrack;
  });
}

export function formatLeaderboardTime(seconds) {
  if (!seconds || seconds <= 0) return '-';
  const minutes = Math.floor(seconds / 60);
  const secondsPart = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  return `${minutes}:${secondsPart.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

export function getVehicleClass(cls) {
  return LEADERBOARD_VEHICLE_CLASSES[cls] || '?';
}

export function formatSessionTime(seconds) {
  if (!seconds || seconds === 0) return '--:--.---';
  const minutes = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return minutes + ':' + secondsPart.toFixed(3).padStart(6, '0');
}

export function formatSessionDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function getDiagnosisStyle(diagnosis) {
  if (!diagnosis?.tuneId) return { border: '2px solid var(--text-muted)', background: 'rgba(139, 148, 158, 0.05)' };
  if (!diagnosis.diagnoses?.length) return { border: '2px solid var(--success)', background: 'rgba(0, 200, 150, 0.05)' };
  if (diagnosis.diagnoses.some(item => item.严重程度 === 'high')) {
    return { border: '2px solid var(--danger)', background: 'rgba(248, 81, 73, 0.05)' };
  }
  if (diagnosis.diagnoses.some(item => item.严重程度 === 'medium')) {
    return { border: '2px solid var(--warning)', background: 'rgba(210, 153, 34, 0.05)' };
  }
  return { border: '2px solid var(--accent)', background: 'rgba(88, 166, 255, 0.05)' };
}
