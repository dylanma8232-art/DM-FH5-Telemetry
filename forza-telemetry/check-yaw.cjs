const fs = require('fs');
const db = JSON.parse(fs.readFileSync(require('os').homedir() + '/Library/Application Support/forza-telemetry/server/data/tracks-database.json', 'utf8'));
// Try to find full tracks somewhere... wait, in tracks-database.json it only has metadata.
console.log("metadata keys:", Object.keys(db.tracks[0]));
