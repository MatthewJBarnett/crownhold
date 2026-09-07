#!/usr/bin/env python3
"""Bundle index.html + css + js into a single self-contained crownhold.html."""
import re, pathlib

import datetime as _dt, re as _re
_p = 'js/data.js'
_s = open(_p).read()
_s = _re.sub(r"DATA\.build = '[^']*'", "DATA.build = '%s'" % _dt.datetime.now().strftime('%Y-%m-%d %H:%M'), _s, count=1)
open(_p, 'w').write(_s)
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
css = (root / 'css/style.css').read_text()
html = re.sub(r'<link rel="stylesheet" href="css/style.css(\?v=[^"]*)?">', lambda m: '<style>\n' + css + '\n</style>', html)
def inline(m):
    src = m.group(1)
    return '<script>\n' + (root / src).read_text() + '\n</script>'
html = re.sub(r'<script src="(js/[^"?]+)(\?v=[^"]*)?"></script>', inline, html)
(root / 'crownhold.html').write_text(html)

# stamp the multi-file page's script/css links so browsers never serve a stale mix after a deploy
import hashlib
ver = hashlib.md5(html.encode()).hexdigest()[:8]
idx = (root / 'index.html').read_text()
idx = re.sub(r'(<script src="js/[^"?]+)(\?v=[^"]*)?"', lambda m: m.group(1) + '?v=' + ver + '"', idx)
idx = re.sub(r'(href="css/style.css)(\?v=[^"]*)?"', lambda m: m.group(1) + '?v=' + ver + '"', idx)
(root / 'index.html').write_text(idx)
print('stamped index.html with', ver)
print('wrote crownhold.html', len(html), 'bytes')

# artifact variant: no doctype/html/head/body wrapper (the artifact host supplies those)
art = html
art = re.sub(r'<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*', '', art)
art = re.sub(r'<meta[^>]*>\s*', '', art)
art = art.replace('</head>\n<body>\n', '').replace('</body>\n</html>', '')
(root / 'crownhold_artifact.html').write_text(art)
print('wrote crownhold_artifact.html', len(art), 'bytes')
