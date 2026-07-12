const fs = require('fs');

const pageFile = 'client/src/components/pages/SessionHistoryPage.jsx';
const code = fs.readFileSync(pageFile, 'utf8');

const returnIndex = code.indexOf('  return (\n');
if (returnIndex === -1) {
  console.log('Could not find main return');
  process.exit(1);
}

const beforeReturn = code.substring(0, returnIndex);
const afterReturn = code.substring(returnIndex);

// Regex to find all top-level const declarations inside SessionHistoryPage
const functionMatch = beforeReturn.match(/export function SessionHistoryPage\(\{ onNavigate, navIntent \}\) \{([\s\S]+)/);
if (!functionMatch) {
  console.log('Could not find function body');
  process.exit(1);
}

const hookBody = functionMatch[1];
const hookLines = hookBody.split('\n');

const exportsSet = new Set();
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
});

// also extract refs
hookLines.forEach(line => {
  const refMatch = line.match(/^\s*const\s+([a-zA-Z0-9_]+)\s*=\s*useRef\(/);
  if (refMatch) exportsSet.add(refMatch[1]);
});

// also manual adds that might not match above
['tracks', 'vehicles', 'sessions', 'activeTab', 'selectedSessionId', 'editingSession', 'detailData', 'loadingDetail', 'expandedRow', 'expandedSections', 'importFileRef', 'shareCodeModal', 'filteredSessions', 'handleRowClick', 'fetchDetail', 'exportFile', 'formatDuration', 'formatDate', 'getDrivetrainLabel', 'getCarClassLabel'].forEach(v => exportsSet.add(v));

// some vars may be missing if they are block scoped, but these are top level.
// we must make sure all top-level let/const are exported.

const topLevelVars = hookBody.match(/^\s*(const|let)\s+([a-zA-Z0-9_]+)\s*=/gm) || [];
topLevelVars.forEach(v => {
   const match = v.match(/(const|let)\s+([a-zA-Z0-9_]+)\s*=/);
   if (match) exportsSet.add(match[2]);
});

const exportsList = Array.from(exportsSet).filter(v => v);

const hookCode = beforeReturn.substring(0, beforeReturn.indexOf('export function SessionHistoryPage')) + 
`export function useSessionHistory({ onNavigate, navIntent }) {` + 
hookBody + 
`  return {
    ${exportsList.join(',\n    ')}
  };
}
`;

fs.writeFileSync('client/src/hooks/useSessionHistory.js', hookCode);

console.log('Hook extracted to client/src/hooks/useSessionHistory.js');

// Now create the new SessionHistoryPage.jsx
const headerCode = `import React, { Suspense, lazy } from 'react'
import { EmptyState } from '../shared/EmptyState'
import { useSessionHistory } from '../../hooks/useSessionHistory'

export function SessionHistoryPage({ onNavigate, navIntent }) {
  const {
    ${exportsList.join(',\n    ')}
  } = useSessionHistory({ onNavigate, navIntent });
`;

fs.writeFileSync('client/src/components/pages/SessionHistoryPage.jsx.new', headerCode + afterReturn);
console.log('New component written to client/src/components/pages/SessionHistoryPage.jsx.new');
