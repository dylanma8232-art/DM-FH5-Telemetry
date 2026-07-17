import { create } from 'zustand'
import { api } from '../services/api'

export const useTuneStore = create((set, get) => ({
  tunes: [],
  vehicles: {},
  tracks: [],
  activeTune: null,
  activeTuneLoading: false,
  tuneSessionStats: {},
  loading: false,

  setLoading: (loading) => set({ loading }),

  loadTunes: async () => {
    try {
      const data = await api.tunes.list()
      set({ tunes: Array.isArray(data) ? data : [] })
    } catch (e) {
      set({ tunes: [] })
    }
  },

  loadVehicles: async () => {
    try {
      const data = await api.vehicles.list()
      set({ vehicles: data || {} })
    } catch (e) {
      // 加载车辆失败
    }
  },

  loadTracks: async () => {
    try {
      const data = await api.tracks.list()
      set({ tracks: Array.isArray(data) ? data : Object.values(data || {}) })
    } catch (e) {
      // 加载赛道失败
    }
  },

  loadTuneSessionStats: async () => {
    try {
      const data = await api.sessions.list()
      const allSessions = Array.isArray(data) ? data : []
      const stats = {}
      allSessions.forEach(s => {
        if (!s.tuneId) return
        if (!stats[s.tuneId]) {
          stats[s.tuneId] = { count: 0, bestLap: Infinity, totalLaps: 0, sessions: [] }
        }
        const st = stats[s.tuneId]
        st.count++
        st.totalLaps += s.laps?.count || 0
        if (s.laps?.best > 0 && s.laps.best < st.bestLap) {
          st.bestLap = s.laps.best
        }
        st.sessions.push(s)
      })
      set({ tuneSessionStats: stats })
    } catch (e) {
      // 加载统计失败
    }
  },

  loadActiveTune: async () => {
    try {
      const data = await api.tunes.getActive()
      set({ activeTune: data.tune || null })
    } catch (e) {
      // 加载活跃调校失败
    }
  },

  setActiveTuneById: async (tuneId) => {
    set({ activeTuneLoading: true })
    try {
      await api.tunes.setActive({ tuneId })
      await get().loadActiveTune()
      alert('已设为当前活跃调校')
    } catch (e) {
      alert('设置活跃调校失败')
    } finally {
      set({ activeTuneLoading: false })
    }
  },

  clearActiveTune: async () => {
    try {
      await api.tunes.setActive({ tuneId: null })
      set({ activeTune: null })
    } catch (e) {
      // 取消活跃调校失败
    }
  }
}))
