import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, '../src/config/vehicle-upgrades.json');
const outputDir = path.resolve(__dirname, '../src/config/upgrades');
const metadataPath = path.resolve(__dirname, '../src/config/upgrades-metadata.json');

if (!fs.existsSync(sourcePath)) {
  console.error('Source file not found:', sourcePath);
  process.exit(1);
}

console.log('Loading vehicle-upgrades.json...');
const data = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const profiles = data.profiles || {};

console.log('Creating sharded upgrades directory...');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const metadata = {
  schemaVersion: data.schemaVersion || 1,
  game: data.game || 'Forza Horizon 5',
  updatedAt: data.updatedAt || new Date().toISOString(),
  profiles: {}
};

let count = 0;
for (const [ordinal, profile] of Object.entries(profiles)) {
  // Extract lightweight metadata for fast listing
  metadata.profiles[ordinal] = {
    name: profile.name,
    basePi: profile.basePi,
    baseDriveType: profile.baseDriveType
  };

  // Write the complete profile to a single file
  const shardedPath = path.join(outputDir, `${ordinal}.json`);
  fs.writeFileSync(shardedPath, JSON.stringify(profile, null, 2) + '\n');
  count++;
}

// Write the lightweight metadata index file
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');

console.log(`Successfully sharded ${count} profiles.`);
console.log(`Metadata saved to: ${metadataPath}`);
console.log(`Shards saved in: ${outputDir}`);
