const fs = require('fs');
const file = 'client/src/components/pages/SessionHistoryPage.jsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Remove the tab buttons navigation block
const tabNavStart = code.indexOf('{/* 详情内容区域 */}');
const tabNavEnd = code.indexOf("{activeChart === 'overview' && (");

if (tabNavStart !== -1 && tabNavEnd !== -1) {
  const tabsBlock = code.substring(tabNavStart, tabNavEnd);
  
  // Replace the buttons with a simple anchor navigation menu or nothing (just let it be a dashboard).
  // Actually, let's create an anchor nav.
  const newNav = `
            {/* 详情内容区域 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid #30363d', paddingBottom: 12 }}>
              {allSubTabs.map(tabId => {
                const labels = {
                  overview: '概览',
                  dynamics: '动力学',
                  workbench: '驾驶分析',
                  gearing: '动力齿比',
                  suspension: '底盘悬挂',
                  differential: '差速抓地力',
                  replay: '回放 & AI教练'
                };
                return (
                  <button
                    key={tabId}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById('section-' + tabId);
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{
                      padding: '4px 12px',
                      background: 'transparent',
                      color: '#58a6ff',
                      border: '1px solid #30363d',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    {labels[tabId]}
                  </button>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
`;
  code = code.replace(tabsBlock, newNav);
}

// 2. Replace activeChart wrappers
code = code.replace(/\{activeChart === 'overview' && \(\s*<>\s*/, '<div id="section-overview">');
code = code.replace(/\s*<\/>\s*\)\}/, '\n</div>'); // This only matches the first one for overview.

// Let's use more targeted replacements for the ends.
// For dynamics:
code = code.replace(/\{activeChart === 'dynamics' && channelsData && \(\s*<div>/, '<div id="section-dynamics">{channelsData && <div>');
// The end of dynamics: it's right before `{activeChart === 'workbench'`
const dynEndIdx = code.indexOf("{activeChart === 'workbench'");
const dynBlockEnd = code.lastIndexOf("</div>\n            )}", dynEndIdx);
if (dynBlockEnd !== -1) {
  code = code.substring(0, dynBlockEnd) + "</div>\n            </div>" + code.substring(dynBlockEnd + 18);
}

// For workbench:
code = code.replace(/\{activeChart === 'workbench' && channelsData && \(\s*<div>/, '<div id="section-workbench">{channelsData && <div>');
const wbEndIdx = code.indexOf("{activeChart === 'gearing'");
const wbBlockEnd = code.lastIndexOf("</div>\n            )}", wbEndIdx);
if (wbBlockEnd !== -1) {
  code = code.substring(0, wbBlockEnd) + "</div>\n            </div>" + code.substring(wbBlockEnd + 18);
}

// For gearing:
code = code.replace(/\{activeChart === 'gearing' && analysis && \(\s*(<GearingAnalysisPanel[^>]*\/>)\s*\)\}/, '<div id="section-gearing">{analysis && $1}</div>');

// For suspension:
code = code.replace(/\{activeChart === 'suspension' && analysis && \(\s*(<SuspensionAnalysisPanel[^>]*\/>)\s*\)\}/, '<div id="section-suspension">{analysis && $1}</div>');

// For differential:
code = code.replace(/\{activeChart === 'differential' && analysis && \(\s*(<DifferentialAnalysisPanel[^>]*\/>)\s*\)\}/, '<div id="section-differential">{analysis && $1}</div>');

// For replay:
code = code.replace(/\{activeChart === 'replay' && \(\s*<div>/, '<div id="section-replay"><div>');
const replayEndIdx = code.indexOf("</div>\n          </div>\n        )}"); // end of detail block
const replayBlockEnd = code.lastIndexOf("</div>\n            )}", replayEndIdx);
if (replayBlockEnd !== -1) {
  code = code.substring(0, replayBlockEnd) + "</div>\n            </div>" + code.substring(replayBlockEnd + 18);
}

// Close the gap flex container
const endOfDetail = code.indexOf("</div>\n          </div>\n        )}");
if (endOfDetail !== -1) {
  code = code.substring(0, endOfDetail) + "\n            </div>\n" + code.substring(endOfDetail);
}

fs.writeFileSync(file + '.new', code);
console.log('Done refactoring tabs');
