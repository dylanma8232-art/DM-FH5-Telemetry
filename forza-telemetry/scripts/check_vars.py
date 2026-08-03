import re

with open('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx', 'r') as f:
    text = f.read()

# Extract all words that are not enclosed in quotes
words = set(re.findall(r'\b[a-zA-Z_]\w*\b', text))

# Print all words that are not in props or imports or builtins
known = set("""
import React from TelemetryRecommendationList DRIVING_PROBLEMS PROBLEM_CATEGORIES 
FIX_PARAM_MAP PARAM_NAMES_ZH export const TuneDiagnosticModal memo function props 
diagnosisModalTune setDiagnosisModalTune modalOverlayStyle modalContentStyle 
btnSmallStyle getVehicleName getCarStats getPerformanceClassBadge tunes isDiagnosing 
diagnosisResult handleGenerateFixPreview runAiProblemDiagnosis selectedProblems 
setSelectedProblems selectedSessionId setSelectedSessionId recentSessions 
handleApplyProblemsFixInViewOnly statCardStyle return null if div style onClick e 
target currentTarget maxWidth maxHeight display flexDirection gap overflow padding 
background border borderRadius color h3 margin display justifyContent alignItems 
cursor strokeWidth button borderBottom fontWeight paddingLeft overflowY select 
value onChange map option key filter reduce Object keys Array from Set length 
includes some includes some map join padding margin padding background border 
borderRadius span margin fontSize span fontStyle minHeight textAlign flex 
justifyContent alignContent alignItems alignSelf justifyItems alignSelf padding 
border fontSize background border padding margin color textAlign Math round max 
min parseInt parseFloat String null undefined true false
""".split())

unknown = words - known
print("Possible undefined variables:", sorted(list(unknown)))
