const fs = require('fs');
const path = '/Users/dylan/Desktop/fh5/forza-telemetry/server/src/track-builder.js';

const helpers = `
export function resampleCenterline(traj, interval = 2.0) {
  if (!traj || traj.length < 2) return traj;
  const resampled = [traj[0]];
  for (let i = 1; i < traj.length; i++) {
    let p1 = resampled[resampled.length - 1];
    let p2 = traj[i];
    let dx = p2.x - p1.x, dz = p2.z - p1.z;
    let dist = Math.sqrt(dx*dx + dz*dz);
    if (dist >= interval) resampled.push(p2);
  }
  return resampled;
}

export function smoothCenterline(centerline, iterations = 5) {
  if (!centerline || centerline.length < 3) return centerline;
  let pts = JSON.parse(JSON.stringify(centerline));
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i].x = (pts[i-1].x + pts[i].x + pts[i+1].x) / 3;
      pts[i].z = (pts[i-1].z + pts[i].z + pts[i+1].z) / 3;
    }
  }
  return pts;
}

export function generateNavigationData() { return {}; }
export function calculateTrackSimilarity() { return 1; }
export function generateSectors() { return []; }
export function recognizeTrack() { return null; }
export function validateTrackQuality() { return true; }
export function detectTurnsEnhanced(centerline) { return []; }
export function buildRouteBook() { return { turns: [], straights: [] }; }
`;

fs.appendFileSync(path, helpers);
console.log('Appended missing exports to track-builder.js');
