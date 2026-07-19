import { useState, useEffect } from 'react';

export function useDashboardData(socket) {
  const [trackData, setTrackData] = useState(null);
  const [vehiclesList, setVehiclesList] = useState({});

  useEffect(() => {
    Promise.all([
      fetch('/api/vehicles').then(res => res.json()),
      fetch('/api/vehicles/catalog').then(res => res.json())
    ])
      .then(([received, catalog]) => {
        const directory = Object.fromEntries((catalog || []).map(vehicle => [String(vehicle.ordinal), vehicle]));
        setVehiclesList({ ...directory, ...(received || {}) });
      })
      .catch(() => {});

    fetch('/api/trackMode/status')
      .then(res => res.json())
      .then(resData => {
        if (resData.active && resData.trackId) {
          fetch(`/api/tracks/${resData.trackId}`)
            .then(res2 => res2.json())
            .then(t => setTrackData(t))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleTrackModeChanged = (payload) => {
      if (payload.active && payload.trackId) {
        fetch(`/api/tracks/${payload.trackId}`)
          .then(res => res.json())
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
          fetch(`/api/tracks/${payload.trackId}`)
            .then(res => res.json())
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
