import re

files = [
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx',
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx',
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TrackManagerPage.jsx'
]

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    # Match `export function ComponentName` and replace with `export const ComponentName = React.memo(function ComponentName`
    def replacer(match):
        func_name = match.group(1)
        args = match.group(2)
        return f"export const {func_name} = React.memo(function {func_name}{args}"

    new_content = re.sub(r'export function ([A-Za-z0-9_]+)(\([^)]*\)\s*\{)', replacer, content)

    if content != new_content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Applied React.memo to {filepath}")

