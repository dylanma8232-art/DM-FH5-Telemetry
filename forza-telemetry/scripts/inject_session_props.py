import re

filepath = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx'

with open(filepath, 'r') as f:
    content = f.read()

props_code = """
  const sessionChartsProps = useMemo(() => ({
    activeTab, reviewSubTab, session: selectedSession, channelsLoading, channelsData,
    formatTimeMs, formatPercent, getCornerName,
    getSuspensionWarningColor, sectionStyle, chartCardStyle, statBoxStyle,
    isDataStale, setIsDataStale, CustomTooltip
  }), [
    activeTab, reviewSubTab, selectedSession, channelsLoading, channelsData,
    formatTimeMs, formatPercent, getCornerName,
    getSuspensionWarningColor, sectionStyle, chartCardStyle, statBoxStyle,
    isDataStale, setIsDataStale, CustomTooltip
  ]);
"""

if 'const sessionChartsProps =' not in content:
    content = content.replace('  return (', props_code + '\n  return (', 1)

if 'import { SessionChartsPanel }' not in content:
    content = content.replace("import { LoadingSpinner }", "import { LoadingSpinner }\nimport { SessionChartsPanel } from './session/SessionChartsPanel';")

with open(filepath, 'w') as f:
    f.write(content)

print("Injected sessionChartsProps.")
