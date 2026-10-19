#!/usr/bin/env python3
"""Diff the paths in docs/api/openapi.yaml against src/routes and static/.

usage: python3 -I docs/_meta/check-openapi-paths.py   (from the repo root)

A route directory with a +page.svelte, +page.ts, +page.server.ts or +server.ts
is a path; [param] becomes {param}. Files in static/ are paths too. Exits 1 if
either side has a path the other lacks.
"""
import pathlib, re, sys

spec = pathlib.Path('docs/api/openapi.yaml').read_text()
paths = set(re.findall(r'^  (/[^:]*):\s*$', spec, re.M))

routes = set()
for f in pathlib.Path('src/routes').rglob('+*'):
    if f.name in ('+page.svelte', '+page.ts', '+page.server.ts', '+server.ts'):
        parts = f.parent.relative_to('src/routes').parts
        routes.add('/' + '/'.join(re.sub(r'^\[(\w+)\]$', r'{\1}', p) for p in parts))
static = {'/' + f.name for f in pathlib.Path('static').iterdir()}

only_spec = sorted(paths - routes - static)
only_code = sorted(routes - paths)
print('only in openapi.yaml:', only_spec or 'none')
print('only in src/routes  :', only_code or 'none')
sys.exit(1 if only_spec or only_code else 0)
