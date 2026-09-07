#!/usr/bin/env python3
"""Bundle index.html + css + js into a single self-contained crownhold.html."""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
css = (root / 'css/style.css').read_text()
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
def inline(m):
    src = m.group(1)
    return '<script>\n' + (root / src).read_text() + '\n</script>'
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)
(root / 'crownhold.html').write_text(html)
print('wrote crownhold.html', len(html), 'bytes')

# artifact variant: no doctype/html/head/body wrapper (the artifact host supplies those)
art = html
art = re.sub(r'<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*', '', art)
art = re.sub(r'<meta[^>]*>\s*', '', art)
art = art.replace('</head>\n<body>\n', '').replace('</body>\n</html>', '')
(root / 'crownhold_artifact.html').write_text(art)
print('wrote crownhold_artifact.html', len(art), 'bytes')
