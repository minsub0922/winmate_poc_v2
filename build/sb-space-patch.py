#!/usr/bin/env python3
"""wm-sb-space — sidebar spacing + proposal-history panel (bundle-only patch, recovered from the live artifact 2026-10-19).
Usage: python3 build/sb-space-patch.py dist/index.html   (idempotent; run after build, before link-tag-patch.py)"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'dist/index.html'
h = open(p, encoding='utf-8').read()
if 'wm-sb-space' in h:
    print('sb-space: already applied'); sys.exit(0)
old = '--sb-w: 252px;'
assert h.count(old) == 1, 'sb-space: --sb-w anchor not found'
h = h.replace(old, '--sb-w: 288px;')
BLOCK = '/* ---------- wm-sb-space · sidebar spacing + proposal history panel ----------\n   Rows get more air (8px gap, 38px rows). 제안서 히스토리 becomes its own panel: tinted header + list joined into one card,\n   set apart by a wider divider. The list is indented under the history icon with a tree guide line at the icon\'s centre\n   (x = 32px), so items read as children of the header. Icon x positions of the collapsed rail are unchanged. */\n.sidebar { gap: 8px; }\n.sidebar .sb-brand { padding-bottom: 14px; }\n.sb-home { height: 38px; }\n.sb-div { margin: 12px 4px 8px; }\n.sb-hist { height: 40px; border-radius: 12px 12px 0 0; background: var(--surface-2); transition: background .12s ease; }\n.sb-hist .sb-tx:not(.sb-count) { font-size: 12px; font-weight: 800; letter-spacing: .02em; color: var(--ink-2); }\n.sb-hist .sb-count { background: var(--surface-3); border-radius: 999px; padding: 1px 8px; }\n.sb-list { margin: -8px 0 2px; padding: 4px 8px 10px 32px; gap: 4px; background: var(--surface-2); border-radius: 0 0 12px 12px; }\n/* item: title on its own row; flow nodes bottom-left, time bottom-right; customer hidden */\n.sb-item { position: relative; padding: 8px 10px; row-gap: 5px; }\n.sb-item .t { grid-column: 1 / -1; grid-row: 1; }\n.sb-item .s { grid-column: 1; grid-row: 2; }\n.sb-item .when { grid-column: 2; grid-row: 2; align-self: center; }\n.sb-item .sb-cust { display: none; }\n.sb-item .sb-flow { max-width: 100%; }\n.sb-item::before { content: ""; position: absolute; left: -12px; top: -2px; bottom: -2px; width: 1.5px; background: var(--line-2); }\n.sb-item:first-child::before { top: -4px; }\n.sb-item:last-child::before { bottom: 50%; }\n.sb-item:hover { background: var(--surface-3); }\n.sb-item[aria-current="page"] { background: var(--accent-soft); }\n.sb-item[aria-current="page"]::before { background: var(--accent); }\n.sb-foot { padding-top: 12px; }\n.sb-me > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n@media (min-width: 761px) {\n  /* collapsed rail: no panel chrome behind the history icon (the open-proposal highlight stays) */\n  .sidebar:not(:is(:hover, :has(:focus-visible))) .sb-hist:not(.is-on) { background: transparent; }\n  .sidebar:not(:is(:hover, :has(:focus-visible))) .sb-hist.is-on { border-radius: 8px; }\n  .sidebar:is(:hover, :has(:focus-visible)) .sb-hist.is-on { background: var(--surface-2); color: var(--ink); }\n  .sidebar .sb-foot { padding-top: 12px; }\n}\n'
k = h.rfind('</style>')
h = h[:k].rstrip() + '\n\n' + BLOCK + h[k:]
open(p, 'w', encoding='utf-8').write(h)
print('sb-space: applied')
