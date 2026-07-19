const handleResponse = async (res) => {
  if (!res.ok) {
    let errorMsg = '请求失败';
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch (e) { /* ignore */ }
    const err = new Error(errorMsg);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

const get = (url) => fetch(url).then(handleResponse);
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
}).then(handleResponse);

const put = (url, body) => fetch(url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
}).then(handleResponse);

const del = (url) => fetch(url, { method: 'DELETE' }).then(handleResponse);

export const api = {
  vehicles: {
    list: () => get('/api/vehicles'),
    getCatalog: () => get('/api/vehicles/catalog'),
    save: (id, data) => post(`/api/vehicles/${id}`, data),
    delete: (id) => del(`/api/vehicles/${id}`),
    getUpgrades: (id, query = {}) => {
      const params = new URLSearchParams(query).toString();
      return get(`/api/vehicles/${id}/upgrades${params ? '?' + params : ''}`);
    },
    solveUpgrades: (id, body) => post(`/api/vehicles/${id}/upgrades/solve`, body),
    validateUpgrades: (id, body) => post(`/api/vehicles/${id}/upgrades/validate`, body),
  },
  tunes: {
    list: () => get('/api/tunes'),
    get: (id) => get(`/api/tunes/${id}`),
    create: (data) => post('/api/tunes', data),
    update: (id, data) => put(`/api/tunes/${id}`, data),
    delete: (id) => del(`/api/tunes/${id}`),
    compare: (query = {}) => {
      const params = new URLSearchParams(query).toString();
      return get(`/api/tunes/compare${params ? '?' + params : ''}`);
    }
  },
  sessions: {
    list: () => get('/api/sessions'),
    get: (id) => get(`/api/sessions/${id}`),
    getTelemetry: (id) => get(`/api/sessions/${id}/telemetry`),
    delete: (id) => del(`/api/sessions/${id}`),
    linkTrack: (id, body) => put(`/api/sessions/${id}/track`, body),
    batchLinkTrack: (body) => put('/api/sessions/batch/track', body)
  },
  analysis: {
    getOverview: (sessionId) => get(`/api/analysis/${sessionId}`),
    getDiagnosis: (sessionId) => get(`/api/analysis/${sessionId}/diagnosis`),
    getChannels: (sessionId, step = 4) => get(`/api/analysis/${sessionId}/telemetry-channels?downsampleStep=${step}`),
    getAdvanced: (sessionId, sectors = 10) => get(`/api/analysis/${sessionId}/advanced?sectors=${sectors}`),
    getTurns: (sessionId) => get(`/api/analysis/${sessionId}/turns`),
    getAiDiagnosis: (sessionId) => get(`/api/analysis/${sessionId}/ai-diagnosis`),
    generateAiDiagnosis: (sessionId, body) => post(`/api/analysis/${sessionId}/ai-diagnosis`, body)
  },
  leaderboard: {
    getOverview: () => get('/api/leaderboard'),
    getTrend: (trackId, vehicleOrdinal) => get(`/api/leaderboard/trend?trackId=${encodeURIComponent(trackId)}&vehicleOrdinal=${encodeURIComponent(vehicleOrdinal)}`)
  },
  tracks: {
    list: () => get('/api/tracks'),
    get: (id) => get(`/api/tracks/${id}`),
    create: (data) => post('/api/tracks', data),
    update: (id, data) => put(`/api/tracks/${id}`, data),
    delete: (id) => del(`/api/tracks/${id}`),
    getNavigation: (id) => get(`/api/tracks/${id}/navigation`),
    validate: (id) => get(`/api/tracks/${id}/validate`),
    rebuild: (id) => post(`/api/tracks/${id}/rebuild`),
    merge: (body) => post('/api/tracks/merge', body),
    importSessions: (body) => post('/api/tracks/import-sessions', body)
  },
  system: {
    getStatus: () => get('/api/status'),
    getCurrent: () => get('/api/current'),
    getDashscopeKey: () => get('/api/settings/dashscope-key'),
    setDashscopeKey: (body) => post('/api/settings/dashscope-key', body)
  }
};
