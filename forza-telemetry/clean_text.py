import os
import re

# Match Chinese text followed by optional space, then '(' or '（', then English/spaces/symbols, then ')' or '）'
# Specifically targeting things like "动力学 (Dynamics)" or "中央差速器 (Center Differential)"
pattern = re.compile(r'([\u4e00-\u9fa5]+)\s*[\(（][A-Za-z0-9\s]+[\)）]')

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content, count = pattern.subn(r'\1', content)
    
    if count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath} ({count} replacements)")

def walk_dir(directory):
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in root or '.git' in root or '.codegraph' in root:
            continue
        for file in files:
            if file.endswith(('.js', '.jsx', '.json', '.md', '.html')):
                process_file(os.path.join(root, file))

if __name__ == "__main__":
    walk_dir('/Users/dylan/Desktop/fh5/forza-telemetry/')
