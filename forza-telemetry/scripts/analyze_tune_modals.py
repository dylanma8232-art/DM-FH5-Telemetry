import re

filepath = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx'
with open(filepath, 'r') as f:
    content = f.read()

def extract_jsx_tag(tag_name, text):
    # Find the tag, considering nested braces and tags
    idx = text.find(tag_name)
    if idx == -1: return None
    start = idx
    open_braces = 0
    open_tags = 0
    in_jsx = False
    
    # Just a very simple bracket matching for `{tuneToDelete && (`
    pass

