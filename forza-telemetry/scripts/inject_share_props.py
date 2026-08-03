import re

filepath = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx'

with open(filepath, 'r') as f:
    content = f.read()

props_code = """
  const tuneShareModalProps = useMemo(() => ({
    shareCodeModal, setShareCodeModal,
    modalOverlayStyle, modalContentStyle,
    btnSmallStyle, btnPrimaryStyle, inputStyle,
    importFromShareCode,
    importPreview, setImportPreview,
    getPerformanceClassBadge, getVehicleName, getCarStats
  }), [
    shareCodeModal, modalOverlayStyle, modalContentStyle,
    btnSmallStyle, btnPrimaryStyle, inputStyle,
    importFromShareCode, importPreview,
    getPerformanceClassBadge, getVehicleName, getCarStats
  ]);
"""

if 'const tuneShareModalProps =' not in content:
    content = content.replace('  return (', props_code + '\n  return (', 1)

if 'import { TuneShareModal }' not in content:
    content = content.replace("import { TuneDiagnosticModal } from './tune/TuneDiagnosticModal';", "import { TuneDiagnosticModal } from './tune/TuneDiagnosticModal';\nimport { TuneShareModal } from './tune/TuneShareModal';")

with open(filepath, 'w') as f:
    f.write(content)

print("Injected tuneShareModalProps.")
