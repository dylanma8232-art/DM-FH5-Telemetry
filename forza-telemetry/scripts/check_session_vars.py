import re

with open('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/session/SessionChartsPanel.jsx', 'r') as f:
    text = f.read()

# very basic word extractor
words = set(re.findall(r'\b[a-zA-Z_]\w*\b', text))

known = set("""
import React BarChart Bar XAxis YAxis CartesianGrid Tooltip ResponsiveContainer 
LineChart Line ReferenceLine ReferenceArea ScatterChart Scatter Cell Legend 
LoadingSpinner export const SessionChartsPanel memo function props activeTab 
reviewSubTab session channelsLoading channelsData formatTimeMs formatPercent 
getCornerName Math_round Math_max Math_min getSuspensionWarningColor sectionStyle 
chartCardStyle statBoxStyle isDataStale setIsDataStale CustomTooltip return if 
div span map filter length push Array from length fill reduce Object keys values entries 
Math max min round Number toFixed parseInt parseFloat Date
""".split())

unknown = words - known
# Print first 20 unknown to avoid massive output. Most are CSS properties or string literals.
print("Possible undefined variables (sample):", sorted(list(unknown))[:20])
