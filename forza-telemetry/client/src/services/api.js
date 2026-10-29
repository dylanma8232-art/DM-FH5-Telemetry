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

// A4：唯一的传输实现。以前 get/post/put/del 与 getResponse/postResponse/... 是两套平行写法，
// 现在统一走 request()，两种消费方式只是「是否解析 JSON」的开关，URL 与请求体构造只写一次。
const request = (method, url, body, { raw = false, bodyType = 'json' } = {}) => {
  // 请求形状与改造前逐字一致：无请求体的 GET 仍以 fetch(url) 形式发出（options 省略）
  let options;
  if (body !== undefined) {
    options = { method };
    if (bodyType === 'binary') {
      options.headers = { 'Content-Type': 'application/octet-stream' };
      options.body = body;
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
  } else if (method !== 'GET') {
    options = { method };
  }
  const pending = options ? fetch(url, options) : fetch(url);
  return raw ? pending : pending.then(handleResponse);
};

const get = (url) => request('GET', url);
const post = (url, body) => request('POST', url, body);
const put = (url, body) => request('PUT', url, body);
const del = (url) => request('DELETE', url);

// 保留原始 Response 的消费方式（页面需要自行判断 res.ok / res.blob() 时使用）
const getResponse = (url) => request('GET', url, undefined, { raw: true });
const postResponse = (url, body) => request('POST', url, body, { raw: true });
const putResponse = (url, body) => request('PUT', url, body, { raw: true });
const deleteResponse = (url) => request('DELETE', url, undefined, { raw: true });
const postBinaryResponse = (url, body) => request('POST', url, body, { raw: true, bodyType: 'binary' });

// 端点路径唯一来源：JSON 方法与 *Response 方法都从这里取路径，避免同一 URL 写两遍
const P = {
  vehicle: (id) => `/api/vehicles/${id}`,
  vehicleUpgrades: (id) => `/api/vehicles/${id}/upgrades`,
  tune: (id) => `/api/tunes/${id}`,
  session: (id) => `/api/sessions/${id}`,
  analysis: (sessionId) => `/api/analysis/${sessionId}`,
  tracks: '/api/tracks',
  track: (id) => `/api/tracks/${id}`,
  trackTurns: (id) => `/api/tracks/${id}/turns`,
  trackValidate: (id) => `/api/tracks/${id}/validate`,
  trackRebuild: (id) => `/api/tracks/${id}/rebuild`,
};

export const api = {
  vehicles: {
    list: () => get('/api/vehicles'),
    getCatalog: () => get('/api/vehicles/catalog'),
    save: (id, data) => post(P.vehicle(id), data),
    delete: (id) => del(P.vehicle(id)),
    getUpgrades: (id, query = {}) => {
      const params = new URLSearchParams(query).toString();
      return get(`${P.vehicleUpgrades(id)}${params ? '?' + params : ''}`);
    },
    autoSolve: (id, body) => post(`${P.vehicleUpgrades(id)}/solve`, body),
    // 大模型驱动改装：后端只允许模型在已解析的合法配件 ID 中选择，返回结果仍需本地 PI 校验
    aiSolve: (id, body) => post(`${P.vehicleUpgrades(id)}/ai-solve`, body),
    linkedTunes: (id) => get(`${P.vehicle(id)}/linked-tunes`),
    validateUpgrades: (id, body) => post(`${P.vehicleUpgrades(id)}/validate`, body),
  },
  tunes: {
    list: () => get('/api/tunes'),
    get: (id) => get(P.tune(id)),
    create: (data) => post('/api/tunes', data),
    update: (id, data) => put(P.tune(id), data),
    delete: (id) => del(P.tune(id)),
    aiDiagnose: (id, body) => post(`${P.tune(id)}/ai-diagnosis`, body),
    compare: (query = {}) => {
      const params = new URLSearchParams(query).toString();
      return get(`/api/tunes/compare${params ? '?' + params : ''}`);
    }
  },
  sessions: {
    list: () => get('/api/sessions'),
    get: (id) => get(P.session(id)),
    getTelemetry: (id) => get(`${P.session(id)}/telemetry`),
    // 只取回放所需的最小通道集（默认 positions），避免整包拉取未降采样的全量遥测
    getTelemetryCompact: (id, options = {}) => {
      const { fields = 'positions', maxPoints = null, positionFields = null } = options;
      const params = new URLSearchParams({ fields });
      if (maxPoints !== null) params.set('maxPoints', String(maxPoints));
      if (positionFields) params.set('positionFields', positionFields);
      return get(`${P.session(id)}/telemetry/compact?${params.toString()}`);
    },
    delete: (id) => del(P.session(id)),
    linkTrack: (id, body) => put(`${P.session(id)}/track`, body),
    batchLinkTrack: (body) => put('/api/sessions/batch/track', body)
  },
  analysis: {
    getOverview: (sessionId) => get(P.analysis(sessionId)),
    getDiagnosis: (sessionId) => get(`${P.analysis(sessionId)}/diagnosis`),
    getTuningRecommendations: (sessionId) => get(`${P.analysis(sessionId)}/tuning-recommendations`),
    getChannels: (sessionId, step = 4, startDist = null, endDist = null) => {
      let url = `${P.analysis(sessionId)}/telemetry-channels?downsampleStep=${step}`;
      if (startDist !== null && endDist !== null && !isNaN(startDist) && !isNaN(endDist)) {
        url += `&startDist=${startDist}&endDist=${endDist}`;
      }
      return get(url);
    },
    getAdvanced: (sessionId, sectors = 10, startDist = null, endDist = null) => {
      let url = `${P.analysis(sessionId)}/advanced?sectors=${sectors}`;
      if (startDist !== null && endDist !== null && !isNaN(startDist) && !isNaN(endDist)) {
        url += `&startDist=${startDist}&endDist=${endDist}`;
      }
      return get(url);
    },
    getTurns: (sessionId) => get(`${P.analysis(sessionId)}/turns`),
    getAiDiagnosis: (sessionId) => get(`${P.analysis(sessionId)}/ai-diagnosis`),
    generateAiDiagnosis: (sessionId, body) => post(`${P.analysis(sessionId)}/ai-diagnosis`, body)
  },
  leaderboard: {
    getOverview: () => get('/api/leaderboard'),
    getTrend: (trackId, vehicleOrdinal) => get(`/api/leaderboard/trend?trackId=${encodeURIComponent(trackId)}&vehicleOrdinal=${encodeURIComponent(vehicleOrdinal)}`)
  },
  tracks: {
    list: () => get(P.tracks),
    get: (id) => get(P.track(id)),
    create: (data) => post(P.tracks, data),
    update: (id, data) => put(P.track(id), data),
    delete: (id) => del(P.track(id)),
    getNavigation: (id) => get(`${P.track(id)}/navigation`),
    validate: (id) => get(P.trackValidate(id)),
    rebuild: (id) => post(P.trackRebuild(id)),
    merge: (body) => post(`${P.tracks}/merge`, body),
    importSessions: (body) => post(`${P.tracks}/import-sessions`, body),
    listResponse: () => getResponse(P.tracks),
    getResponse: (id) => getResponse(P.track(id)),
    getThumbnailResponse: (id) => getResponse(`${P.track(id)}/thumbnail`),
    deleteResponse: (id) => deleteResponse(P.track(id)),
    updateResponse: (id, body) => putResponse(P.track(id), body),
    validateResponse: (id) => getResponse(P.trackValidate(id)),
    rebuildResponse: (id) => postResponse(P.trackRebuild(id)),
    adoptCandidateResponse: (id) => postResponse(`${P.track(id)}/adopt-candidate`),
    updateTurnsResponse: (id, body) => putResponse(P.trackTurns(id), body),
    mergeTurnsResponse: (id, body) => postResponse(`${P.trackTurns(id)}/merge`, body),
    updateTurnBoundsResponse: (id, turnIndex, body) => putResponse(`${P.trackTurns(id)}/${turnIndex}/bounds`, body),
    // B14：单弯道建议速度的最小载荷契约（后端 PUT /:id/turns/:index/speedHint 早已存在）
    updateTurnSpeedHintResponse: (id, turnIndex, body) => putResponse(`${P.trackTurns(id)}/${turnIndex}/speedHint`, body),
    splitTurnResponse: (id, body) => postResponse(`${P.trackTurns(id)}/split`, body),
    mergeResponse: (body) => postResponse(`${P.tracks}/merge`, body)
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
