import re

source = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx'
target = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx'

with open(source, 'r') as f:
    lines = f.readlines()

# Extract lines 2487 to 3096 (1-indexed)
modal_lines = lines[2486:3096]

# Replace the {diagnosisModalTune && ( ... )} with just return ( ... );
modal_text = "".join(modal_lines)

# Strip out the condition
modal_text = modal_text.replace("{diagnosisModalTune && (", "if (!diagnosisModalTune) return null;\n\n  return (", 1)
modal_text = modal_text.rsplit(")}", 1)[0] + ");"

# Now put it into the target
with open(target, 'r') as f:
    target_content = f.read()

target_content = target_content.replace('return null;', modal_text)

with open(target, 'w') as f:
    f.write(target_content)

# And remove it from the source, replacing it with the component call
new_source_lines = lines[:2486] + [
    "      <TuneDiagnosticModal {...diagnosticModalProps} />\n"
] + lines[3096:]

with open(source, 'w') as f:
    f.writelines(new_source_lines)

print("Extraction script complete.")
