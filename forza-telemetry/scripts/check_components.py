import re

with open('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx', 'r') as f:
    content = f.read()

components = set(re.findall(r'<([A-Z][a-zA-Z0-9_]*)', content))
imports = set(re.findall(r'import\s+.*?\{([^}]+)\}', content))
import_names = set()
for imp in imports:
    import_names.update([x.strip() for x in imp.split(',')])

print("Used:", components)
print("Imported:", import_names)
missing = components - import_names - {'TuneDiagnosticModal'}
print("Missing components:", missing)
