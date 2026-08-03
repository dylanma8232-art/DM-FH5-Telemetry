import re

filepath = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx'

with open(filepath, 'r') as f:
    content = f.read()

# Replace all imports at the top
imports = """import React from 'react';
import { TelemetryRecommendationList } from './TelemetryRecommendationList';
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../../data/tunePresets';
import { FIX_PARAM_MAP } from '../../../utils/tuneForm';
import { PARAM_NAMES_ZH } from './tuneConstants';
"""

content = re.sub(r'import React from \'react\';\nimport {.*?react-feather\';', imports, content, flags=re.DOTALL)

with open(filepath, 'w') as f:
    f.write(content)

print("Imports patched.")
