const fs = require('fs');
const file = 'client/src/components/pages/SessionHistoryPage.jsx';
let code = fs.readFileSync(file, 'utf8');

// The first section was left like this:
//            <div id="section-overview" style={{ scrollMarginTop: 60 }}>
//              <>
//                {/* 驾驶综合评分 */}

code = code.replace("              </>\n            )}\n\n            {activeChart === 'dynamics'", "              </>\n            </div>\n\n            {activeChart === 'dynamics'");

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
console.log('Fixed remaining sections');
