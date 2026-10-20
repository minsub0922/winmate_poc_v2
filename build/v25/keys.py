# '@key' → 앱 주소 (새 사진은 덱 묶음 img/fill/v-<deck>.json#i, 재사용은 앱 기존 주소)
import json, os
DECKS = {'st': 'store', 'of': 'office', 'ap': 'apt'}
BUNDLE = {'store': 'v25', 'office': 'v25', 'apt': 'v25'}  # 세 덱 사진을 묶음 하나로(게시 파일 수 한도 511)
def manifest(deck):
    p = f'/home/claude/v3/img/{deck}/manifest.json'
    return json.load(open(p)) if os.path.exists(p) else []
def bundle_order(deck=None):
    """새 사진의 묶음 순서 = 스토어 · 오피스 · 아파트 manifest 순서(new 만). deck 을 주면 그 덱 것만(묶음 파일 만들 때는 None)"""
    decks = [deck] if deck else ['store', 'office', 'apt']
    return [m['key'] for d in decks for m in manifest(d) if m['status'] == 'new']
_cache = {}
def lookup(key):
    deck = DECKS[key.split('_')[0]]
    if deck not in _cache: _cache[deck] = {m['key']: m for m in manifest(deck)}
    return _cache[deck].get(key)
def app_addr(key):
    """'@st_p12' → 'img/fill/v25.json#3' | 'img/ph/x.jpg' | None"""
    k = key.lstrip('@'); m = lookup(k)
    if not m or m['status'] == 'missing': return None
    if m['status'] == 'reuse': return m['ref']
    deck = DECKS[k.split('_')[0]]
    return f'img/fill/{BUNDLE[deck]}.json#{bundle_order().index(k)}'
def alt(key):
    m = lookup(key.lstrip('@')); return (m or {}).get('alt', '')
def preview_src(key):
    """미리보기용: 새 사진은 로컬 파일, 재사용은 앱 주소 그대로"""
    k = key.lstrip('@'); m = lookup(k)
    if not m or m['status'] == 'missing': return None
    return m['file'] if m['status'] == 'new' else m['ref']
