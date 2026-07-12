import re

filepath = 'server/src/routes/sessions.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# The redundant route starts at router.get('/api/sessions/leaderboards'
pattern = re.compile(r"  router\.get\('/api/sessions/leaderboards', \(req, res\) => \{[\s\S]*?res\.status\(500\)\.json\(\{ error: 'Failed to generate leaderboards' \}\);\n    \}\n  \}\);\n", re.MULTILINE)
content = pattern.sub('', content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('Removed redundant route')
