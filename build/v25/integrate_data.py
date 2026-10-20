# bs23–25 넣을 데이터 한 곳에서 — integrate.py(소스) · bundle_patch.py(게시본) 가 같이 씀
import sys
sys.path.insert(0, '/home/claude/v3')
import build_new, resolve
DECKS = [('bs23', 'st', 'store'), ('bs24', 'of', 'office'), ('bs25', 'ap', 'apt')]
CANVAS = 'PPT · 표준 제안서 · 2025 버티컬 AI 스토어 · 오피스 · 아파트 (명세 복원 · Winmate에서 추가)'
DECK_FULL = '표준 제안서 양식 · 호텔 AI 스테이 37장 · AI 스토어 38장 · AI 오피스 38장 · AI 아파트 37장 · 공유오피스 Lite 15장 (samsung.com 사진)'
def collect(final=True):
    html, meta = build_new.build(final=final)
    if final:
        for f, h in html.items(): assert 'v-missing' not in h, f'{f}: 사진 없음'
    cust, fills = {}, {}
    for sid, d, _ in DECKS:
        cust[sid] = __import__(resolve.MOD[d]).CUST
        sl, miss = resolve.slides(d, final=final)
        assert not final or not miss, (sid, miss[:5])
        fills[sid] = [{k: v for k, v in x.items() if k != 'label'} for x in sl]
    return dict(html=html, meta=meta, cust=cust, fills=fills, canvas=CANVAS, deck_full=DECK_FULL)
