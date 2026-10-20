# Add the solution · case media notes to README.md (anchored edits — safe to run on a newer README; skips what is already there).
import sys, re
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
if 'mediapack.js' in s: print('already'); sys.exit(0)
def after_line(s, start, text):
    i = s.find('\n' + start); assert i >= 0, start
    j = s.find('\n', i + 1); return s[:j + 1] + text + '\n' + s[j + 1:]
s = after_line(s, '  prodpack.js ', '  mediapack.js        솔루션 17개 · 유관사례 218건의 실제 이미지 2,347장(data/media.json · img/media/ t.json 썸네일 + g0 · g1 갤러리 AVIF 묶음) — mediaThumb(카드) · mediaPhotos(hover 갤러리 · 참고 자료 이미지 줄) · mediaCover. 묶음 안 바이트 범위로 한 장씩 받음(bgpack.js registerRanges — Range를 무시하는 서버면 묶음 통째로 한 번). 출처 대장 src/media_sources.md · 만들기 build/media/README.md')
s = after_line(s, 'img/prod/ ', 'img/media/            솔루션 · 유관사례 이미지 묶음 3개 — t.json(카드 썸네일 235) · g0 · g1(갤러리 2,303, 긴 변 720px AVIF) — samsung.com 도입사례 원문 · 리포트 PDF · 영상, 솔루션 공식 · 업종 · 해외 페이지, 삼성 e-카탈로그 75쪽에서 모아 1차 선별 + 독립 검수(build/media/)')
s = after_line(s, 'node build/test-proddb.mjs', 'node build/test-media.mjs     # 솔루션 · 유관사례 실제 이미지(매칭 팝업 타일 전부 사진 · hover 갤러리 · 출처 표시 · 탐색기 사례 행 · 레이아웃 상세 이미지 줄 → 빈 칸에 넣기 → PPTX 에는 JPEG · 묶음 바이트 범위 정합 · Range 받기, RANGE=0 이면 Range 무시 서버로 묶음 통째 받기)')
old = re.search(r'\n- 썸네일을 실제 사진으로 바꾸려면:[^\n]*', s)
new = '\n- 썸네일 사진: 제품은 제품 DB 묶음(img/prod), 솔루션 17개 · 유관사례 218건은 연관 리소스에서 모은 실제 이미지(img/media · data/media.json, build/media/README.md)라 더미 일러스트는 사진을 받기 전에만 잠깐 보여요. 큐레이션 화면이 있던 MagicINFO · VXT · SmartThings Pro와 사례 1490(맥도날드)은 `data/images.json` 사진(catalog의 `img` · thumbs.jsx `CASE_IMG`)이 먼저예요.'
if old: s = s[:old.start()] + new + s[old.end():]
else: s = s.rstrip('\n') + '\n' + new + '\n'
open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched')
