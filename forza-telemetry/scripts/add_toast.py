import re

manager_path = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx'
modal_path = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx'

with open(manager_path, 'r') as f:
    manager_content = f.read()

# insert setUnlockToast
manager_content = manager_content.replace('btnPrimaryStyle,', 'btnPrimaryStyle, setUnlockToast,')

with open(manager_path, 'w') as f:
    f.write(manager_content)

with open(modal_path, 'r') as f:
    modal_content = f.read()

modal_content = modal_content.replace('btnPrimaryStyle,', 'btnPrimaryStyle, setUnlockToast,')

with open(modal_path, 'w') as f:
    f.write(modal_content)
