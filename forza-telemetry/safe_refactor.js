const fs = require('fs');
let code = fs.readFileSync('client/src/components/pages/SessionHistoryPage.jsx', 'utf8');

const navStartStr = "            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>";
const navEndStr = "            {activeChart === 'overview' && (";

const navStartIndex = code.indexOf(navStartStr);
const navEndIndex = code.indexOf(navEndStr);

if (navStartIndex !== -1 && navEndIndex !== -1) {
  const newNav = `
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid #30363d', paddingBottom: 12, position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
              {[
                { id: 'overview', label: '总览' },
                { id: 'dynamics', label: '动力学' },
                { id: 'workbench', label: '驾驶分析' },
                { id: 'gearing', label: '动力与传动' },
                { id: 'suspension', label: '底盘悬挂' },
                { id: 'differential', label: '差速器诊断' },
                { id: 'replay', label: '回放 & 教练' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById('section-' + tab.id);
                    if (el) {
                      if (tab.id === 'dynamics' || tab.id === 'workbench') {
                        if (selectedSession) {
                          loadTelemetryChannels();
                          loadAdvancedAnalysis();
                        }
                      }
                      if (tab.id === 'replay') {
                        if (selectedSession && !detailLoaded) {
                          loadSessionDetail(selectedSession);
                        }
                      }
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
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
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>

            <div id="section-overview" style={{ scrollMarginTop: 60 }}>`;
  
  code = code.substring(0, navStartIndex) + newNav + code.substring(navEndIndex + navEndStr.length);
}

// Replace exact ending of overview and start of dynamics
code = code.replace("              </>\n            )}\n\n            {activeChart === 'dynamics' && channelsData && (\n              <div>", "              </>\n            </div>\n\n            <div id=\"section-dynamics\" style={{ scrollMarginTop: 60 }}>\n              {channelsData && <div>");

// Dynamics -> Workbench
code = code.replace("              </div>\n            )}\n\n            {activeChart === 'workbench' && channelsData && (\n              <div>", "              </div>}\n            </div>\n\n            <div id=\"section-workbench\" style={{ scrollMarginTop: 60 }}>\n              {channelsData && <div>");

// Workbench -> Gearing
code = code.replace("              </div>\n            )}\n\n            \n            {activeChart === 'gearing' && analysis && (\n              <GearingAnalysisPanel data={analysis['动力齿比']} />\n            )}", "              </div>}\n            </div>\n\n            <div id=\"section-gearing\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <GearingAnalysisPanel data={analysis['动力齿比']} />}\n            </div>");

// Gearing -> Suspension
code = code.replace("            {activeChart === 'suspension' && analysis && (\n              <SuspensionAnalysisPanel data={analysis['底盘悬挂']} channelsData={channelsData} />\n            )}", "<div id=\"section-suspension\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <SuspensionAnalysisPanel data={analysis['底盘悬挂']} channelsData={channelsData} />}\n            </div>");

// Suspension -> Differential
code = code.replace("            {activeChart === 'differential' && analysis && (\n              <DifferentialAnalysisPanel data={analysis['差速抓地力']} />\n            )}", "<div id=\"section-differential\" style={{ scrollMarginTop: 60 }}>\n              {analysis && <DifferentialAnalysisPanel data={analysis['差速抓地力']} />}\n            </div>");

// Differential -> Replay
code = code.replace("            {activeChart === 'replay' && (\n              <div>", "<div id=\"section-replay\" style={{ scrollMarginTop: 60 }}>\n              <div>");

// Replay -> End of detail block
// We need to find the `)}` that closes the replay block. It occurs exactly before the trackFilter check or empty state check
const replayEndStr = `                </div>
              </div>
            )}`;
const replayNewStr = `                </div>
              </div>
            </div>`;
code = code.replace(replayEndStr, replayNewStr);

// Now we must close the `<div style={{ gap: 48 }}>` at the end of the `selectedSession ? (` block.
// Find `        ) : trackFilter ? (`
const detailEndStr = `          </div>
        ) : trackFilter ? (`
const newDetailEndStr = `            </div>
          </div>
        ) : trackFilter ? (`
code = code.replace(detailEndStr, newDetailEndStr);

fs.writeFileSync('client/src/components/pages/SessionHistoryPage.jsx', code);
console.log('Safe refactor done.');
