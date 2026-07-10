const fs = require('fs');
const tracks = JSON.parse(fs.readFileSync('/Users/wenchen.ma/Desktop/fh5/forza-telemetry/server/data/tracks.json', 'utf8'));

// Find "八球环道" track
let track = null;
for (const key in tracks) {
  if (tracks[key].name === '八球环道') {
    track = tracks[key];
    break;
  }
}

if (!track) {
  console.log("Track not found");
  process.exit();
}

console.log("Track:", track.name);
console.log("Has centerline?", !!track.centerline, "Length:", track.centerline ? track.centerline.length : 0);
console.log("Has points?", !!track.points, "Length:", track.points ? track.points.length : 0);
console.log("Turns count:", track.turns ? track.turns.length : 0);

if (track.turns && track.centerline) {
  const points = track.centerline;
  const turn = track.turns[0];
  console.log("Turn 0 startIdx:", turn.startIdx, "endIdx:", turn.endIdx);
  const centerOrigIdx = Math.floor((turn.startIdx + turn.endIdx) / 2);
  let centerPt = null;
  for (let i = 0; i < points.length; i++) {
    if (i >= centerOrigIdx) {
      centerPt = points[i];
      break;
    }
  }
  console.log("Center point coordinates:", centerPt.x, centerPt.z);
  console.log("Point at startIdx:", points[turn.startIdx].x, points[turn.startIdx].z);
  console.log("Point at endIdx:", points[turn.endIdx].x, points[turn.endIdx].z);
}
