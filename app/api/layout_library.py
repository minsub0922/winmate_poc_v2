"""Live layout edits shared by admin, the browser and the agents.

The generated KB remains a reproducible base. Stable slot ids and saved proposals are
preserved; deleting a layout retires it from new selections without removing its HTML.
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone
import fcntl
from functools import lru_cache
import gzip
from html import escape, unescape
import json
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[2]
MODES = {'ai': 'AI 작성', 'fixed': '고정', 'product': '제품 교체', 'solution': '솔루션 교체',
         'case': '사례 교체', 'pick': '후보 선택', 'section': '목차 번호'}
META_LIMITS = {'name': 120, 'when': 1000, 'g': 300, 'p': 40}
TAG = re.compile(r'<(/?)([a-zA-Z][\w:-]*)([^>]*)>')
ATTR = re.compile(r'([\w:-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')')
VOID = {'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track', 'col'}


def path() -> Path:
    return Path(os.environ.get('WINMATE_LAYOUT_LIBRARY', ROOT / 'app/data/runtime/layout_library.json'))


@lru_cache(maxsize=20)
def _read(name, stamp, size):
    raw = Path(name).read_bytes()
    return json.loads(gzip.decompress(raw) if name.endswith('.gz') else raw)


def read(file):
    file = Path(file)
    stat = file.stat()
    return _read(str(file), stat.st_mtime_ns, stat.st_size)


def load():
    try:
        value = read(path())
    except FileNotFoundError:
        return {'v': 1, 'rev': 0, 'items': {}}
    # Never silently revert to defaults on a corrupt live file.
    if not isinstance(value, dict) or value.get('v') != 1 or not isinstance(value.get('items'), dict):
        raise ValueError('레이아웃 관리 데이터를 읽지 못했습니다.')
    return value


def public():
    value = load()
    return {k: value[k] for k in ('v', 'rev', 'items')}


def protected_layouts(root=ROOT, layouts=None):
    """Composition references are never deletable, including a variant's parent.

    The checked-in inventory comes from the real composition builders. Custom
    parts are read on every request, including disabled/unassigned definitions.
    Read failures must stop deletion rather than silently removing protection.
    """
    from . import layout_presets
    protected = set(read(root / 'app/web/src/domain/templates/layout_cleanup_manifest.json')['protected'])
    try:
        custom = layout_presets.clean(read(layout_presets.path()))
    except FileNotFoundError:
        custom = {'parts': {}}
    for part in custom['parts'].values():
        protected.update(sheet['f'] for sheet in part['sheets'])
    layouts = base(root)[1] if layouts is None else layouts
    for f in list(protected):
        parent = layouts.get(f, {}).get('variantOf')
        if parent:
            protected.add(parent)
    for f, meta in layouts.items():
        if any(m['f'] in protected for m in meta.get('variants', [])):
            protected.add(f)
    return protected


def base(root=ROOT):
    kb = root / 'app/data/runtime/kb'
    catalog = read(kb / 'catalog.json')
    layouts = {x['f']: x for x in catalog['layouts']}
    layouts.update(read(kb / 'hidden_layouts.json'))
    return catalog, layouts, read(kb / 'layout_html.json.gz')


def nodes(html):
    out, stack = [], []
    for m in TAG.finditer(html):
        name = m[2].lower()
        if m[1]:
            for k in range(len(stack) - 1, -1, -1):
                if stack[k]['tag'] == name:
                    for n in stack[k:]:
                        n['close'] = m.start()
                    del stack[k:]
                    break
            continue
        n = {'tag': name, 'attrs': {a[1]: unescape(a[2] if a[2] is not None else a[3]) for a in ATTR.finditer(m[3])},
             'start': m.start(), 'open': m.end(), 'close': m.end()}
        out.append(n)
        if name not in VOID and not m[3].endswith('/'):
            stack.append(n)
    return out


def slots(html):
    found, out = set(), []
    for n in nodes(html):
        a = n['attrs']
        for kind, key in (('t', 'data-tb'), ('img', 'data-img')):
            if kind == 't' and 'data-img' in a:
                continue  # old picture placeholders carry both ids; they are image slots
            i = a.get(key)
            if i is None or not i.isdigit() or (kind, i) in found:
                continue
            found.add((kind, i))
            inner = html[n['open']:n['close']]
            text = unescape(re.sub(r'<[^>]*>', '', re.sub(r'<br\s*/?>', '\n', inner, flags=re.I)))
            im = next((x['attrs'] for x in nodes(inner) if x['tag'] == 'img'), {})
            out.append({'kind': kind, 'id': i, 'mode': a.get('data-fix') or 'ai',
                        'value': text if kind == 't' else a.get('data-fill') or im.get('data-fill') or a.get('src') or im.get('src') or '',
                        'label': a.get('data-hint') or im.get('alt') or ('텍스트 ' if kind == 't' else '이미지 ') + i})
    return out


def lock_for(ss):
    free = sum(s['mode'] == 'ai' for s in ss)
    if not free:
        return 'fixed' if all(s['mode'] in ('fixed', 'section') for s in ss) else 'data'
    return 'mostly' if free <= max(1, round(len(ss) * .2)) else 'ai'


def apply_html(html, item):
    """Patch only registered slots; preserve structure, styles and identifiers.

    An adopted design (item['design'], see design_check) replaces the sheet's base HTML first;
    the slot edits then apply to it exactly as to the base (same slot ids)."""
    html = design_html(item) or html
    if not item or not html:
        return html
    edits = []
    for n in nodes(html):
        a = n['attrs']
        kind = 'img' if 'data-img' in a else 't' if 'data-tb' in a else None
        if not kind:
            continue
        i = a['data-tb' if kind == 't' else 'data-img']
        tag = html[n['start']:n['open']]
        mode = item.get('modes', {}).get(kind, {}).get(i)
        if item.get('fill') == 'fixed':
            mode = 'section' if a.get('data-fix') == 'section' else 'fixed'
        if mode is not None:
            tag = re.sub(r'\sdata-fix="[^"]*"', '', tag)
            if mode != 'ai':
                tag = tag[:-1] + ' data-fix="' + mode + '">'
        if kind == 't' and i in item.get('t', {}):
            edits.append((n['open'], n['close'], escape(item['t'][i]).replace('\n', '<br>')))
        if kind == 'img' and i in item.get('img', {}):
            value = item['img'][i]
            src = escape(value, quote=True)
            inner = html[n['open']:n['close']]
            if n['tag'] == 'img':
                tag = re.sub(r'\s(?:src|data-fill|data-pid)="[^"]*"', '', tag)
                tag = tag[:-1] + f' src="{src}"' + (f' data-fill="{src}"' if re.search(r'\.json#\d+$', value) else '') + '>'
            else:
                inner = re.sub(r'\s(?:src|data-fill|data-pid)="[^"]*"', '', inner)
                inner = re.sub(r'<img\b', lambda m: m[0] + f' src="{src}"' + (f' data-fill="{src}"' if re.search(r'\.json#\d+$', value) else ''), inner, count=1)
                if '<img' not in inner:
                    inner = f'<img src="{src}"' + (f' data-fill="{src}"' if re.search(r'\.json#\d+$', value) else '') + ' style="width:100%;height:100%;object-fit:contain">'
                tag = re.sub(r'\s(?:data-fill|data-pid)="[^"]*"', '', tag)
                edits.append((n['open'], n['close'], inner))
        if tag != html[n['start']:n['open']]:
            edits.append((n['start'], n['open'], tag))
    for start, end, text in sorted(edits, reverse=True):
        html = html[:start] + text + html[end:]
    return html


# ---- 디자인(시트 HTML) 교체 — 관리자가 내보낸 디자인 코드를 code agent 가 고친 결과본.
# 칸(data-tb / data-img) 번호와 개수는 그대로여야 하고(저장된 제안서 · AI 채우기 · 정책이 칸 번호를 쓴다),
# data-fix(칸 정책)는 기본 장의 값으로 맞춘다. 스크립트 · 스타일 블록 · 외부 자원 · 이벤트 속성은 받지 않는다.
DESIGN_LIMIT = 400 * 1024
DESIGN_BANNED = {'script', 'style', 'link', 'meta', 'base', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input',
                 'textarea', 'select', 'button', 'template', 'noscript', 'video', 'audio', 'canvas', 'portal', 'foreignobject', 'html', 'head', 'body'}
DESIGN_FRAME_CSS = ('html,body{margin:0;background:#e9edf2}'
                    '[data-winmate-sheet]{width:1280px;height:720px;margin:24px auto;background:#fff;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12)}')
_BAD_URL = re.compile(r'^\s*(?:javascript|vbscript|data\s*:\s*text/html)', re.I)


def design_html(item):
    design = (item or {}).get('design')
    return design['html'] if isinstance(design, dict) and isinstance(design.get('html'), str) and design['html'] else None


def design_version(html):
    import hashlib
    return hashlib.sha1(html.encode('utf-8')).hexdigest()[:12]


def _slot_tags(html):
    """(kind, id) per slot element in document order — the same rule as slots(), duplicates kept."""
    out = []
    for n in nodes(html):
        a = n['attrs']
        if 'data-img' in a:
            out.append(('img', a['data-img'], n))
        elif 'data-tb' in a:
            out.append(('t', a['data-tb'], n))
    return out


def design_export(f, name, html, origin=''):
    ss = slots(html)
    nt, ni = sum(s['kind'] == 't' for s in ss), sum(s['kind'] == 'img' for s in ss)
    rules = f"""winmate layout design · {f} · {name}
