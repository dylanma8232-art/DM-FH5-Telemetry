const fs = require('fs');
// ESM 兼容：用动态 import 引入 ES module
async function test() {
  const { buildTrackFromTrajectories } = await import('../server/src/track-builder.js');
  const trackData = JSON.parse(fs.readFileSync('../data/tracks/track_1783173160187.json', 'utf8'));
  const trajs = trackData.trajectories;

  console.log('Original trajs:', trajs[0].length, trajs[1].length);

  const result = buildTrackFromTrajectories(trajs);
  if (result) {
    console.log('Merged centerline length:', result.centerline.length);
  } else {
    console.log('Merge failed');
  }
}
test().catch(console.error);
