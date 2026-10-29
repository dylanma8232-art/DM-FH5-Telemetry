const handleResponse = async (res) => {
  if (!res.ok) {
    let errorMsg = '请求失败';
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
      if (Array.isArray(data.errors) && data.errors.length) errorMsg += `：${data.errors.join('；')}`;
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

// 一些既有页面需要根据 res.ok 分支处理响应，保留原始 Response 以便迁移到
// 唯一 API 入口时不改变这些页面的错误时序与提示逻辑。
const getResponse = (url) => fetch(url);
const postResponse = (url, body) => body === undefined
  ? fetch(url, { method: 'POST' })
  : fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
const putResponse = (url, body) => fetch(url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
const deleteResponse = (url) => fetch(url, { method: 'DELETE' });
const postBinaryResponse = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body
});

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
    autoSolve: (id, body) => post(`/api/vehicles/${id}/upgrades/solve`, body),
    // 大模型驱动改装：后端只允许模型在已解析的合法配件 ID 中选择，返回结果仍需本地 PI 校验
    aiSolve: (id, body) => post(`/api/vehicles/${id}/upgrades/ai-solve`, body),
    validateUpgrades: (id, body) => post(`/api/vehicles/${id}/upgrades/validate`, body),
  },
  tunes: {
    list: () => get('/api/tunes'),
    get: (id) => get(`/api/tunes/${id}`),
    create: (data) => post('/api/tunes', data),
    update: (id, data) => put(`/api/tunes/${id}`, data),
    delete: (id) => del(`/api/tunes/${id}`),
    aiDiagnose: (id, body) => post(`/api/tunes/${id}/ai-diagnosis`, body),
    compare: (query = {}) => {
      const params = new URLSearchParams(query).toString();
      return get(`/api/tunes/compare${params ? '?' + params : ''}`);
    }
  },
  sessions: {
    list: () => get('/api/sessions'),
    get: (id) => get(`/api/sessions/${id}`),
    getTelemetry: (id) => get(`/api/sessions/${id}/telemetry`),
    // 只取回放所需的最小通道集（默认 positions），避免整包拉取未降采样的全量遥测
    getTelemetryCompact: (id, options = {}) => {
      const { fields = 'positions', maxPoints = null, positionFields = null } = options;
      const params = new URLSearchParams({ fields });
      if (maxPoints !== null) params.set('maxPoints', String(maxPoints));
      if (positionFields) params.set('positionFields', positionFields);
      return get(`/api/sessions/${id}/telemetry/compact?${params.toString()}`);
    },
    delete: (id) => del(`/api/sessions/${id}`),
    linkTrack: (id, body) => put(`/api/sessions/${id}/track`, body),
    batchLinkTrack: (body) => put('/api/sessions/batch/track', body)
  },
  analysis: {
    getOverview: (sessionId) => get(`/api/analysis/${sessionId}`),
    getDiagnosis: (sessionId) => get(`/api/analysis/${sessionId}/diagnosis`),
    getTuningRecommendations: (sessionId) => get(`/api/analysis/${sessionId}/tuning-recommendations`),
    getChannels: (sessionId, step = 4, startDist = null, endDist = null) => {
      let url = `/api/analysis/${sessionId}/telemetry-channels?downsampleStep=${step}`;
      if (startDist !== null && endDist !== null && !isNaN(startDist) && !isNaN(endDist)) {
        url += `&startDist=${startDist}&endDist=${endDist}`;
      }
      return get(url);
    },
    getAdvanced: (sessionId, sectors = 10, startDist = null, endDist = null) => {
      let url = `/api/analysis/${sessionId}/advanced?sectors=${sectors}`;
      if (startDist !== null && endDist !== null && !isNaN(startDist) && !isNaN(endDist)) {
        url += `&startDist=${startDist}&endDist=${endDist}`;
      }
      return get(url);
    },
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
    importSessions: (body) => post('/api/tracks/import-sessions', body),
    listResponse: () => getResponse('/api/tracks'),
    getResponse: (id) => getResponse(`/api/tracks/${id}`),
    getThumbnailResponse: (id) => getResponse(`/api/tracks/${id}/thumbnail`),
    deleteResponse: (id) => deleteResponse(`/api/tracks/${id}`),
    updateResponse: (id, body) => putResponse(`/api/tracks/${id}`, body),
    validateResponse: (id) => getResponse(`/api/tracks/${id}/validate`),
    rebuildResponse: (id) => postResponse(`/api/tracks/${id}/rebuild`),
    adoptCandidateResponse: (id) => postResponse(`/api/tracks/${id}/adopt-candidate`),
    updateTurnsResponse: (id, body) => putResponse(`/api/tracks/${id}/turns`, body),
    mergeTurnsResponse: (id, body) => postResponse(`/api/tracks/${id}/turns/merge`, body),
    updateTurnBoundsResponse: (id, turnIndex, body) => putResponse(`/api/tracks/${id}/turns/${turnIndex}/bounds`, body),
    // B14：单弯道建议速度的最小载荷契约（后端 PUT /:id/turns/:index/speedHint 早已存在）
    updateTurnSpeedHintResponse: (id, turnIndex, body) => putResponse(`/api/tracks/${id}/turns/${turnIndex}/speedHint`, body),
    splitTurnResponse: (id, body) => postResponse(`/api/tracks/${id}/turns/split`, body),
    mergeResponse: (body) => postResponse('/api/tracks/merge', body)
  },
  trackMode: {
    getStatus: () => get('/api/trackMode/status'),
    startResponse: (body) => postResponse('/api/trackMode/start', body),
    stopResponse: () => postResponse('/api/trackMode/stop')
  },
  record: {
    startResponse: () => postResponse('/api/record/start'),
    stopResponse: () => postResponse('/api/record/stop'),
    saveResponse: (body) => postResponse('/api/record/save', body)
  },
  backup: {
    restoreResponse: (buffer) => postBinaryResponse('/api/backup/restore', buffer)
  },
  exports: {
    downloadResponse: (format, sessionId) => getResponse(`/api/export/${format}/${sessionId}`)
  },
  system: {
    getStatus: () => get('/api/status'),
    getCurrent: () => get('/api/current'),
    getDashscopeKey: () => get('/api/system/settings/dashscope-key'),
    setDashscopeKey: (body) => post('/api/system/settings/dashscope-key', body)
  }
};