version {design_version(html)}

이 파일의 시트 디자인을 고친 뒤 관리자 「레이아웃 관리 → {f} → Upload」로 올리면, 지금 디자인과 나란히 놓고 비교해 고를 수 있습니다.
지킬 것 (올릴 때 검사합니다):
1. <div data-winmate-sheet> 안의 시트 한 장만 고칩니다. 최상위 요소는 하나, style 에 width:1280px; height:720px.
2. 칸 = data-tb="번호"(글 {nt}개) · data-img="번호"(그림 {ni}개). 칸은 지우거나 · 번호를 바꾸거나 · 새로 만들거나 · 복제하지 않습니다.
   칸의 위치 · 크기 · 글꼴 · 색 · 장식은 자유롭게 바꿉니다. 칸 안의 글은 기본 문구라 바꿔도 되지만 실제 제안서에서는 AI · 사람이 채웁니다.
3. 스타일은 요소의 style 속성(인라인)으로만 씁니다. <style> · <script> · <link> · <iframe> · <form> · <video> · on…= 이벤트 속성 · javascript: 주소는 올릴 수 없습니다.
4. 이미지 주소(/img/… · /assets/… · …json#n)는 앱 자원이라 그대로 둡니다.
5. 글꼴은 'Noto Sans KR' 과 Manrope. 칸의 글이 길어져도 넘치거나 겹치지 않게 합니다.
6. data-fix(칸의 AI 정책) 값은 올릴 때 지금 값으로 맞춰집니다.

Code agent: edit only the markup inside <div data-winmate-sheet>. Keep every data-tb / data-img element (same ids, same count), inline styles only,
no <style>/<script>/event handlers, one 1280x720 root element."""
    base = f'<base href="{escape(origin, quote=True)}">' if origin else ''
    return (f'<!doctype html>\n<!--\n{rules.replace("--", "—")}\n-->\n<html lang="ko"><head><meta charset="utf-8"><title>{escape(name)} · {f}</title>{base}'
            f'<style>{DESIGN_FRAME_CSS}</style></head>\n<body>\n<div data-winmate-sheet="{escape(f, quote=True)}" data-winmate-version="{design_version(html)}">\n'
            f'{html}\n</div>\n</body></html>\n')


def design_check(text, base_html, current_html=None):
    """Uploaded design file → (sheet html, report). Raises ValueError with every problem found."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError('올린 파일이 비어 있습니다.')
    if len(text.encode('utf-8')) > DESIGN_LIMIT:
        raise ValueError(f'파일이 너무 큽니다({DESIGN_LIMIT // 1024}KB 까지).')
    warnings = []
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    all_nodes = nodes(text)
    wrap = next((n for n in all_nodes if 'data-winmate-sheet' in n['attrs']), None)
    exported = wrap['attrs'].get('data-winmate-version') if wrap else None
    if wrap:
        if wrap['close'] == wrap['open']:
            raise ValueError('data-winmate-sheet 요소가 닫히지 않았습니다.')
        outside = text[:wrap['start']] + text[wrap['close']:]
        if any(n['tag'] == 'style' for n in nodes(outside)) and re.sub(r'\s', '', ''.join(re.findall(r'<style[^>]*>(.*?)</style>', outside, flags=re.S | re.I))) != re.sub(r'\s', '', DESIGN_FRAME_CSS):
            warnings.append('시트 밖의 <style> 은 쓰이지 않습니다 — 인라인 style 만 반영됩니다.')
        html = text[wrap['open']:wrap['close']]
    else:
        body = next((n for n in all_nodes if n['tag'] == 'body'), None)
        html = text[body['open']:body['close']] if body and body['close'] > body['open'] else re.sub(r'<!doctype[^>]*>', '', text, flags=re.I)
    html = html.strip()
    problems = []
    ns = nodes(html)
    if not ns or ns[0]['start'] != 0:
        raise ValueError('시트 요소를 찾지 못했습니다. data-winmate-sheet 안에 1280×720 시트 한 장을 넣어 주세요.')
    root = ns[0]
    if root['tag'] in VOID or root['close'] == root['open'] and not html[:root['open']].endswith('/>'):
        problems.append('최상위 시트 요소가 닫히지 않았습니다')
    else:
        end = html.find('>', root['close']) + 1
        if html[end:].strip():
            problems.append('최상위 요소는 하나여야 합니다(시트 1280×720 한 장)')
    style = root['attrs'].get('style', '')
    if not re.search(r'(?:^|;)\s*width\s*:\s*1280px', style) or not re.search(r'(?:^|;)\s*height\s*:\s*720px', style):
        problems.append('최상위 요소의 style 에 width:1280px; height:720px 가 있어야 합니다')
    banned = sorted({n['tag'] for n in ns if n['tag'] in DESIGN_BANNED})
    if banned:
        problems.append('쓸 수 없는 태그: ' + ', '.join('<' + t + '>' for t in banned))
    attrs = set()
    for n in ns:
        for k, v in n['attrs'].items():
            key = k.lower()
            if key.startswith('on') or key in ('srcdoc', 'formaction', 'action'):
                attrs.add(key + '=')
            elif key in ('href', 'src', 'xlink:href', 'data-fill', 'style') and (_BAD_URL.search(v) or re.search(r'url\(\s*[\'"]?\s*(?:javascript|vbscript):', v, re.I)):
                attrs.add(key + '="javascript:…"')
            elif key == 'style' and re.search(r'expression\s*\(|@import|behavior\s*:', v, re.I):
                attrs.add('style 의 expression · @import')
    if attrs:
        problems.append('쓸 수 없는 속성: ' + ', '.join(sorted(attrs)))
    from collections import Counter
    want = Counter((k, i) for k, i, _ in _slot_tags(base_html))
    got = Counter((k, i) for k, i, _ in _slot_tags(html))
    name = lambda key: ('글 ' if key[0] == 't' else '그림 ') + key[1]
    missing = sorted(want - got, key=lambda x: (x[0], int(x[1]) if x[1].isdigit() else 0))
    extra = sorted(got - want, key=lambda x: (x[0], int(x[1]) if x[1].isdigit() else 0))
    if missing:
        problems.append('없어진 칸: ' + ', '.join(name(x) for x in missing))
    if extra:
        problems.append('새로 생긴(또는 복제된) 칸: ' + ', '.join(name(x) for x in extra))
    if problems:
        raise ValueError(' · '.join(problems))
    # 칸 정책(data-fix)은 기본 장의 값으로 맞춘다
    fix = {}
    for k, i, n in _slot_tags(base_html):
        fix.setdefault((k, i), n['attrs'].get('data-fix'))
    edits = []
    for k, i, n in _slot_tags(html):
        tag = html[n['start']:n['open']]
        new = re.sub(r'\sdata-fix\s*=\s*(?:"[^"]*"|\'[^\']*\')', '', tag)
        if fix.get((k, i)):
            cut = len(new) - (2 if new.endswith('/>') else 1)
            new = new[:cut] + f' data-fix="{fix[(k, i)]}"' + new[cut:]
        if new != tag:
            edits.append((n['start'], n['open'], new))
    for start, stop, value in sorted(edits, reverse=True):
        html = html[:start] + value + html[stop:]
    before = {(s['kind'], s['id']): s['value'] for s in slots(current_html or base_html)}
    changed = [s['id'] for s in slots(html) if s['kind'] == 't' and before.get(('t', s['id'])) is not None and before[('t', s['id'])].strip() != s['value'].strip()]
    current = design_version(current_html or base_html)
    if exported and exported != current:
        warnings.append('내려받은 뒤 이 레이아웃의 디자인이 바뀌었습니다 — 지금 디자인과 비교해 주세요.')
    if changed:
        warnings.append('기본 문구가 바뀐 글 칸: ' + ', '.join(changed[:12]) + (' …' if len(changed) > 12 else ''))
    ss = slots(html)
    report = {'slots': {'t': sum(s['kind'] == 't' for s in ss), 'img': sum(s['kind'] == 'img' for s in ss)}, 'size': len(html.encode('utf-8')),
              'version': design_version(html), 'current': current, 'same': design_version(html) == current, 'text_changed': changed, 'warnings': warnings}
    return html, report


def apply_meta(meta, item, html=None):
    value = {**meta, **item.get('meta', {})}
    if item.get('deleted'):
        value.update(removed=True, retired='removed')
    if html is not None:
        ss = slots(html)
        value.update(txt=' '.join(s['value'] for s in ss if s['kind'] == 't'), fx=lock_for(ss))
    return value


def effective_items(state, layouts):
    items = dict(state['items'])
    for f, meta in layouts.items():
        if items.get(meta.get('variantOf'), {}).get('deleted'):
            items[f] = {**items.get(f, {}), 'deleted': True}
    return items


def overlay_bundle(bundle):
    """Apply edits after validating the generated baseline; old ids stay resolvable."""
    state = load()
    if not state['items']:
        return bundle
    from dataclasses import replace
    layouts = {x['f']: x for x in bundle.catalog['layouts']}
    items = effective_items(state, layouts)
    html = dict(bundle.html)
    for f, item in items.items():
        if f in html:
            html[f] = apply_html(html[f], item)
    catalog = {**bundle.catalog, 'layouts': [apply_meta(m, items.get(m['f'], {}), html.get(m['f'])) if m['f'] in items else m for m in layouts.values()]}
    hidden = {f: apply_meta(m, items.get(f, {})) for f, m in bundle.hidden_layouts.items()}
    return replace(bundle, catalog=catalog, html=html, hidden_layouts=hidden,
                   manifest={**bundle.manifest, 'layout_library_rev': state['rev']})


def clean(body, html, parts):
    if not isinstance(body, dict) or set(body) - {'rev', 'meta', 't', 'img', 'modes', 'fill', 'confirmed'}:
        raise ValueError('수정 값을 확인해 주세요.')
    valid = {k: {s['id'] for s in slots(html) if s['kind'] == k} for k in ('t', 'img')}
    meta = body.get('meta', {})
    if not isinstance(meta, dict) or set(meta) - META_LIMITS.keys():
        raise ValueError('레이아웃 기본 정보를 확인해 주세요.')
    for k, v in meta.items():
        if not isinstance(v, str) or (k in ('name', 'p') and not v.strip()) or len(v) > META_LIMITS[k] or (k == 'p' and v not in parts):
            raise ValueError('이름 · 분류 · 설명의 입력값을 확인해 주세요.')
    out = {'meta': {k: v.strip() for k, v in meta.items()}}
    for kind in ('t', 'img'):
        values = body.get(kind, {})
        if not isinstance(values, dict) or set(values) - valid[kind]:
            raise ValueError('존재하지 않는 칸입니다. 레이아웃을 다시 열어 주세요.')
        for v in values.values():
            if not isinstance(v, str) or len(v) > (10000 if kind == 't' else 2000):
                raise ValueError('칸의 내용이 너무 길거나 형식이 잘못되었습니다.')
            if kind == 'img' and not re.fullmatch(r'(?:https://[^\s<>"\']+|/?(?:img|assets|lib)/[\w./#%+?=&\-]+)', v):
                raise ValueError('이미지는 HTTPS 주소 또는 앱 이미지 경로를 입력해 주세요.')
            if kind == 'img' and ('..' in v or '\\' in v):
                raise ValueError('이미지 경로를 확인해 주세요.')
        out[kind] = values
    modes = body.get('modes', {})
    if not isinstance(modes, dict) or set(modes) - {'t', 'img'}:
        raise ValueError('AI 채움 설정을 확인해 주세요.')
    for k, values in modes.items():
        if not isinstance(values, dict) or set(values) - valid[k] or any(v not in MODES for v in values.values()):
            raise ValueError('AI 채움 설정에 알 수 없는 칸이나 구분이 있습니다.')
    out['modes'] = modes
    fill = body.get('fill', 'inherit')
    if fill not in ('inherit', 'slots', 'fixed'):
        raise ValueError('장 전체의 채움 방식을 확인해 주세요.')
    out['fill'] = fill
    return out


class Conflict(ValueError):
    pass


def policy(item):
    return {'fill': item.get('fill', 'inherit'), 't': item.get('modes', {}).get('t', {}), 'img': item.get('modes', {}).get('img', {})}


def save(f, item, rev, actor='admin', policy_family=()):
    target = path()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.with_suffix('.lock').open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        previous = load()
        if type(rev) is not int or previous['rev'] != rev:
            raise Conflict('다른 창에서 레이아웃을 변경했습니다. 다시 불러온 뒤 수정해 주세요.')
        if item.get('deleted') and f in protected_layouts():
            raise Conflict('레이아웃 구성 관리에서 사용하는 레이아웃은 삭제할 수 없습니다.')
        now = datetime.now(timezone.utc).isoformat()
        value = copy.deepcopy(previous)
        value['items'][f] = {**item, 'updated_at': now, 'updated_by': actor}
        # One structure has one slot policy, including its industry content candidates.
        # Content and metadata stay specific to the edited sheet. The entire policy
        # change is committed with the same lock and revision as the edited sheet.
        if policy(item) != policy(previous['items'].get(f, {})):
            for sibling in policy_family:
                if sibling == f:
                    continue
                value['items'][sibling] = {**value['items'].get(sibling, {}),
                                           'modes': copy.deepcopy(item.get('modes', {})), 'fill': item.get('fill', 'inherit'),
                                           'updated_at': now, 'updated_by': actor}
        value.update(rev=rev + 1, updated_at=now, updated_by=actor)
        fd, tmp = tempfile.mkstemp(prefix='.layout-library-', dir=target.parent)
        try:
            with os.fdopen(fd, 'w') as out:
                json.dump(value, out, ensure_ascii=False)
                out.flush()
                os.fsync(out.fileno())
            os.replace(tmp, target)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        return value
