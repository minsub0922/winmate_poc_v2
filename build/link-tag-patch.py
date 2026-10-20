#!/usr/bin/env python3
"""Winmate v2 · 요구사항 입력 링크 태그 + 제작자 의견 @태그 — 공개 번들(index.html)에 직접 패치.

usage: link-tag-patch.py <in.html> <out.html> <linktag.js> <linktag.css>

1. 제작자 의견 textarea → MentionEditor(@ 제품 · 솔루션 · 유관사례 + 링크), 아래 TagStrip. 세그먼트는 form.noteSegs,
   글(form.note)은 그대로 문자열로 같이 저장(reqText · AI 프롬프트가 읽는 값).
2. MentionEditor 붙여넣기: 링크가 있으면 window.__wmLink.paste가 링크 칩으로 넣음(자유형식 · 키맨 요구사항 · 제작자 의견 등 모든 MentionEditor).
3. renderSegs / readSegs: 링크 세그먼트 { t: url, link: {...} } 읽고 그리기.
4. window.__wmTag / __wmData(refInfo · 썸네일 · 제품/솔루션/사례 맵)를 열어 linktag.js가 samsung.com 주소를 앱 제품으로 맞춤.
축약 이름은 정규식으로 찾으므로 재압축된 번들에도 다시 적용 가능. 이미 적용된 번들이면 그대로 둔다.
"""
import re, sys

src, dst, js_path, css_path = sys.argv[1:5]
s = open(src, encoding='utf-8', newline='').read()
if '__wmLink' in s:
    print('already patched'); open(dst, 'w', encoding='utf-8', newline='').write(s); sys.exit(0)
JS = open(js_path, encoding='utf-8').read()
CSS = open(css_path, encoding='utf-8').read()

def esc(k):  # esbuild ASCII escapes
    return ''.join(c if ord(c) < 128 else ('\\x%02X' % ord(c) if ord(c) < 256 else '\\u%04X' % ord(c)) for c in k)

def one(rx, text, what):
    m = list(re.finditer(rx, text))
    assert len(m) == 1, (what, len(m))
    return m[0]

# --- names ---
m = one(r'function ([\w$]+)\(([\w$])\)\{let ([\w$])=([\w$]+)\(\2\),([\w$])=document\.createElement\("span"\);return \5\.className="mention has-th"', s, 'chipEl')
CHIP, REFINFO = m.group(1), m.group(4)
body = s[m.start():m.start() + 600]
THUMB = re.search(r'innerHTML=[\w$]\?([\w$]+)\([\w$]\):""', body).group(1)
TITLE = re.search(r'\.title=([\w$]+)\([\w$]\)', body).group(1)
SHORT = re.search(r'"@"\+\([\w$]\?([\w$]+)\([\w$]\):[\w$]\)', body).group(1)
r = one(r'function ' + re.escape(REFINFO) + r'\(t\)\{let\[e,i\]=String\(t\)\.split\(":"\);if\(e==="product"\)\{let o=([\w$]+)\[i\];.*?if\(e==="solution"\)\{let o=([\w$]+)\[i\];.*?if\(e==="case"\)\{let o=([\w$]+)\[i\]', s, 'refInfo')
PM, SM, CM = r.group(1), r.group(2), r.group(3)

# --- @태그 이름이 빈 제품(카탈로그 전용 등)은 '@'만 남던 문제: 짧은 이름 → 모델 → 이름 순으로 채움 ---
old_at = '"@"+(%s?%s(%s):%s)' % (m.group(3), SHORT, m.group(2), m.group(2))
assert s.count(old_at) >= 1, 'chip label'
i0 = s.find(old_at, m.start())
s = s[:i0] + '"@"+(%s?%s(%s)||%s.short||%s.label:%s)' % (m.group(3), SHORT, m.group(2), m.group(3), m.group(3), m.group(2)) + s[i0 + len(old_at):]

