const fs = require('fs');
const path = require('path');

const routesDir = 'server/src/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

const importsMap = {
  saveTracksDatabase: "import { saveTracksDatabase, readTrackDetail, writeTrackDetail, deleteTrackDetail, loadSession } from '../storage/session-db.js';",
  readTrackDetail: "import { readTrackDetail, writeTrackDetail, deleteTrackDetail, loadSession } from '../storage/session-db.js';",
  writeTrackDetail: "import { writeTrackDetail, deleteTrackDetail, loadSession } from '../storage/session-db.js';",
  deleteTrackDetail: "import { deleteTrackDetail, loadSession } from '../storage/session-db.js';",
  loadSession: "import { loadSession } from '../storage/session-db.js';",
  detectTurnsEnhanced: "import { detectTurnsEnhanced, generateSectors, buildRouteBook, validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  generateSectors: "import { generateSectors, buildRouteBook, validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  buildRouteBook: "import { buildRouteBook, validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  validateTrackQuality: "import { validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  buildTrackFromTrajectories: "import { buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  calculateTurnAttributes: "import { calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  remapLockedTurns: "import { remapLockedTurns } from '../track-builder.js';",
  simplifyRDP: "import { simplifyRDP } from '../utils/rdp.js';",
  saveJSON: "import { saveJSON } from '../utils/helpers.js';",
  DATA_DIR: "import { DATA_DIR } from '../config/constants.js';", // Or wherever DATA_DIR comes from... wait index.js defines it locally. Actually, let's export it from config/constants.js if it exists. We'll check.
};

const stateVars = [
  'tracks', 'vehicles', 'tunes', 'currentTuneId', 'getCurrentTuneId', 'setCurrentTuneId',
  'io', 'getCurrentData', 'getTrackMode', 'setTrackMode', 'getLastRecognitionResult',
  'setLastRecognitionResult', 'getRecognitionHistory', 'pushToRecognitionHistory',
  'getPacketCount', 'setPacketCount', 'getLeaderboardCache', 'setLeaderboardCache',
  'getLeaderboardCacheTime', 'onRestore'
];

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('export default function')) return;

  // We need to parse: export default function(context) { ... }
  // and remove it.
  
  // Actually, we can just replace the function wrap with plain exports.
  content = content.replace(/export default function\s*\([a-zA-Z0-9_]+\)\s*\{/g, '');
  
  // Find the last closing brace and remove it
  const lastBraceIdx = content.lastIndexOf('}');
  if (lastBraceIdx !== -1) {
    content = content.substring(0, lastBraceIdx) + '\nexport default router;\n';
  }

  // Replace const { ... } = context; with stateManager destructuring
  content = content.replace(/const\s+\{([^}]+)\}\s*=\s*[a-zA-Z0-9_]+;/g, (match, inner) => {
    const vars = inner.split(',').map(v => v.trim()).filter(v => v);
    let stateDestructure = [];
    let standardImports = new Set();
    
    vars.forEach(v => {
      if (stateVars.includes(v)) {
        stateDestructure.push(v);
      } else if (importsMap[v]) {
        standardImports.add(importsMap[v]);
      } else if (v === 'stateManager') {
        // do nothing
      } else if (v === 'calculateTrackLength') {
        // inline it
        content += `\nconst calculateTrackLength = (pts) => {
  if (!pts || pts.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x;
    const dy = (pts[i].y || 0) - (pts[i-1].y || 0);
    const dz = pts[i].z - pts[i-1].z;
    len += Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  return Math.round(len);
};\n`;
      } else {
        console.log(`Unknown variable in context destructuring in ${file}: ${v}`);
      }
    });

    let replacement = `import { stateManager } from '../services/state-manager.js';\n`;
    replacement += Array.from(standardImports).join('\n') + '\n';
    if (stateDestructure.length > 0) {
      // Actually we will just do `const { ... } = stateManager;` but we need to ensure stateManager exports them.
      // Wait, let's just make stateManager an object that has them all.
      // However, getters like `get tracks()` might be needed if they change.
      replacement += `const { ${stateDestructure.join(', ')} } = stateManager;\n`;
    }
    return replacement;
  });

  fs.writeFileSync(filePath, content);
  console.log(`Refactored ${file}`);
});
