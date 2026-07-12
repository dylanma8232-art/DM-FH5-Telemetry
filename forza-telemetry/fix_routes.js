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
  loadSessionById: "import { loadSessionById } from '../storage/session-db.js';",
  detectTurnsEnhanced: "import { detectTurnsEnhanced, generateSectors, buildRouteBook, validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  generateSectors: "import { generateSectors, buildRouteBook, validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  buildRouteBook: "import { buildRouteBook, validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  validateTrackQuality: "import { validateTrackQuality, buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  buildTrackFromTrajectories: "import { buildTrackFromTrajectories, calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  calculateTurnAttributes: "import { calculateTurnAttributes, remapLockedTurns } from '../track-builder.js';",
  remapLockedTurns: "import { remapLockedTurns } from '../track-builder.js';",
  simplifyRDP: "import { simplifyRDP } from '../utils/rdp.js';",
  saveJSON: "import { saveJSON, loadJSON } from '../utils/helpers.js';",
  loadJSON: "import { saveJSON, loadJSON } from '../utils/helpers.js';",
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

  const destructureMatch = content.match(/const\s+\{([^}]+)\}\s*=\s*context;/);
  let vars = [];
  if (destructureMatch) {
    vars = destructureMatch[1].split(',').map(v => v.trim()).filter(v => v);
  }

  let importedModules = new Set();
  let stateManagerDestructure = [];

  vars.forEach(v => {
    if (v === 'DATA_DIR' || v === 'LEADERBOARD_CACHE_TTL' || v.startsWith('//')) return;
    if (v === 'calculateTrackLength') return;
    if (importsMap[v]) importedModules.add(importsMap[v]);
    else if (stateVars.includes(v) || v === 'stateManager' || v === 'leaderboardCache') stateManagerDestructure.push(v);
    else console.log('Unknown var', v, 'in file', file);
  });

  let topImports = `import { stateManager } from '../services/state-manager.js';\n` + Array.from(importedModules).join('\n') + `\n`;

  // Remove export default function
  content = content.replace(/export default function\s*\([a-zA-Z0-9_]+\)\s*\{/, topImports);
  
  // Replace const {...} = context;
  if (destructureMatch) {
    content = content.replace(destructureMatch[0], `
const DATA_DIR = stateManager.DATA_DIR;
const LEADERBOARD_CACHE_TTL = 30000;
// Proxy to stateManager to keep compatibility with getters
const context = new Proxy(stateManager, {
    get(target, prop) {
        if (typeof target[prop] === 'function') return target[prop].bind(target);
        return target[prop];
    }
});
const { ${stateManagerDestructure.join(', ')} } = context;
const calculateTrackLength = (pts) => {
  if (!pts || pts.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x;
    const dy = (pts[i].y || 0) - (pts[i-1].y || 0);
    const dz = pts[i].z - pts[i-1].z;
    len += Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  return Math.round(len);
};
`);
  }

  // Find last brace and replace it with proper export
  const lastBrace = content.lastIndexOf('}');
  if (file === 'record.js') {
    // For record.js, it returns an object.
    // So the last brace belongs to the function wrapper, but before that is `return { ... };`.
    // We replace `return {` with `export default {` and remove the very last brace.
    content = content.substring(0, lastBrace); // remove last brace
    content = content.replace(/return\s*\{(?=[^}]+\};\s*$)/, 'export default {');
  } else {
    // For others, it's just a router
    content = content.substring(0, lastBrace) + '\nexport default router;\n';
  }

  fs.writeFileSync(filePath, content);
  console.log('Processed', file);
});

