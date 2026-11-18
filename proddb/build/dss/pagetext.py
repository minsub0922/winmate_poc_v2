"""페이지 글과 해시 — 전체 글, 그리고 메뉴 · 푸터를 뺀 본문 글.
메뉴 · 푸터의 홍보 문구는 받을 때마다 달라질 수 있어, 본문이 바뀌었는지는 본문 글 해시(main)로 본다."""
import hashlib, html, re


def text_of(fragment):
    body = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', fragment, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', body))).strip()


def main_of(page):
    """samsung.com/sec: '최근 본 제품' 레이어 뒤 ~ 푸터 '회사소개' 앞. 그 밖: header · nav · footer 요소를 뺀 나머지."""
    a = page.find('최근 본 제품은 30일간 보관됩니다')
    b = page.find('회사소개', a) if a >= 0 else -1
    if a >= 0 and b > a:
        return page[a:b]
    return re.sub(r'<(header|footer|nav)\b.*?</\1>', ' ', page, flags=re.S | re.I)


def hashes(page):
    sha = lambda s: hashlib.sha256(s.encode()).hexdigest()
    return sha(text_of(page)), sha(text_of(main_of(page)))
