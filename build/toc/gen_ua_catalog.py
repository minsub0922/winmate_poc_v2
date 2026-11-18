# 당사의 이해 — 업종 묶음별 항목 · 새 장을 admin/web/src/ua-catalog.json 으로 쓴다.
#   python3 build/toc/gen_ua_catalog.py            (묶음 전부 · 검사 포함)
#   python3 build/toc/gen_ua_catalog.py md ed      (그 묶음만 — 그릴 때 빨리 보려고. 업종 검사는 건너뛴다)
#   WINMATE_UA_CATALOG_OUT=<파일> 로 다른 곳에 쓸 수 있다.
# 지금은 관리자 「레이아웃 구성 관리」의 '전체 파트 확인하기' 팝업만 읽는다 — 앱의 레이아웃 목록(toc_layouts.js) · 실제 덱에는 아직 넣지 않았다.
#   장은 목차 템플릿 장과 같은 빌더 · 칸 이름 규칙으로 그려 두었으므로, 실제 덱에 쓸 때는 build/toc/layouts.py 의 build() 에 그대로 올리면 된다.
# 결과: { version, part, clusters: [{ id, name, cust, goal, verticals, sheets: [{ f, label, form, zero, group }] }],   (group: know 고객 이해 · compete 경쟁 우위)
#         layouts: { f: { code, name, when, html, slots, nT, nI } }, photos: { 주소: data URL } }
import importlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(HERE, 'ua'))
ORDER = ['fb', 'rt', 'ht', 'cu', 'of', 'rs', 'ed', 'pb', 'md', 'mf', 'fn', 'ma']   # 드롭다운 순서
FID = re.compile(r'^L_TOC_UA_([A-Z]{2})_[A-Z]+$')
PACKED = re.compile(r'data-fill="([^"]+\.json)#(\d+)"')
_packs = {}


def photo(address):
    """사진 묶음 주소(…json#k) → data URL (앱과 같은 자리: app/data/static/img, 없으면 img)"""
    path, k = address.rsplit('#', 1)
    if path not in _packs:
        file = next((p for p in (os.path.join(ROOT, 'app/data/static', path), os.path.join(ROOT, path)) if os.path.isfile(p)), None)
        if not file: raise SystemExit(f'사진 묶음이 없다: {path}')
        _packs[path] = json.load(open(file))['images']
    data = _packs[path][int(k)]
    if not str(data).startswith('data:image/'): raise SystemExit(f'사진이 아니다: {address}')
    return data


DIRECT = re.compile(r'<img src="((?!data:)[^"]+)"')
MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml'}


def picture(address):
    """그림 파일 주소(img/… · /assets/…) → data URL (앱이 주는 자리와 같은 순서로 찾는다)"""
    import base64
    rel = address.lstrip('/')
    places = [os.path.join(ROOT, 'app/web/public', rel)] if rel.startswith('assets/') else [os.path.join(ROOT, 'app/data/static', rel), os.path.join(ROOT, rel)]
    file = next((p for p in places if os.path.isfile(p)), None)
    mime = MIME.get(os.path.splitext(rel)[1].lower())
    if not file or not mime: raise SystemExit(f'그림 파일이 없거나 모르는 형식이다: {address}')
    return f'data:{mime};base64,' + base64.b64encode(open(file, 'rb').read()).decode()


def build(only=None):
    clusters, layouts, photos, seen_v = [], {}, {}, {}
    for key in only or ORDER:
        mod = importlib.import_module(key)
        C = dict(mod.CLUSTER); sheets = []
        for fn in mod.SHEETS:
            m = fn(); fid = m['f']; hit = FID.match(fid)
            if not hit or hit.group(1) != C['id']: raise SystemExit(f'{key}: 장 이름 규칙(L_TOC_UA_{C["id"]}_<항목>)에 맞지 않는다 — {fid}')
            if fid in layouts: raise SystemExit(f'장 이름이 겹친다: {fid}')
            for addr in sorted({a + '#' + k for a, k in PACKED.findall(m['html'])}): photos.setdefault(addr, photo(addr))
            for addr in sorted(set(DIRECT.findall(m['html']))): photos.setdefault(addr, picture(addr))
            sheets.append({'f': fid, 'label': m['label'], 'form': m['form'], 'zero': m['zero'], 'group': m['group']})
            layouts[fid] = {k: m[k] for k in ('code', 'name', 'when', 'html', 'slots', 'nT', 'nI')}
        if len(sheets) < 3: raise SystemExit(f'{key}: 항목이 3개보다 적다')
        for v in C['verticals']:
            if v in seen_v: raise SystemExit(f'업종 {v} 이 두 묶음에 있다: {seen_v[v]} · {C["id"]}')
            seen_v[v] = C['id']
        clusters.append({'id': C['id'], 'name': C['name'], 'cust': C['cust'], 'goal': C['goal'], 'verticals': C['verticals'], 'sheets': sheets})
    if not only:
        order = json.load(open(os.path.join(ROOT, 'app/web/src/domain/templates/toc_content.json')))['order']
        missing = [v for v in order if v not in seen_v]; extra = [v for v in seen_v if v not in order]
        if missing or extra: raise SystemExit(f'업종 묶음이 업종 목록과 다르다 — 빠짐 {missing} · 없는 업종 {extra}')
        registry = open(os.path.join(ROOT, 'app/web/src/domain/templates/toc_layouts.js')).read()
        clash = [fid for fid in layouts if f'"{fid}"' in registry]
        if clash: raise SystemExit(f'이미 있는 장과 이름이 같다: {clash}')
    return {'version': 1, 'part': 'ua', 'clusters': clusters, 'layouts': layouts, 'photos': photos}


if __name__ == '__main__':
    only = [a for a in sys.argv[1:] if a in ORDER] or None
    data = build(only)
    out = os.environ.get('WINMATE_UA_CATALOG_OUT') or os.path.join(ROOT, 'admin/web/src/ua-catalog.json')
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    open(out, 'w').write(text + '\n')
    print(f"묶음 {len(data['clusters'])} · 장 {len(data['layouts'])} · 사진 {len(data['photos'])} → {out} ({round(len(text) / 1024)} KB)")
