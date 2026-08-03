import re
manager_path = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx'
modal_path = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx'
with open(manager_path, 'r') as f:
    c = f.read()
c = c.replace('btnPrimaryStyle, setUnlockToast,', 'btnPrimaryStyle, setUnlockToast, aiDiagnosing,')
with open(manager_path, 'w') as f:
    f.write(c)

with open(modal_path, 'r') as f:
    c = f.read()
c = c.replace('btnPrimaryStyle, setUnlockToast,', 'btnPrimaryStyle, setUnlockToast, aiDiagnosing,')
with open(modal_path, 'w') as f:
    f.write(c)
