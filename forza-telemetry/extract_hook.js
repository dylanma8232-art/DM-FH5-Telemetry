const fs = require('fs');

const pageFile = 'client/src/components/pages/TuneManagerPage.jsx';
const code = fs.readFileSync(pageFile, 'utf8');

const returnIndex = code.indexOf('  return (\n');
if (returnIndex === -1) {
  console.log('Could not find main return');
  process.exit(1);
}

const beforeReturn = code.substring(0, returnIndex);
const afterReturn = code.substring(returnIndex);

// Regex to find all top-level const declarations inside TuneManagerPage
const functionMatch = beforeReturn.match(/export function TuneManagerPage\(\{ onNavigate \}\) \{([\s\S]+)/);
if (!functionMatch) {
  console.log('Could not find function body');
  process.exit(1);
}

const hookBody = functionMatch[1];
const hookLines = hookBody.split('\n');

const exportsSet = new Set();
// Simple regex to find const [name, setName] and const funcName =
hookLines.forEach(line => {
  const stateMatch = line.match(/^\s*const\s+\[([a-zA-Z0-9_]+),\s*([a-zA-Z0-9_]+)\]\s*=/);
  if (stateMatch) {
    exportsSet.add(stateMatch[1]);
    exportsSet.add(stateMatch[2]);
  }
  
  const funcMatch = line.match(/^\s*const\s+([a-zA-Z0-9_]+)\s*=\s*(async\s*)?\(/);
  if (funcMatch) {
    exportsSet.add(funcMatch[1]);
  }

  const memoMatch = line.match(/^\s*const\s+([a-zA-Z0-9_]+)\s*=\s*useMemo/);
  if (memoMatch) {
    exportsSet.add(memoMatch[1]);
  }

  const varMatch = line.match(/^\s*const\s+([a-zA-Z0-9_]+)\s*=\s*(useRef|useCallback|useState|useMemo)\(/);
  if (varMatch) {
    exportsSet.add(varMatch[1]);
  }
  
  // Custom simple consts
  const simpleConst = line.match(/^\s*const\s+([a-zA-Z0-9_]+)\s*=\s*[^=]/);
  if (simpleConst && !line.includes('require(')) {
    // some might be complex, so we check carefully. Let's just manually collect if there are a few.
  }
});

// also extract refs
hookLines.forEach(line => {
  const refMatch = line.match(/^\s*const\s+([a-zA-Z0-9_]+)\s*=\s*useRef\(/);
  if (refMatch) exportsSet.add(refMatch[1]);
});

// also manual adds that might not match above
['TUNE_DEFAULT_KEY_MAP', 'partsPiDelta', 'totalPi', 'currentVehicleStats', 'importFileRef', 'dirtyParamsRef', 'activeTune', 'activeTuneLoading', 'tuneSessionStats', 'telemetryPanelOpen', 'diagnosing', 'diagnosisResult', 'drivingProblemsOpen', 'selectedProblem', 'basePi', 'targetPi', 'autoUpgradeLoading', 'expandedTune', 'searchQuery', 'vehicleFilter', 'tagFilter', 'compareMode', 'compareSelected', 'compareResult', 'compareLoading', 'compareTrackId', 'shareCodeModal', 'importPreview', 'collapsedSections', 'availableSessions', 'selectedSessionId'].forEach(v => exportsSet.add(v));

const exportsList = Array.from(exportsSet).filter(v => v);

const hookCode = beforeReturn.substring(0, beforeReturn.indexOf('export function TuneManagerPage')) + 
`export function useTuneManager({ onNavigate }) {` + 
hookBody + 
`  return {
    ${exportsList.join(',\n    ')}
  };
}
`;

fs.writeFileSync('client/src/hooks/useTuneManager.js', hookCode);

console.log('Hook extracted to client/src/hooks/useTuneManager.js');

// Now create the new TuneManagerPage.jsx
const headerCode = `import React from 'react'
import { EmptyState } from '../shared/EmptyState'
import {
  PART_CATEGORIES,
  TIER_LABELS,
} from '../../data/parts'
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../data/tunePresets'
import { useTuneManager } from '../../hooks/useTuneManager'

export function TuneManagerPage({ onNavigate }) {
  const {
    ${exportsList.join(',\n    ')}
  } = useTuneManager({ onNavigate });
`;

fs.writeFileSync('client/src/components/pages/TuneManagerPage.jsx.new', headerCode + afterReturn);
console.log('New component written to client/src/components/pages/TuneManagerPage.jsx.new');
