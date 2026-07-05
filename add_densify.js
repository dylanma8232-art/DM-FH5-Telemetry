const fs = require('fs');
const path = '/Users/dylan/Desktop/fh5/forza-telemetry/server/src/track-builder.js';
let content = fs.readFileSync(path, 'utf8');

const densifyCode = `function densifyTrajectory(traj, maxDist = 2.0) {
  if (!traj || traj.length < 2) return traj;
  let dense = [traj[0]];
  for (let i = 1; i < traj.length; i++) {
    let p1 = traj[i-1], p2 = traj[i];
    let dx = p2.x - p1.x, dy = (p2.y||0) - (p1.y||0), dz = p2.z - p1.z;
    let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist > maxDist) {
      let steps = Math.ceil(dist / maxDist);
      for (let j = 1; j < steps; j++) {
        let ratio = j / steps;
        dense.push({
          ...p1,
          x: p1.x + dx * ratio,
          y: (p1.y||0) + dy * ratio,
          z: p1.z + dz * ratio,
          yaw: (p1.yaw||0) + ((p2.yaw||0) - (p1.yaw||0)) * ratio,
          speed: (p1.speed||0) + ((p2.speed||0) - (p1.speed||0)) * ratio,
          drivingLine: (p1.drivingLine||0) + ((p2.drivingLine||0) - (p1.drivingLine||0)) * ratio
        });
      }
    }
    dense.push(p2);
  }
  return dense;
}

`;

content = content.replace('function correctTrajectoryDrivingLine', densifyCode + 'function correctTrajectoryDrivingLine');
fs.writeFileSync(path, content);
console.log("Added densifyTrajectory");
