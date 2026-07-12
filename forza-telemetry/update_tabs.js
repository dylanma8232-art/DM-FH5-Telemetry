const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client/src/components/pages/SessionHistoryPage.jsx');
let code = fs.readFileSync(filePath, 'utf8');

// Add imports for the new components
if (!code.includes('GearingAnalysisPanel')) {
  code = code.replace(
    "import { EmptyState } from '../shared/EmptyState';",
    "import { EmptyState } from '../shared/EmptyState';\nimport { GearingAnalysisPanel } from '../dashboard/GearingAnalysisPanel';\nimport { SuspensionAnalysisPanel } from '../dashboard/SuspensionAnalysisPanel';\nimport { DifferentialAnalysisPanel } from '../dashboard/DifferentialAnalysisPanel';"
  );
}

// Update `allSubTabs`
code = code.replace(
  /const allSubTabs = \['overview', 'dynamics', 'workbench', 'replay'\];/g,
  "const allSubTabs = ['overview', 'gearing', 'suspension', 'differential', 'replay'];"
);

// Update activeChart tab definitions
code = code.replace(
  /\{\s*id:\s*'overview',\s*label:\s*'总览'\s*\},[\s\S]*?\{\s*id:\s*'replay',\s*label:\s*'回放 & 教练'\s*\}/,
  `{ id: 'overview', label: '总览' },
                { id: 'gearing', label: '动力与传动' },
                { id: 'suspension', label: '底盘悬挂' },
                { id: 'differential', label: '差速抓地力' },
                { id: 'replay', label: '回放 & 教练' }`
);

// Remove the old dynamics and workbench rendering, replace with new
// Finding the block: {activeChart === 'dynamics' && channelsData && ( ... )}
// And replacing it. It's too big to regex. Let's find lines.
const lines = code.split('\n');

let inDynamics = false;
let dynamicsStart = -1;
let dynamicsEnd = -1;

let inWorkbench = false;
let workbenchStart = -1;
let workbenchEnd = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("{activeChart === 'dynamics' && channelsData && (")) {
    dynamicsStart = i;
  }
  // This is a naive way to find the end of a big JSX block, but dynamics ends where workbench begins
  if (lines[i].includes("{activeChart === 'workbench' && channelsData && (")) {
    if (dynamicsStart !== -1 && dynamicsEnd === -1) {
      dynamicsEnd = i - 1;
    }
    workbenchStart = i;
  }
  if (lines[i].includes("{activeChart === 'replay' && (")) {
    if (workbenchStart !== -1 && workbenchEnd === -1) {
      workbenchEnd = i - 1;
    }
  }
}

if (dynamicsStart !== -1 && dynamicsEnd !== -1 && workbenchStart !== -1 && workbenchEnd !== -1) {
  // Remove the old blocks and insert the new ones
  const newBlocks = `
            {activeChart === 'gearing' && analysis && (
              <GearingAnalysisPanel data={analysis['动力齿比']} />
            )}

            {activeChart === 'suspension' && analysis && (
              <SuspensionAnalysisPanel data={analysis['底盘悬挂']} />
            )}

            {activeChart === 'differential' && analysis && (
              <DifferentialAnalysisPanel data={analysis['差速抓地力']} />
            )}
`;
  
  lines.splice(dynamicsStart, workbenchEnd - dynamicsStart + 1, newBlocks);
  fs.writeFileSync(filePath, lines.join('\n'));
  console.log('Tabs updated successfully.');
} else {
  console.log('Failed to find JSX blocks. dynamicsStart:', dynamicsStart, 'workbenchStart:', workbenchStart);
}
