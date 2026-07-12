const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client/src/components/pages/SessionHistoryPage.jsx');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add imports
const importString = "import { EmptyState } from '../shared/EmptyState';\nimport { GearingAnalysisPanel } from '../dashboard/GearingAnalysisPanel';\nimport { SuspensionAnalysisPanel } from '../dashboard/SuspensionAnalysisPanel';\nimport { DifferentialAnalysisPanel } from '../dashboard/DifferentialAnalysisPanel';";
code = code.replace("import { EmptyState } from '../shared/EmptyState';", importString);

// 2. Update allSubTabs
code = code.replace(
  "const allSubTabs = ['overview', 'dynamics', 'workbench', 'replay'];",
  "const allSubTabs = ['overview', 'dynamics', 'workbench', 'gearing', 'suspension', 'differential', 'replay'];"
);

// 3. Update tabs UI (find { id: 'replay', label: '回放 & 教练' } and prepend new tabs)
code = code.replace(
  "{ id: 'replay', label: '回放 & 教练' }",
  `{ id: 'gearing', label: '动力与传动' },
                { id: 'suspension', label: '底盘悬挂' },
                { id: 'differential', label: '差速器诊断' },
                { id: 'replay', label: '回放 & 教练' }`
);

// 4. Insert new panels before {activeChart === 'replay'
const newPanelsJSX = `
            {activeChart === 'gearing' && analysis && (
              <GearingAnalysisPanel data={analysis['动力齿比']} />
            )}

            {activeChart === 'suspension' && analysis && (
              <SuspensionAnalysisPanel data={analysis['底盘悬挂']} />
            )}

            {activeChart === 'differential' && analysis && (
              <DifferentialAnalysisPanel data={analysis['差速抓地力']} />
            )}

            {activeChart === 'replay'`;
            
code = code.replace("{activeChart === 'replay'", newPanelsJSX);

fs.writeFileSync(filePath, code);
console.log('Fixed SessionHistoryPage.jsx successfully!');
