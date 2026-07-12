const fs = require('fs');
const file = 'client/src/components/pages/SessionHistoryPage.jsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Standardize font size
code = code.replace(/tick=\{\{\s*fontSize:\s*\d+,\s*fill:\s*'#8b949e'\s*\}\}/g, "tick={{ fontSize: 10, fill: '#8b949e' }}");
code = code.replace(/tick=\{\{\s*fontSize:\s*\d+\s*\}\}/g, "tick={{ fontSize: 10 }}");
code = code.replace(/contentStyle=\{\{([\s\S]*?)fontSize:\s*\d+([\s\S]*?)\}\}/g, "contentStyle={{$1fontSize: 10$2}}");

// 2. Refactor tabs
const tabNavStartStr = "{/* 详情内容区域 */}";
const tabNavStart = code.indexOf(tabNavStartStr);
const tabNavEnd = code.indexOf("{activeChart === 'overview' && (");

if (tabNavStart !== -1 && tabNavEnd !== -1) {
  const tabsBlock = code.substring(tabNavStart, tabNavEnd);
  const newNav = `
            {/* 详情内容区域 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid #30363d', paddingBottom: 12, position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
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
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    style={{
                      padding: '6px 14px',
                      background: 'transparent',
                      color: '#58a6ff',
                      border: '1px solid #30363d',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#58a6ff';
                      e.target.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'transparent';
                      e.target.style.color = '#58a6ff';
                    }}
                  >
                    {labels[tabId]}
                  </button>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
`;
  code = code.replace(tabsBlock, newNav);
}

// 3. Replace each section's start and end properly
code = code.replace("{activeChart === 'overview' && (\n              <>", '<div id="section-overview" style={{ scrollMarginTop: 60 }}>\n              <>');
code = code.replace("              </>\n            )}\n\n            {activeChart === 'dynamics'", "              </>\n            </div>\n\n            {activeChart === 'dynamics'");

code = code.replace("{activeChart === 'dynamics' && channelsData && (\n              <div>", '<div id="section-dynamics" style={{ scrollMarginTop: 60 }}>\n              {channelsData && <div>');
code = code.replace("              </div>\n            )}\n\n            {activeChart === 'workbench'", "              </div>}\n            </div>\n\n            {activeChart === 'workbench'");

code = code.replace("{activeChart === 'workbench' && channelsData && (\n              <div>", '<div id="section-workbench" style={{ scrollMarginTop: 60 }}>\n              {channelsData && <div>');
code = code.replace("              </div>\n            )}\n\n            \n            {activeChart === 'gearing'", "              </div>}\n            </div>\n\n            \n            {activeChart === 'gearing'");

code = code.replace("{activeChart === 'gearing' && analysis && (\n              <GearingAnalysisPanel data={analysis['动力齿比']} />\n            )}", "<div id=\"section-gearing\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <GearingAnalysisPanel data={analysis['动力齿比']} />}\n            </div>");

code = code.replace("{activeChart === 'suspension' && analysis && (\n              <SuspensionAnalysisPanel data={analysis['底盘悬挂']} channelsData={channelsData} />\n            )}", "<div id=\"section-suspension\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <SuspensionAnalysisPanel data={analysis['底盘悬挂']} channelsData={channelsData} />}\n            </div>");

code = code.replace("{activeChart === 'differential' && analysis && (\n              <DifferentialAnalysisPanel data={analysis['差速抓地力']} />\n            )}", "<div id=\"section-differential\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <DifferentialAnalysisPanel data={analysis['差速抓地力']} />}\n            </div>");

code = code.replace("{activeChart === 'replay' && (\n              <div>", "<div id=\"section-replay\" style={{ scrollMarginTop: 60 }}>\n              <div>");

// Now specifically find the end of replay block safely.
// The replay block starts right after `id="section-replay"` and should end at the `)}` before the trends section.
const trendsStartStr = "{/* 历史演进趋势（跨场次） */}";
const trendsIdx = code.indexOf(trendsStartStr);

if (trendsIdx !== -1) {
  // Find the `)}` right before trendsIdx
  const closeIdx = code.lastIndexOf(")}", trendsIdx);
  if (closeIdx !== -1) {
    code = code.substring(0, closeIdx) + "</div>" + code.substring(closeIdx + 2);
  }
}

// At the very end of the main `navIntent?._subTab !== 'leaderboard' ? (` block, we need to add `</div>` to close the `<div style={{ gap: 48 }}>`
const conditionEndStr = ") : (\n          // 状态 1: 赛道风云榜大屏";
const condIdx = code.indexOf(conditionEndStr);
if (condIdx !== -1) {
  const innerWrapEndIdx = code.lastIndexOf("</div>", condIdx);
  if (innerWrapEndIdx !== -1) {
    code = code.substring(0, innerWrapEndIdx) + "</div>\n          </div>" + code.substring(innerWrapEndIdx + 6);
  }
}

fs.writeFileSync(file, code);
console.log('Precise refactor done.');
