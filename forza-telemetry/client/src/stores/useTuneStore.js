import { create } from 'zustand'
import { api } from '../services/api'

export const useTuneStore = create((set, get) => ({
  tunes: [],
  vehicles: {},
  tracks: [],
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
      const [received, catalog] = await Promise.all([
        api.vehicles.list(),
        api.vehicles.getCatalog()
      ])
      // 调教中心必须可选择游戏完整车辆目录；已接收车辆的实时信息覆盖目录基础信息。
      const directory = Object.fromEntries((catalog || []).map(vehicle => [String(vehicle.ordinal), {
        name: vehicle.name,
        manufacturer: vehicle.manufacturer,
        basePi: vehicle.basePi,
        pi: vehicle.basePi,
        catalogOnly: true
      }]))
      set({ vehicles: { ...directory, ...(received || {}) } })
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

}))
