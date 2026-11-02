import test from 'node:test';
import assert from 'node:assert/strict';

// 测试 TrackManagerPage 与 TrackMaps 的 cacheKey 生成逻辑与失效性
function computeTrackManagerCacheKey({
  track,
  selectedTrack,
  points,
  canvas,
  minX, maxX, minZ, maxZ,
  sc, ox, oz,
  isLoop,
  candidatePoints
}) {
  const turns = track.turns || [];
  const trackIdKey = track.id || selectedTrack || '';
  const trackVerKey = track.version || track.updatedAt || track.lastModified || '';
  const boundsKey = `${minX.toFixed(2)},${maxX.toFixed(2)},${minZ.toFixed(2)},${maxZ.toFixed(2)}|${sc.toFixed(4)},${ox.toFixed(2)},${oz.toFixed(2)}`;
  const midIdx = Math.floor(points.length / 2);
  const geomSig = `${points[0]?.x?.toFixed(1)},${points[0]?.z?.toFixed(1)}_${points[midIdx]?.x?.toFixed(1)},${points[midIdx]?.z?.toFixed(1)}_${points[points.length - 1]?.x?.toFixed(1)},${points[points.length - 1]?.z?.toFixed(1)}`;
  const candSig = candidatePoints ? `${candidatePoints.length}_${candidatePoints[0]?.x?.toFixed(1)},${candidatePoints[candidatePoints.length - 1]?.z?.toFixed(1)}` : 'none';
  const turnsKey = turns.map(t => `${t.startIdx}-${t.endIdx}`).join(',');
  return `${trackIdKey}|${trackVerKey}|${isLoop}|${points.length}|${canvas.width}x${canvas.height}|${boundsKey}|${geomSig}|${candSig}|${turnsKey}`;
}

function computeTrackMapsCacheKey({
  trackId,
  drawPositions,
  w, h,
  minX, maxX, minZ, maxZ,
  sc, ox, oz,
  hasActiveZoom,
  activePt,
  channelsData,
  pts
}) {
  const midIdx = Math.floor(drawPositions.length / 2);
  const geomSig = `${drawPositions[0]?.x?.toFixed(1)},${drawPositions[0]?.z?.toFixed(1)}_${drawPositions[midIdx]?.x?.toFixed(1)},${drawPositions[midIdx]?.z?.toFixed(1)}_${drawPositions[drawPositions.length - 1]?.x?.toFixed(1)},${drawPositions[drawPositions.length - 1]?.z?.toFixed(1)}`;
  const boundsKey = `${minX.toFixed(2)},${maxX.toFixed(2)},${minZ.toFixed(2)},${maxZ.toFixed(2)}|${sc.toFixed(4)},${ox.toFixed(2)},${oz.toFixed(2)}`;
  return `${trackId || ''}|${drawPositions.length}|${w}x${h}|${boundsKey}|${geomSig}|${hasActiveZoom ? `${activePt.x},${activePt.z}` : 'full'}|${channelsData?.channels?.length || 0}|${pts.length}`;
}

test('TrackManagerPage cacheKey: 两个点数相同但赛道ID/坐标不同的赛道产生不同的 cacheKey', () => {
  const canvas = { width: 800, height: 600 };
  const turns = [{ startIdx: 10, endIdx: 20 }];

  const trackA = { id: 'track-A', version: '1', turns };
  const pointsA = [
    { x: 0, z: 0 },
    { x: 50, z: 50 },
    { x: 100, z: 100 },
  ];

  const trackB = { id: 'track-B', version: '1', turns };
  const pointsB = [
    { x: 500, z: 500 },
    { x: 600, z: 550 },
    { x: 700, z: 600 },
  ];

  const keyA = computeTrackManagerCacheKey({
    track: trackA,
    selectedTrack: 'track-A',
    points: pointsA,
    canvas,
    minX: 0, maxX: 100, minZ: 0, maxZ: 100,
    sc: 7.2, ox: 40, oz: 40,
    isLoop: false,
    candidatePoints: null
  });

  const keyB = computeTrackManagerCacheKey({
    track: trackB,
    selectedTrack: 'track-B',
    points: pointsB,
    canvas,
    minX: 500, maxX: 700, minZ: 500, maxZ: 600,
    sc: 3.6, ox: 40, oz: 40,
    isLoop: false,
    candidatePoints: null
  });

  // 旧实现中仅仅根据 points.length 和 canvas.width/height，这两者会完全相同产生缓存误命中
  // 新实现必须产生不同的 cacheKey
  assert.notEqual(keyA, keyB, '两个不同赛道的 cacheKey 必须不同');
  assert.ok(keyA.includes('track-A'));
  assert.ok(keyB.includes('track-B'));
});

test('TrackMaps cacheKey: 两个点数相同但赛道ID或坐标不同的赛道产生不同的 cacheKey', () => {
  const drawPositionsA = [{ x: 0, z: 0 }, { x: 50, z: 50 }, { x: 100, z: 100 }];
  const drawPositionsB = [{ x: 200, z: 200 }, { x: 300, z: 300 }, { x: 400, z: 400 }];

  const keyA = computeTrackMapsCacheKey({
    trackId: 'track-1',
    drawPositions: drawPositionsA,
    w: 300, h: 300,
    minX: 0, maxX: 100, minZ: 0, maxZ: 100,
    sc: 2.2, ox: 40, oz: 40,
    hasActiveZoom: false,
    activePt: null,
    channelsData: null,
    pts: drawPositionsA
  });

  const keyB = computeTrackMapsCacheKey({
    trackId: 'track-2',
    drawPositions: drawPositionsB,
    w: 300, h: 300,
    minX: 200, maxX: 400, minZ: 200, maxZ: 400,
    sc: 1.1, ox: 40, oz: 40,
    hasActiveZoom: false,
    activePt: null,
    channelsData: null,
    pts: drawPositionsB
  });

  assert.notEqual(keyA, keyB, '切换赛道后 TrackMaps cacheKey 必须不同');
  assert.ok(keyA.includes('track-1'));
  assert.ok(keyB.includes('track-2'));
});
