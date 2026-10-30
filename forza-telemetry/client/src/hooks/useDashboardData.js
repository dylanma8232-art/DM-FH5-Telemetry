import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { toast } from '../components/shared/Toast';

export function useDashboardData(socket) {
  const [trackData, setTrackData] = useState(null);
  const [vehiclesList, setVehiclesList] = useState({});

  useEffect(() => {
    Promise.all([
      api.vehicles.list(),
      api.vehicles.getCatalog()
    ])
      .then(([received, catalog]) => {
        const directory = Object.fromEntries((catalog || []).map(vehicle => [String(vehicle.ordinal), vehicle]));
        setVehiclesList({ ...directory, ...(received || {}) });
      })
      .catch((err) => {
        // 静默失败会让车辆卡永久停在「待机」/编号态，这里显式提示一次（仅首屏加载）
        console.error('[仪表盘] 车辆数据加载失败:', err);
        toast('车辆数据加载失败，车辆名称可能显示为编号', 'warning', 6000);
      });

    api.trackMode.getStatus()
      .then(resData => {
        if (resData.active && resData.trackId) {
          api.tracks.get(resData.trackId)
            .then(t => setTrackData(t))
            .catch((err) => {
              console.error('[仪表盘] 赛道详情加载失败:', err);
              toast('赛道详情加载失败，路书看板暂不可用', 'warning', 6000);
            });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleTrackModeChanged = (payload) => {
      if (payload.active && payload.trackId) {
        api.tracks.get(payload.trackId)
          .then(t => setTrackData(t))
          .catch(() => {});
      } else {
        setTrackData(null);
      }
    };
    socket.on('trackModeChanged', handleTrackModeChanged);
    return () => socket.off('trackModeChanged', handleTrackModeChanged);
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const onTrackUpdated = async (payload) => {
      setTrackData(prev => {
        if (prev && prev.id === payload.trackId) {
          api.tracks.get(payload.trackId)
            .then(t => setTrackData(t))
            .catch(console.error);
          return { ...prev, name: payload.name };
        }
        return prev;
      });
    };
    socket.on('trackUpdated', onTrackUpdated);
    return () => socket.off('trackUpdated', onTrackUpdated);
  }, [socket]);

  return { trackData, setTrackData, vehiclesList };
}
