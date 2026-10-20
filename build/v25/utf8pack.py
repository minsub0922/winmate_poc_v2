# 번들 JS 의 \uXXXX · \xXX 이스케이프(한글 등)를 UTF-8 글자로 되돌려 크기를 줄인다 — esbuild charset:'utf8' 과 같은 효과.
# 문자열 · 템플릿 · 정규식 안에서 같은 뜻. 앞의 역슬래시 개수가 짝수면(=글자 그대로의 \) 건드리지 않음.
# 줄 바꿈 계열(U+2028/2029) · 서로게이트 · BOM · 제어 문자 · ASCII 는 그대로 둔다. 게시 페이지 skeleton 이 meta charset=utf8 을 넣음.
# python3 utf8pack.py <in.html> <out.html>
import re, sys
def conv(js):
    out = []; last = 0; n = 0
    for m in re.finditer(r'(\\+)(u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2}))', js):
        bs = m.group(1)
        if len(bs) % 2 == 0: continue
        cp = int(m.group(3) or m.group(4), 16)
        if cp < 0xA0 or 0xD800 <= cp <= 0xDFFF or cp in (0x2028, 0x2029, 0xFEFF) or cp >= 0xFFF0 or 0x2000 <= cp <= 0x200F or cp in (0xAD,):
            continue
        out.append(js[last:m.start()] + bs[:-1] + chr(cp)); last = m.end(); n += 1
    out.append(js[last:])
    return ''.join(out), n
if __name__ == '__main__':
    src, dst = sys.argv[1:3]
    h = open(src, encoding='utf8').read()
    parts = re.split(r'(<script>[\s\S]*?</script>)', h)
    tot = 0
    for i, p in enumerate(parts):
        if p.startswith('<script>'):
            body, n = conv(p[8:-9]); parts[i] = '<script>' + body + '</script>'; tot += n
    o = ''.join(parts)
    open(dst, 'w', encoding='utf8').write(o)
    print('escapes', tot, 'bytes', len(h.encode()), '→', len(o.encode()))
