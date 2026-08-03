import re

filepath = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx'

with open(filepath, 'r') as f:
    content = f.read()

content = content.replace(
    "import { LoadingSpinner }\nimport { SessionChartsPanel } from './session/SessionChartsPanel'; from '../shared/LoadingSpinner';",
    "import { LoadingSpinner } from '../shared/LoadingSpinner';\nimport { SessionChartsPanel } from './session/SessionChartsPanel';"
)

with open(filepath, 'w') as f:
    f.write(content)

panel_path = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/session/SessionChartsPanel.jsx'
with open(panel_path, 'r') as f:
    panel_content = f.read()

imports_to_add = """
import { EmptyState } from '../../shared/EmptyState';
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../../data/tunePresets';
import { TrackThumbnail, InteractiveTrackMap } from './TrackMaps';
"""

if 'EmptyState' not in panel_content:
    panel_content = panel_content.replace(
        "import { LoadingSpinner } from '../../shared/LoadingSpinner';",
        "import { LoadingSpinner } from '../../shared/LoadingSpinner';\n" + imports_to_add
    )

with open(panel_path, 'w') as f:
    f.write(panel_content)

print("Fixed session imports.")
