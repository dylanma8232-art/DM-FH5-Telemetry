import re

files = {
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx': 'TuneManagerPage',
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx': 'SessionHistoryPage',
    '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TrackManagerPage.jsx': 'TrackManagerPage'
}

for filepath, comp_name in files.items():
    with open(filepath, 'r') as f:
        content = f.read()

    # Find export function
    match = re.search(f'export function {comp_name}\s*\((.*?)\)\s*{{', content)
    if not match:
        continue

    start_idx = match.start()
    open_idx = match.end() - 1  # The '{'
    
    # Count braces to find the matching closing brace
    brace_count = 1
    i = open_idx + 1
    while i < len(content):
        if content[i] == '{':
            brace_count += 1
        elif content[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                break
        i += 1
        
    if brace_count == 0:
        close_idx = i
        
        # Replace the opening
        new_content = content[:start_idx] + f"export const {comp_name} = React.memo(function {comp_name}({match.group(1)}) {{" + content[open_idx+1:close_idx] + "});" + content[close_idx+1:]
        
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Successfully applied React.memo to {comp_name}")

