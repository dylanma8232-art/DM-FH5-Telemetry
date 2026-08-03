import re

source = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx'
target = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneShareModal.jsx'

with open(source, 'r') as f:
    lines = f.readlines()

start_line = -1
end_line = -1
for i, line in enumerate(lines):
    if "{shareCodeModal && (" in line:
        start_line = i
        break

# Find matching parenthesis to get the end line
if start_line != -1:
    open_parens = 0
    for i in range(start_line, len(lines)):
        open_parens += lines[i].count('(')
        open_parens -= lines[i].count(')')
        if open_parens == 0:
            end_line = i
            break

if start_line != -1 and end_line != -1:
    modal_lines = lines[start_line:end_line+1]
    
    # Generate the new component
    modal_text = "".join(modal_lines)
    modal_text = modal_text.replace("{shareCodeModal && (", "if (!shareCodeModal) return null;\n\n  return (", 1)
    if modal_text.endswith(")}\n"):
        modal_text = modal_text[:-3] + ");\n"
    
    component_code = f"""import React, {{ useState }} from 'react';
import {{ parseShareCode }} from '../../../utils/tuneForm';

export const TuneShareModal = React.memo(function TuneShareModal(props) {{
  const {{
    shareCodeModal,
    setShareCodeModal,
    modalOverlayStyle,
    modalContentStyle,
    btnSmallStyle,
    btnPrimaryStyle,
    inputStyle,
    importFromShareCode,
    importPreview,
    setImportPreview,
    getPerformanceClassBadge,
    getVehicleName,
    getCarStats
  }} = props;

{modal_text}
}});
"""
    with open(target, 'w') as f:
        f.write(component_code)
        
    # Replace in source
    new_source = lines[:start_line] + [
        "      <TuneShareModal {...tuneShareModalProps} />\n"
    ] + lines[end_line+1:]
    
    with open(source, 'w') as f:
        f.writelines(new_source)
        
    print(f"Extracted {end_line - start_line + 1} lines to TuneShareModal.jsx")
else:
    print("Could not find boundaries.")