# --- 4. expose helpers right after chipEl ---
rs = one(r'function ([\w$]+)\(([\w$]),([\w$])\)\{\2\.innerHTML="";for\(let ([\w$]) of \3\|\|\[\]\)\4\.ref\?\2\.appendChild\(' + re.escape(CHIP) + r'\(\4\.ref\)\):\2\.appendChild\(document\.createTextNode\(\4\.t\)\)\}', s, 'renderSegs')
RENDER = rs.group(1); el, it = rs.group(2), rs.group(4)
expose = 'window.__wmTag=()=>({info:%s,thumb:%s,short:%s,title:%s});window.__wmData=()=>({P:%s,S:%s,C:%s});' % (REFINFO, THUMB, SHORT, TITLE, PM, SM, CM)
new_render = 'function %s(%s,%s){%s.innerHTML="";for(let %s of %s||[])%s.ref?%s.appendChild(%s(%s.ref)):%s.link&&window.__wmLink?%s.appendChild(window.__wmLink.chip(%s.t,%s.link)):%s.appendChild(document.createTextNode(%s.t))}' % (
    RENDER, el, rs.group(3), el, it, rs.group(3), it, el, CHIP, it, it, el, it, it, el, it)
s = s[:rs.start()] + expose + new_render + s[rs.end():]

# --- 3. readSegs ---
rd = one(r'function ([\w$]+)\(([\w$])\)\{let ([\w$])=\[\],([\w$])=([\w$])=>\{if\(!\5\)return;let ([\w$])=\3\[\3\.length-1\];\6&&\6\.t!=null\?\6\.t\+=\5:\3\.push\(\{t:\5\}\)\},([\w$])=([\w$])=>\{for\(let ([\w$]) of \8\.childNodes\)\9\.nodeType===3\?\4\(\9\.data\):\9\.nodeType===1&&\9\.dataset&&\9\.dataset\.ref\?\3\.push\(\{ref:\9\.dataset\.ref\}\)', s, 'readSegs')
READ = rd.group(1); arr, last, node = rd.group(3), rd.group(6), rd.group(9)
seg = rd.group(0)
seg = seg.replace('%s&&%s.t!=null?' % (last, last), '%s&&%s.t!=null&&!%s.link?' % (last, last, last), 1)
seg = seg.replace('%s.nodeType===1&&%s.dataset&&%s.dataset.ref?' % (node, node, node),
                  '%s.nodeType===1&&%s.dataset&&%s.dataset.link&&window.__wmLink?%s.push({t:%s.dataset.link,link:window.__wmLink.meta(%s)}):%s.nodeType===1&&%s.dataset&&%s.dataset.ref?' % (node, node, node, arr, node, node, node, node, node), 1)
s = s[:rd.start()] + seg + s[rd.end():]

# --- 2. MentionEditor paste ---
me = one(r'function ([\w$]+)\(\{value:[\w$],onChange:[\w$],onMention:([\w$]),placeholder:[\w$],single:([\w$])=!1,', s, 'MentionEditor')
MENTION, ONMENTION, SINGLE = me.groups()
mb = s[me.start():me.start() + 6000]
em = re.search(r'let ([\w$])=\(\)=>\{let [\w$]=' + re.escape(READ) + r'\(([\w$])\.current\)', mb)
EMIT, REF = em.group(1), em.group(2)
pa = re.search(r'([\w$])=([\w$])=>\{\2\.preventDefault\(\);let ([\w$])=\2\.clipboardData\.getData\("text/plain"\);document\.execCommand', mb)
a = me.start() + pa.start()
old = '%s=%s=>{%s.preventDefault();let %s=%s.clipboardData.getData("text/plain");' % (pa.group(1), pa.group(2), pa.group(2), pa.group(3), pa.group(2))
assert s[a:a + len(old)] == old
new = old + 'if(window.__wmLink&&window.__wmLink.paste(%s,%s.current,%s,%s,%s))return;' % (pa.group(3), REF, SINGLE, EMIT, ONMENTION)
s = s[:a] + new + s[a + len(old):]

