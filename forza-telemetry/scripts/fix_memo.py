import re

files = [
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx',
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx',
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TrackManagerPage.jsx'
]

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    # If the file starts with export const ... React.memo( but doesn't end with });
    if "React.memo(function" in content and not content.strip().endswith("});"):
        # We need to add `);` to the end of the file.
        # It currently ends with `}` probably.
        content = content.rstrip()
        if content.endswith("}"):
            content = content + ");\n"
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Fixed React.memo closing parenthesis in {filepath}")

