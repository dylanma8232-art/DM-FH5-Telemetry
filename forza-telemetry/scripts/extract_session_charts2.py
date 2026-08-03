import re

source = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx'
target = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/session/SessionChartsPanel.jsx'

with open(source, 'r') as f:
    lines = f.readlines()

start_line = 1539 # 0-indexed for 1540
end_line = 2577 # 0-indexed for 2578

modal_lines = lines[start_line:end_line+1]

# Generate the new component
modal_text = "".join(modal_lines)

component_code = f"""import React from 'react';
import {{ BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ReferenceArea, ScatterChart, Scatter, Cell, Legend }} from 'recharts';
import {{ LoadingSpinner }} from '../../shared/LoadingSpinner';

export const SessionChartsPanel = React.memo(function SessionChartsPanel(props) {{
  const {{
    activeTab, reviewSubTab, session, channelsLoading, channelsData,
    formatTimeMs, formatPercent, getCornerName,
    getSuspensionWarningColor, sectionStyle, chartCardStyle, statBoxStyle,
    isDataStale, setIsDataStale, CustomTooltip
  }} = props;

  const Math_round = Math.round;
  const Math_max = Math.max;
  const Math_min = Math.min;

  return (
    <>
{modal_text}
    </>
  );
}});
"""
import os
os.makedirs(os.path.dirname(target), exist_ok=True)
with open(target, 'w') as f:
    f.write(component_code)
    
# Replace in source
new_source = lines[:start_line] + [
    "              <SessionChartsPanel {...sessionChartsProps} />\n"
] + lines[end_line+1:]

with open(source, 'w') as f:
    f.writelines(new_source)
    
print(f"Extracted {end_line - start_line + 1} lines to SessionChartsPanel.jsx")

