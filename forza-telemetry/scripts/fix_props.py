import re

manager_path = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx'
modal_path = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx'

with open(manager_path, 'r') as f:
    manager_content = f.read()

new_props = """
    activeDiagnosisTab, setActiveDiagnosisTab,
    setDiagnosisResult,
    previewFixData, setPreviewFixData,
    handleConfirmSaveFixPreview,
    runTelemetryDiagnosis,
    toggleProblemSelection,
    formatDate,
    inputStyle,
    btnPrimaryStyle
"""

# We need to insert these new props into diagnosticModalProps
def insert_props(match):
    return match.group(0) + new_props + ','

manager_content = re.sub(r'const diagnosticModalProps = useMemo\(\(\) => \(\{', insert_props, manager_content)
manager_content = re.sub(r'\}\), \[', insert_props, manager_content)

with open(manager_path, 'w') as f:
    f.write(manager_content)

with open(modal_path, 'r') as f:
    modal_content = f.read()

def insert_props_modal(match):
    return match.group(0) + new_props + ','

modal_content = re.sub(r'const \{', insert_props_modal, modal_content, count=1)

with open(modal_path, 'w') as f:
    f.write(modal_content)

print("Props fixed in both files.")
