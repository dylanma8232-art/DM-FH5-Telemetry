const fs = require('fs');
const path = require('path');

const trackBuilderHelpers = new Set(['detectTurnsEnhanced', 'generateSectors', 'buildRouteBook', 'validateTrackQuality', 'buildTrackFromTrajectories', 'remapLockedTurns', 'calculateTurnAttributes', 'calculateTrackLength']);
const sessionDbHelpers = new Set(['saveTracksDatabase', 'readTrackDetail', 'writeTrackDetail', 'deleteTrackDetail', 'loadSession', 'loadSessionById']);
const helpers = new Set(['saveJSON']);
const rdpHelpers = new Set(['simplifyRDP']);

const routesDir = 'server/src/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('export default function')) return;

  // Extract destructuring line
  const destructureMatch = content.match(/const\s+\{([^}]+)\}\s*=\s*context;/);
  if (!destructureMatch) {
     console.log(`No destructure in ${file}`);
     return;
  }
  
  const vars = destructureMatch[1].split(',').map(v => {
     let trimmed = v.trim();
     if (trimmed.includes('=')) {
        trimmed = trimmed.split('=')[0].trim();
     }
     return trimmed;
  }).filter(v => v);
  
  let imports = {
    trackBuilder: [],
    sessionDb: [],
    helpers: [],
    rdp: [],
    stateManager: []
  };
  
  vars.forEach(v => {
    if (v === 'stateManager' || v === 'DATA_DIR' || v === 'LEADERBOARD_CACHE_TTL' || v.startsWith('//')) return;
    
    if (trackBuilderHelpers.has(v)) {
      imports.trackBuilder.push(v);
    } else if (sessionDbHelpers.has(v)) {
      imports.sessionDb.push(v);
    } else if (helpers.has(v)) {
      imports.helpers.push(v);
    } else if (rdpHelpers.has(v)) {
      imports.rdp.push(v);
    } else {
      imports.stateManager.push(v);
    }
  });

  let newImports = `import { stateManager } from '../services/state-manager.js';\n`;
  if (imports.trackBuilder.length) newImports += `import { ${imports.trackBuilder.join(', ')} } from '../track-builder.js';\n`;
  if (imports.sessionDb.length) newImports += `import { ${imports.sessionDb.join(', ')} } from '../storage/session-db.js';\n`;
  if (imports.helpers.length) newImports += `import { ${imports.helpers.join(', ')} } from '../utils/helpers.js';\n`;
  if (imports.rdp.length) newImports += `import { ${imports.rdp.join(', ')} } from '../utils/rdp.js';\n`;
  
  // Also we need to replace occurrences of these state vars with `stateManager.varName` OR just destructure them at the top of route callbacks!
  // BUT the easiest is to just put a getter proxy at the top of the file!
  
  let proxyVars = ``;
  imports.stateManager.forEach(v => {
     // For getters
     if (v.startsWith('get') && v !== 'getCurrentTuneId' && v !== 'getCurrentData' && v !== 'getTrackMode' && v !== 'getLastRecognitionResult' && v !== 'getRecognitionHistory' && v !== 'getPacketCount' && v !== 'getLeaderboardCache' && v !== 'getLeaderboardCacheTime') {
        // e.g. get tracks() is destructured as tracks
     }
  });

  // Actually, wait. It's much simpler:
  // Instead of passing context, we just export router.
  // And at the top of the file:
  let headerCode = `\n// --- Injected state getters ---\n`;
  imports.stateManager.forEach(v => {
     if (v === 'io') {
        headerCode += `const io = new Proxy({}, { get: (t, p) => stateManager.io[p] });\n`;
     }
  });
  
  let fileContent = content.replace(/export default function\s*\([^)]*\)\s*\{/, newImports);
  fileContent = fileContent.replace(destructureMatch[0], `
    const DATA_DIR = stateManager.DATA_DIR;
    const LEADERBOARD_CACHE_TTL = 30000;
    // Proxy state manager properties
    const context = new Proxy(stateManager, {
        get(target, prop) {
            if (typeof target[prop] === 'function') {
                return target[prop].bind(target);
            }
            return target[prop];
        }
    });
    const { ${imports.stateManager.join(', ')} } = context;
  `);
  
  const lastBrace = fileContent.lastIndexOf('}');
  fileContent = fileContent.substring(0, lastBrace) + '\nexport default router;\n';

  fs.writeFileSync(filePath, fileContent);
  console.log(`Refactored ${file}`);
});

