const fs = require('fs');
const path = require('path');

const sessionsRoutePath = path.join(__dirname, 'server/src/routes/sessions.js');
let code = fs.readFileSync(sessionsRoutePath, 'utf8');

const leaderboardCode = `  // 获取全赛道最佳圈速与历史排名
  router.get('/api/sessions/leaderboards', (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
      
      const leaderboards = {};
      
      files.forEach(file => {
        try {
          const summary = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
          if (summary.bestLap > 0 && summary.trackId) {
            if (!leaderboards[summary.trackId]) {
              leaderboards[summary.trackId] = [];
            }
            leaderboards[summary.trackId].push({
              sessionId: summary.id,
              carOrdinal: summary.car?.ordinal || 0,
              carClass: summary.car?.class || 0,
              carPI: summary.car?.performanceIndex || 0,
              bestLap: summary.bestLap,
              timestamp: summary.timestamp
            });
          }
        } catch(e) {}
      });
      
      // Sort each track's leaderboard by bestLap ascending
      Object.keys(leaderboards).forEach(trackId => {
        leaderboards[trackId].sort((a, b) => a.bestLap - b.bestLap);
      });
      
      res.json(leaderboards);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch leaderboards' });
    }
  });

`;

if (!code.includes('/api/sessions/leaderboards')) {
  // Insert right after the base /api/sessions route
  code = code.replace(
    /router\.get\('\/api\/sessions',\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*?\}\);\n/,
    match => match + '\n' + leaderboardCode
  );
  fs.writeFileSync(sessionsRoutePath, code);
  console.log('Leaderboard route added.');
} else {
  console.log('Leaderboard route already exists.');
}