# --- 1. 제작자 의견 → MentionEditor ---
km = one(r'\(0,([\w$]+)\.jsx\)\(' + re.escape(MENTION) + r',\{single:!0,label:.{0,500}?onMention:([\w$])=>([\w$]+)\(([\w$])\.id,\2\),peek:([\w$])\}\)', s, 'keyman editor')
JSXNS, ADDREF, PV, PEEK = km.group(1), km.group(3), km.group(4), km.group(5)
ts = one(r'\(0,[\w$]+\.jsx\)\(([\w$]+),\{refs:([\w$]+)\([\w$]\),peek:[\w$],size:"sm",className:"km-tags",linkedOf:([\w$]+)\([\w$]\),onLink:([\w$]+)\([\w$]\)\}\)', s, 'keyman tagstrip')
STRIP, SEGREFS, LINKED, RELINK = ts.groups()
nt = one(r'\(0,([\w$]+)\.jsx\)\("textarea",\{id:"f-note",className:"textarea",value:([\w$])\.note\|\|"",placeholder:"[^"]*",onChange:([\w$])=>\{let ([\w$])=\3\.target\.value;([\w$])\(([\w$])=>\{\6\.note=\4\}\)\}\}\)', s, 'note textarea')
NS, F, SET = nt.group(1), nt.group(2), nt.group(5)
ph = esc('제안 방향 · 강조할 점 — @로 제품 · 솔루션 · 유관사례 연결, 링크를 붙여 넣으면 바로 태그돼요')
lbl = esc('제작자 의견')
note = ('(0,{ns}.jsxs)("div",{{className:"note-ed",children:[(0,{ns}.jsx)({me},{{id:"f-note",label:"{lbl}",'
        'value:{f}.noteSegs&&window.__wmLink&&window.__wmLink.text({f}.noteSegs)===({f}.note||"")?{f}.noteSegs:{f}.note?[{{t:{f}.note}}]:[],'
        'placeholder:"{ph}",onChange:x=>{set}(y=>{{y.noteSegs=x,y.note=window.__wmLink?window.__wmLink.text(x):x.map(z=>z.t||"").join("")}}),'
        'onMention:x=>{add}({p}.id,x),peek:{peek}}}),(0,{ns}.jsx)({strip},{{refs:{segrefs}({f}.noteSegs),peek:{peek},size:"sm",className:"km-tags",linkedOf:{linked}({p}),onLink:{relink}({p})}})]}})').format(
    ns=NS, me=MENTION, lbl=lbl, f=F, ph=ph, set=SET, add=ADDREF, p=PV, peek=PEEK, strip=STRIP, segrefs=SEGREFS, linked=LINKED, relink=RELINK)
s = s[:nt.start()] + note + s[nt.end():]

# --- hints ---
h_old = esc('여기서도 @로 제품을 연결할 수 있어요.')
h_new = esc('여기서도 @로 제품 · 솔루션 · 유관사례를 연결하고, 링크를 붙여 넣으면 제목 · 썸네일로 태그돼요.')
if s.count(h_old) == 1: s = s.replace(h_old, h_new)
else: print('warn: keyman hint not found')
f_old = esc('제품 · 솔루션 · 유관사례를 바로 찾아 연결합니다.')
f_new = esc('제품 · 솔루션 · 유관사례를 바로 찾아 연결하고, 링크를 붙여 넣으면 제목 · 썸네일로 태그돼요.')
if s.count(f_old) == 1: s = s.replace(f_old, f_new)
else: print('warn: free hint not found')

# --- helper script + css ---
i = s.find('</style>'); assert i > 0
s = s[:i] + '\n' + CSS + s[i:]
j = s.find('<script id="wm-layouts"'); assert j > 0
assert '</script' not in JS.lower()
s = s[:j] + '<script>' + JS + '</script>\n' + s[j:]

open(dst, 'w', encoding='utf-8', newline='').write(s)
print('patched', dict(chip=CHIP, refInfo=REFINFO, render=RENDER, read=READ, editor=MENTION, emit=EMIT, maps=(PM, SM, CM)))
