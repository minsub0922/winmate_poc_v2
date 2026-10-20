# 재현 명세(.txt) → 페이지별 JSON (제목 · 유형 · 구성 · 텍스트 행 · 블록 스타일 · 이미지)
import re, json, sys
def parse(path):
    L = open(path, encoding='utf-8').read().split('\n')
    pages = []; cur = None; sec = None
    for l in L:
        m = re.match(r'^P(\d\d)\. (.+)$', l)
        if m:
            cur = {'no': int(m.group(1)), 'title': m.group(2), 'type': '', 'desc': '', 'rules': [], 'rows': [], 'blocks': {}, 'imgs': []}
            pages.append(cur); sec = None; continue
        if cur is None: continue
        if l.startswith('유형: '): cur['type'] = l[4:]; continue
        if l.startswith('구성: '): cur['desc'] = l[4:]; continue
        if re.match(r'^4\.1 ', l): sec = 'rules'; continue
        if re.match(r'^4\.2 ', l): sec = 'rows'; continue
        if re.match(r'^4\.3 ', l): sec = 'blocks'; continue
        if re.match(r'^4\.4 ', l): sec = 'imgs'; continue
        if re.match(r'^4\.[5-9] ', l): sec = None; continue
        c = l.split('\t')
        if sec == 'rules' and l.strip(): cur['rules'].append(l.strip())
        elif sec == 'rows' and re.match(r'^P\d\d-T\d+-L\d+$', c[0]) and len(c) >= 4:
            cur['rows'].append({'id': c[0], 't': c[1], 'bbox': [float(x) for x in c[2].split(',')], 'bl': float(c[3])})
        elif sec == 'blocks' and re.match(r'^P\d\d-T\d+$', c[0]) and len(c) >= 6:
            cur['blocks'][c[0]] = {'role': c[1], 'bbox': [float(x) for x in c[2].split(',')], 'style': c[5]}
        elif sec == 'imgs' and re.match(r'^P\d\d-I\d+$', c[0]) and len(c) >= 8:
            cur['imgs'].append({'id': c[0], 'role': c[1], 'asset': c[2], 'px': c[3], 'bbox': [float(x) for x in c[4].split(',')], 'vis': [float(x) for x in c[5].split(',')], 'crop': c[6], 'op': c[7]})
    return pages
if __name__ == '__main__':
    for src, name in [('168f29c6', 'store'), ('72aa9382', 'office'), ('703d6097', 'apt')]:
        P = parse(f'/root/.claude/uploads/6103d908-a550-5eaf-9f55-de3553c615ca/{src}-attachment.txt')
        json.dump(P, open(f'/home/claude/v3/{name}.json', 'w'), ensure_ascii=False, indent=0)
        print(name, len(P), sum(len(p['rows']) for p in P), sum(len(p['imgs']) for p in P))
