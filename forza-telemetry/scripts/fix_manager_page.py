import re

filepath = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx'

with open(filepath, 'r') as f:
    content = f.read()

# 1. Add import if missing
if 'import { TuneDiagnosticModal }' not in content:
    content = content.replace("import React, { Suspense, lazy", "import React, { Suspense, lazy, useMemo")
    content = content.replace("import { LoadingSpinner } from '../shared/LoadingSpinner';", "import { LoadingSpinner } from '../shared/LoadingSpinner';\nimport { TuneDiagnosticModal } from './tune/TuneDiagnosticModal';")

# 2. Add diagnosticModalProps
# We need to add it before the return
props_obj = """
  const diagnosticModalProps = useMemo(() => ({
    diagnosisModalTune,
    setDiagnosisModalTune,
    modalOverlayStyle,
    modalContentStyle,
    btnSmallStyle,
    getVehicleName,
    getCarStats,
    getPerformanceClassBadge,
    tunes,
    isDiagnosing,
    diagnosisResult,
    handleGenerateFixPreview,
    runAiProblemDiagnosis,
    selectedProblems,
    setSelectedProblems,
    selectedSessionId,
    setSelectedSessionId,
    recentSessions,
    handleApplyProblemsFixInViewOnly,
    statCardStyle
  }), [
    diagnosisModalTune, modalOverlayStyle, modalContentStyle, btnSmallStyle,
    getVehicleName, getCarStats, getPerformanceClassBadge, tunes,
    isDiagnosing, diagnosisResult, handleGenerateFixPreview,
    runAiProblemDiagnosis, selectedProblems, selectedSessionId,
    recentSessions, handleApplyProblemsFixInViewOnly, statCardStyle
  ]);
"""
if 'const diagnosticModalProps =' not in content:
    content = content.replace('  return (', props_obj + '\n  return (', 1)

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed TuneManagerPage.jsx")
