const fs = require('fs');
const file = 'client/src/components/pages/SessionHistoryPage.jsx';
let code = fs.readFileSync(file, 'utf8');

const tabNavStartStr = '{/* 详情内容区域 */}';
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

// Targeted replacements using strict matches:
code = code.replace("{activeChart === 'overview' && (\n              <>", '<div id="section-overview" style={{ scrollMarginTop: 60 }}>\n              <>');
code = code.replace("              </>\n            )}", "              </>\n            </div>");

code = code.replace("{activeChart === 'dynamics' && channelsData && (\n              <div>", '<div id="section-dynamics" style={{ scrollMarginTop: 60 }}>\n              {channelsData && <div>');
code = code.replace("              </div>\n            )}\n\n            {activeChart === 'workbench'", "              </div>}\n            </div>\n\n            {activeChart === 'workbench'");

code = code.replace("{activeChart === 'workbench' && channelsData && (\n              <div>", '<div id="section-workbench" style={{ scrollMarginTop: 60 }}>\n              {channelsData && <div>');
code = code.replace("              </div>\n            )}\n\n            \n            {activeChart === 'gearing'", "              </div>}\n            </div>\n\n            \n            {activeChart === 'gearing'");

code = code.replace("{activeChart === 'gearing' && analysis && (\n              <GearingAnalysisPanel data={analysis['动力齿比']} />\n            )}", "<div id=\"section-gearing\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <GearingAnalysisPanel data={analysis['动力齿比']} />}\n            </div>");

code = code.replace("{activeChart === 'suspension' && analysis && (\n              <SuspensionAnalysisPanel data={analysis['底盘悬挂']} channelsData={channelsData} />\n            )}", "<div id=\"section-suspension\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <SuspensionAnalysisPanel data={analysis['底盘悬挂']} channelsData={channelsData} />}\n            </div>");

code = code.replace("{activeChart === 'differential' && analysis && (\n              <DifferentialAnalysisPanel data={analysis['差速抓地力']} />\n            )}", "<div id=\"section-differential\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <DifferentialAnalysisPanel data={analysis['差速抓地力']} />}\n            </div>");

code = code.replace("{activeChart === 'replay' && (\n              <div>", "<div id=\"section-replay\" style={{ scrollMarginTop: 60 }}>\n              <div>");

const endStr = "                </div>\n              </div>\n            )}";
const endRep = "                </div>\n              </div>\n            </div>";
// This replaces the end of replay.
let idx = code.lastIndexOf(endStr);
if (idx !== -1) {
  code = code.substring(0, idx) + endRep + code.substring(idx + endStr.length);
}

// Add the closing div for the gap container
const detailEndStr = "          </div>\n        )}\n      </div>\n    </div>\n  );\n}\n\nexport default SessionHistoryPage;";
code = code.replace(detailEndStr, "          </div>\n          </div>\n        )}\n      </div>\n    </div>\n  );\n}\n\nexport default SessionHistoryPage;");

fs.writeFileSync('client/src/components/pages/SessionHistoryPage.jsx', code);
console.log('Fixed tabs');
