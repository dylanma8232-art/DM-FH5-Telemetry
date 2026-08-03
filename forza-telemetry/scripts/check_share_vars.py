import re

with open('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneShareModal.jsx', 'r') as f:
    text = f.read()

words = set(re.findall(r'\b[a-zA-Z_]\w*\b', text))
known = set("""
import React useState parseShareCode export const TuneShareModal memo function props 
shareCodeModal setShareCodeModal modalOverlayStyle modalContentStyle btnSmallStyle 
btnPrimaryStyle inputStyle importFromShareCode importPreview setImportPreview 
getPerformanceClassBadge getVehicleName getCarStats return null if div style onClick 
e target currentTarget maxWidth display justifyContent alignItems marginBottom h2 fontSize 
fontWeight margin button border none label color textarea id placeholder rows resize 
fontFamily flex gap const code document getElementById value trim preview alert rgba 
borderColor span maxHeight overflow
""".split())

unknown = words - known
print("Possible undefined variables:", sorted(list(unknown)))
