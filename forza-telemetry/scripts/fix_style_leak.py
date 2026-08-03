import re

files = [
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx',
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx'
]

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    # We want to keep them in diagnosticModalProps and the props destructuring,
    # but remove them from style={{ ...btnPrimaryStyle, setUnlockToast, aiDiagnosing }}
    # They look like: style={{ ...btnPrimaryStyle, setUnlockToast, aiDiagnosing,
    
    content = content.replace("...btnPrimaryStyle, setUnlockToast, aiDiagnosing,", "...btnPrimaryStyle,")
    content = content.replace("...btnPrimaryStyle, setUnlockToast, aiDiagnosing }", "...btnPrimaryStyle }")

    with open(filepath, 'w') as f:
        f.write(content)

print("Fixed leaked props in styles.")
