import re

filepath = 'client/src/components/pages/SessionHistoryPage.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the button
content = re.sub(r'<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); exportPDFReport\(session\.id\); \}\} style=\{\{ \.\.\.btnSmallStyle, background: \'rgba\(188,140,255,0\.1\)\', color: \'#bc8cff\', borderColor: \'rgba\(188,140,255,0\.3\)\' \}\}>PDF报告</button>', '', content)

# Remove the function exportPDFReport
pattern = re.compile(r'  // Round 6: PDF报告导出[\s\S]*?printWindow\.document\.close\(\);\n    \} catch \(e\) \{\n      toast\(\'生成PDF报告失败\', \'error\'\);\n    \}\n  \};', re.MULTILINE)
content = pattern.sub('', content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
