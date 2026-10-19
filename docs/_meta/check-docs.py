#!/usr/bin/env python3
"""Doc checks: Mermaid render, relative links, TODO coverage, one H1, footer.

usage: python3 -I docs/_meta/check-docs.py . [files...]   (default: every docs/**/*.md)

Mermaid blocks are rendered with `npx -y @mermaid-js/mermaid-cli`. Puppeteer's
own Chromium may lack system libraries; point it at Playwright's headless shell
with a JSON config in MERMAID_PUPPETEER_CONFIG, e.g.
{"executablePath": "<~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell>",
 "args": ["--no-sandbox"], "headless": "shell"}
Set SKIP_MERMAID=1 to check links and markers only.
"""
import os, re, subprocess, sys, glob, tempfile

repo = sys.argv[1]
pp = os.environ.get('MERMAID_PUPPETEER_CONFIG')
skip_mermaid = os.environ.get('SKIP_MERMAID') == '1'
files = sys.argv[2:] or sorted(glob.glob(os.path.join(repo, 'docs/**/*.md'), recursive=True))
skip = {'docs/IMPLEMENTATION.md', 'docs/DECISIONS.md', 'docs/PROGRESS.md'}
files = [f for f in files if os.path.relpath(f, repo) not in skip and '/notes/' not in f]
gaps = open(os.path.join(repo, 'docs/_meta/gaps.md')).read() if os.path.exists(os.path.join(repo, 'docs/_meta/gaps.md')) else ''
fail = 0
n_mmd = 0
for f in files:
    rel = os.path.relpath(f, repo)
    text = open(f).read()
    body = re.sub(r'```.*?```', '', text, flags=re.S)
    h1 = [l for l in body.splitlines() if l.startswith('# ')]
    if len(h1) != 1:
        print(f'{rel}: {len(h1)} H1'); fail += 1
    if not rel.startswith('docs/_meta/') and '**Last verified:**' not in text:
        print(f'{rel}: no footer'); fail += 1
    for m in re.finditer(r'\]\(([^)\s]+)\)', body):
        target = m.group(1)
        if re.match(r'^[a-z]+:', target) or target.startswith('#'):
            continue
        path = target.split('#')[0]
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), path))):
            print(f'{rel}: broken link {target}'); fail += 1
    if re.search(r'^> \*\*TODO \(unverified\):', text, re.M) and rel != 'docs/_meta/gaps.md' and rel not in gaps:
        print(f'{rel}: has TODOs but is not listed in gaps.md'); fail += 1
    for i, block in enumerate([] if skip_mermaid else re.findall(r'```mermaid\n(.*?)```', text, flags=re.S)):
        n_mmd += 1
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, 'in.mmd'); out = os.path.join(d, 'out.svg')
            open(src, 'w').write(block)
            r = subprocess.run(['npx', '-y', '@mermaid-js/mermaid-cli', '-q'] + (['-p', pp] if pp else []) + ['-i', src, '-o', out],
                               capture_output=True, text=True, timeout=180)
            if r.returncode != 0 or not os.path.exists(out):
                err = [l for l in (r.stderr + r.stdout).splitlines() if l.strip() and not l.strip().startswith('at ')]
                print(f'{rel}: mermaid block {i + 1} failed: {" | ".join(err[:4])}'); fail += 1
print(f'checked {len(files)} files, {n_mmd} mermaid blocks, {fail} problems')
sys.exit(1 if fail else 0)
