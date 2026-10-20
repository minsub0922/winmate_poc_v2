"""RFP → 고객 요구사항 정리 파이프라인 (실험용, 표준 라이브러리만 사용).

흐름
  0. chunk        구조 인식 분할 — 제목 경로 유지, 표는 행 단위로만 자르고 이어지는 조각에 표 머리를 다시 붙임
  1. profile      문서 지도(제목 · 첫 줄만 모은 개요)로 사업(프로젝트) · 고객 · 담당 부서를 먼저 파악 → 전역 맥락
  2. extract      조각을 순서대로 읽으며 요구사항을 원자 단위로 뽑음. 매 호출에 전역 맥락 + 지금까지의 원장(ledger)
                  + 직전 조각의 이월 메모(carry) + 미해결 참조(붙임 3 참조 등)를 함께 넣어 맥락을 이어감
  3. consolidate  원장 ID만으로 키맨 배정 · 중복 병합 · 요약 · 평가 구조 · 확인 필요를 결정(본문은 원장에서 조립 → 누락 · 환각 방지)
  4. guard        근거 인용 대조(grounding), 출력 숫자의 원문 존재 확인, 병합 안전성 검사
  (선택) enrich   Tavily로 확인 필요 용어(인증 · 법 조항 등) 출처 수집 — 요구사항 본문에는 섞지 않음

백엔드
  gemini  Gemini REST(generateContent, JSON 응답 스키마) — 호출은 results/cache 에 기록
  replay  기록된 응답만 재생(네트워크 없이 같은 결과 재현)
  rules   규칙 기반 추출(LLM 없이 같은 파이프라인을 돌리는 기준선)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

HERE = Path(__file__).resolve().parent
POC = HERE.parent

CATS = ['배경', '범위', '규격', '보안', '인증', '구성', '검증', '선정', '자격', '일정', '제출', '형식',
        '가격', '계약', '납품', '설치', 'A/S', '유의', '무효', '청렴', '문의', '기타']
MODALITY = ['필수', '금지', '기준', '조건', '선택', '정보']


# ---------------------------------------------------------------- env
def load_env(path: Optional[Path] = None) -> Dict[str, str]:
    """poc/.env 를 읽어 os.environ 보다 낮은 우선순위로 합친다(값은 출력하지 않음)."""
    path = path or (POC / '.env')
    env: Dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$', line)
            if m and not line.lstrip().startswith('#'):
                v = m.group(2).strip().strip('"').strip("'")
                env[m.group(1)] = v
    for k in ('GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_BASE_URL', 'TAVILY_API_KEY'):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def available_keys(env: Dict[str, str]) -> Dict[str, bool]:
    example = POC / '.env.example'
    names = []
    if example.exists():
        names = [m.group(1) for m in re.finditer(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=', example.read_text(encoding='utf-8'), re.M)]
    return {k: bool(env.get(k)) for k in (names or ['GEMINI_API_KEY', 'GEMINI_MODEL', 'TAVILY_API_KEY'])}


# ---------------------------------------------------------------- text utils
def clean_markdown(s: str) -> str:
    return s.replace('<br>', '\n').replace('**', '').replace('`', '')


def norm(s: str) -> str:
    """대조용 정규화 — 공백 · 마크다운 장식 제거, 소문자."""
    s = s.lower().replace('<br>', '')
    s = re.sub(r'[\s*`#|>]+', '', s)
    s = s.replace('時', '시').replace('∼', '~').replace('–', '-').replace('—', '-').replace('“', '"').replace('”', '"').replace('’', "'").replace('‘', "'")
    return s


def grams(s: str, n: int = 3) -> set:
    return {s[i:i + n] for i in range(max(0, len(s) - n + 1))}


def grounded(quote: str, source_norm: str) -> bool:
    q = norm(quote)
    if len(q) < 4:
        return False
    if q in source_norm:
        return True
    g = grams(q)
    if not g:
        return False
    hit = sum(1 for x in g if x in source_norm)
    return hit / len(g) >= 0.85


UNIT = r'(?:%|대|개|일|시|년|개월|주|ms|hz|w|gb|cd|kg|점|인치|ppm|mhz|분|회|명|매|포트|port)'
NUM_RE = re.compile(r'(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s*(' + UNIT + r')', re.I)


def numbers_with_units(s: str) -> List[str]:
    out = []
    for m in NUM_RE.finditer(s):
        out.append(m.group(1).replace(',', '') + m.group(2).lower())
    return out


def unsupported_numbers(text: str, source: str) -> List[str]:
    src = norm(source).replace(',', '')
    bad = []
    for tok in numbers_with_units(text):
        alt = {tok}
        m = re.match(r'^(\d+)시$', tok)
        if m:
            alt.add(m.group(1) + ':00')
        alt.add(tok.replace('포트', 'port'))
        if any(a in src for a in alt):
            continue
        # 개수 단위는 표 칸의 숫자(| 500 |)나 '*2' 표기에서 단위만 붙인 경우를 인정
        m = re.match(r'^(\d+)(대|개|포트|port|매|명|회)$', tok)
        if m:
            n = m.group(1)
            if (len(n) >= 2 and re.search(r'(?<![\d.,])' + n + r'(?![\d.,])', src)) or re.search(r'[*x×]\s*' + n + r'(?!\d)', source):
                continue
        bad.append(tok)
    return sorted(set(bad))


def jaccard(a: str, b: str) -> float:
    ga, gb = grams(norm(a), 2), grams(norm(b), 2)
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


# ---------------------------------------------------------------- chunking
HEAD_PATTERNS = [
    re.compile(r'^(#{1,6})\s+(.*)$'),
    re.compile(r'^((?:Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ|Ⅶ|Ⅷ|Ⅸ|Ⅹ)\.)\s*(.*)$'),
    re.compile(r'^(\[(?:붙임|별지|별첨|참고)[^\]]*\])\s*(.*)$'),
    re.compile(r'^(\((?:별첨|붙임)\s*\d+\))\s*(.*)$'),
]


def heading_of(line: str):
    s = line.strip()
    m = HEAD_PATTERNS[0].match(s)
    if m:
        return len(m.group(1)), m.group(2).strip()
    for pat, lvl in ((HEAD_PATTERNS[1], 2), (HEAD_PATTERNS[2], 4), (HEAD_PATTERNS[3], 4)):
        m = pat.match(s)
        if m:
            return lvl, (m.group(1) + ' ' + m.group(2)).strip()
    return None


@dataclass
class Chunk:
    idx: int
    path: List[str]
    text: str
    start_line: int
    end_line: int  # exclusive
    table_header: str = ''

    def breadcrumb(self) -> str:
        return ' > '.join(self.path[-3:])


def chunk_text(text: str, max_chars: int = 3000) -> List[Chunk]:
    """구조 인식 분할. 모든 줄은 정확히 한 조각에 들어가고(줄 범위가 겹치지 않음),
    - 제목 경계에서 우선 자르고(조각이 60% 이상 찼을 때 새 제목이 오면 거기서 끊음)
    - 표는 행 단위로만 자르며, 표 중간에서 시작하는 조각에는 표 머리행을 다시 붙인다(맥락 유지)."""
    lines = text.split('\n')
    units = []  # dict(s, e, path, head_lvl, row, thead)
    stack: List[tuple] = []
    path: List[str] = []
    thead = ''
    i = 0
    while i < len(lines):
        ln = lines[i]
        h = heading_of(ln)
        if h:
            lvl, title = h
            while stack and stack[-1][0] >= lvl:
                stack.pop()
            stack.append((lvl, title))
            path = [t for _, t in stack]
            thead = ''
            units.append({'s': i, 'e': i + 1, 'path': list(path), 'head': lvl, 'row': False, 'thead': ''})
            i += 1
            continue
        if ln.lstrip().startswith('|'):
            if i + 1 < len(lines) and re.match(r'^\s*\|\s*:?-{2,}', lines[i + 1]):
                thead = ln + '\n' + lines[i + 1]
                units.append({'s': i, 'e': i + 2, 'path': list(path), 'head': 0, 'row': True, 'thead': '', 'is_thead': True})
                i += 2
                continue
            j = i + 1  # 한 행이 여러 줄(셀 안 줄바꿈)일 수 있음: 다음 '|' 시작 줄 또는 빈 줄 전까지
            if not ln.rstrip().endswith('|') or ln.strip() == '|':
                while j < len(lines) and lines[j].strip() and not lines[j].lstrip().startswith('|') and not heading_of(lines[j]):
                    j += 1
                    if lines[j - 1].rstrip().endswith('|'):
                        break
            units.append({'s': i, 'e': j, 'path': list(path), 'head': 0, 'row': True, 'thead': thead})
            i = j
            continue
        j = i + 1
        while j < len(lines) and lines[j].strip() and not heading_of(lines[j]) and not lines[j].lstrip().startswith('|'):
            j += 1
        while j < len(lines) and not lines[j].strip():  # 뒤따르는 빈 줄은 앞 단위에 붙임
            j += 1
        if not ln.strip() and units:
            units[-1]['e'] = j
        else:
            units.append({'s': i, 'e': j, 'path': list(path), 'head': 0, 'row': False, 'thead': thead if False else ''})
        i = j
    if not units:
        return [Chunk(0, [], text, 0, len(lines))]
    # 줄 범위가 빈틈없이 이어지도록 보정
    for k in range(len(units) - 1):
        units[k]['e'] = units[k + 1]['s']
    units[-1]['e'] = len(lines)

    size = lambda u: sum(len(x) + 1 for x in lines[u['s']:u['e']])  # noqa: E731
    chunks: List[Chunk] = []
    cur: List[dict] = []
    cur_size = 0

    def flush():
        nonlocal cur, cur_size
        if not cur:
            return
        s, e = cur[0]['s'], cur[-1]['e']
        body = '\n'.join(lines[s:e])
        hdr = cur[0]['thead'] if cur[0]['row'] and not cur[0].get('is_thead') else ''
        if hdr:
            body = '(표 계속 — 머리행)\n' + hdr + '\n' + body
        chunks.append(Chunk(len(chunks), cur[0]['path'], body, s, e, hdr))
        cur, cur_size = [], 0

    for u in units:
        us = size(u)
        if cur and (cur_size + us > max_chars or (u['head'] and u['head'] <= 4 and cur_size >= 0.6 * max_chars)):
            # 제목 줄은 다음 단위와 같이 가도록, 직전이 제목뿐이면 그 제목을 다음 조각으로 넘김
            carry_heads = []
            while cur and cur[-1]['head']:
                carry_heads.insert(0, cur.pop())
            flush()
            for hu in carry_heads:
                cur.append(hu)
                cur_size += size(hu)
        cur.append(u)
        cur_size += us
    flush()
    return chunks


def outline(text: str, max_chars: int = 6000) -> str:
    """문서 지도: 제목 줄 + 각 제목 아래 첫 내용 줄. 긴 문서도 짧게."""
    lines = text.split('\n')
    out = []
    take_next = False
    for i, ln in enumerate(lines):
        h = heading_of(ln)
        if h:
            out.append(f'L{i + 1}: ' + ln.strip())
            take_next = True
        elif take_next and ln.strip():
            out.append(f'L{i + 1}:   ' + ln.strip()[:120])
            take_next = False
        elif re.search(r'(☎|tel|e-?mail|@|담당|문의)', ln, re.I) and ln.strip():
            out.append(f'L{i + 1}:   ' + ln.strip()[:140])
    s = '\n'.join(out)
    return s[:max_chars]


# ---------------------------------------------------------------- LLM backends
class BackendError(RuntimeError):
    pass


def _schema(t, **kw):
    d = {'type': t}
    d.update(kw)
    return d


S_STR, S_INT = _schema('STRING'), _schema('INTEGER')
SCHEMA_PROFILE = _schema('OBJECT', properties={
    'doc_type': S_STR,
    'projects': _schema('ARRAY', items=_schema('OBJECT', properties={
        'pid': S_STR, 'name': S_STR, 'customer': S_STR, 'issuer': S_STR, 'start_line': S_INT,
        'contacts': _schema('ARRAY', items=_schema('OBJECT', properties={'dept': S_STR, 'title': S_STR, 'duty': S_STR}, required=['dept', 'duty'])),
    }, required=['pid', 'name', 'customer', 'start_line'])),
    'glossary': _schema('ARRAY', items=S_STR),
}, required=['projects'])
SCHEMA_CHUNK = _schema('OBJECT', properties={
    'items': _schema('ARRAY', items=_schema('OBJECT', properties={
        'pid': S_STR, 'cat': _schema('STRING', enum=CATS), 'text': S_STR, 'quote': S_STR,
        'modality': _schema('STRING', enum=MODALITY), 'section': S_STR,
    }, required=['pid', 'cat', 'text', 'quote', 'modality'])),
    'updates': _schema('ARRAY', items=_schema('OBJECT', properties={'id': S_STR, 'add': S_STR, 'quote': S_STR}, required=['id', 'add', 'quote'])),
    'open_refs': _schema('ARRAY', items=S_STR),
    'resolved_refs': _schema('ARRAY', items=S_STR),
    'carry': S_STR,
}, required=['items', 'carry'])
SCHEMA_CONSOLIDATE = _schema('OBJECT', properties={
    'project': S_STR, 'customer': S_STR, 'target': S_STR,
    'keymen': _schema('ARRAY', items=_schema('OBJECT', properties={
        'name': S_STR, 'weight': S_INT, 'weight_basis': S_STR, 'req_ids': _schema('ARRAY', items=S_STR),
        'groups': _schema('ARRAY', items=_schema('OBJECT', properties={'tag': S_STR, 'ids': _schema('ARRAY', items=S_STR)}, required=['tag', 'ids'])),
    }, required=['name', 'weight', 'req_ids'])),
    'merges': _schema('ARRAY', items=_schema('OBJECT', properties={'keep': S_STR, 'drop': _schema('ARRAY', items=S_STR)}, required=['keep', 'drop'])),
    'free': S_STR, 'evaluation': S_STR,
    'pitfalls': _schema('ARRAY', items=S_STR), 'to_confirm': _schema('ARRAY', items=S_STR),
}, required=['project', 'customer', 'keymen', 'free'])
SCHEMAS = {'profile': SCHEMA_PROFILE, 'extract': SCHEMA_CHUNK, 'gapfill': SCHEMA_CHUNK, 'consolidate': SCHEMA_CONSOLIDATE}


@dataclass
class CallLog:
    stage: str
    key: str
    ms: int
    prompt_tokens: int = 0
    output_tokens: int = 0
    cached: bool = False
    error: str = ''


class Backend:
    name = 'base'

    def __init__(self):
        self.calls: List[CallLog] = []

    def complete(self, stage: str, system: str, user: str, meta: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError


def _cache_key(model: str, stage: str, system: str, user: str) -> str:
    return hashlib.sha256((model + '\x00' + stage + '\x00' + system + '\x00' + user).encode('utf-8')).hexdigest()[:24]


class GeminiBackend(Backend):
    """Gemini generateContent REST. 응답은 cache_dir 에 저장해 replay 로 재현할 수 있다."""
    name = 'gemini'
    DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta'

    def __init__(self, api_key: str, model: str, cache_dir: Path, temperature: float = 0.1, timeout: int = 180, use_schema: bool = True,
                 rpm: int = 30, verbose: bool = True, base_url: str = ''):
        super().__init__()
        self.base = (base_url or self.DEFAULT_BASE).rstrip('/')  # 사내 게이트웨이 등 다른 경로를 쓰려면 GEMINI_BASE_URL
        if not api_key:
            raise BackendError('GEMINI_API_KEY 가 비어 있어요 (poc/.env)')
        self.key, self.model, self.cache_dir = api_key, model, cache_dir
        self.temperature, self.timeout, self.use_schema = temperature, timeout, use_schema
        self.min_gap = 60.0 / rpm if rpm else 0.0
        self.verbose = verbose
        self._last = 0.0
        cache_dir.mkdir(parents=True, exist_ok=True)

    def preflight(self) -> str:
        """모델 이름이 맞는지 먼저 확인한다. 틀리면 비슷한 모델 목록을 알려 준다."""
        def get(url):
            req = urllib.request.Request(url, headers={'x-goog-api-key': self.key})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode('utf-8'))
        try:
            info = get(f'{self.base}/models/{self.model}')
            return f"모델 확인: {info.get('name')} · 입력 한도 {info.get('inputTokenLimit')} · 출력 한도 {info.get('outputTokenLimit')}"
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise BackendError(f'모델 확인 실패 HTTP {e.code}: ' + e.read().decode('utf-8', 'replace')[:300])
        lst = get(f'{self.base}/models?pageSize=200')
        names = [m['name'].split('/')[-1] for m in lst.get('models', []) if 'generateContent' in (m.get('supportedGenerationMethods') or [])]
        near = [n for n in names if 'flash' in n] or names
        raise BackendError(f"모델 '{self.model}' 을 찾을 수 없어요. poc/.env 의 GEMINI_MODEL 을 다음 중 하나로: {', '.join(near[:12])}")

    def _post(self, body: dict) -> dict:
        req = urllib.request.Request(f'{self.base}/models/{self.model}:generateContent', data=json.dumps(body).encode('utf-8'), method='POST',
                                     headers={'content-type': 'application/json', 'x-goog-api-key': self.key})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read().decode('utf-8'))

    def complete(self, stage, system, user, meta):
        key = _cache_key(self.model, stage, system, user)
        f = self.cache_dir / f'{stage}-{key}.json'
        if f.exists():
            rec = json.loads(f.read_text(encoding='utf-8'))
            self.calls.append(CallLog(stage, key, 0, rec.get('prompt_tokens', 0), rec.get('output_tokens', 0), cached=True))
            return rec['data']
        cap = {'profile': 2048, 'consolidate': 8192}.get(stage, 32768 if meta.get('single') else 12288)
        gen = {'temperature': self.temperature, 'responseMimeType': 'application/json', 'maxOutputTokens': cap}
        if self.use_schema:
            gen['responseSchema'] = SCHEMAS[stage]
        body = {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': [{'text': user}]}], 'generationConfig': gen}
        t0, last = time.time(), ''
        parse_fail = 0
        for attempt in range(6):
            wait = self._last + self.min_gap - time.time()
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()
            try:
                res = self._post(body)
                cand = (res.get('candidates') or [{}])[0]
                text = ''.join(p.get('text', '') for p in (cand.get('content') or {}).get('parts', []))
                if cand.get('finishReason') == 'MAX_TOKENS' or degenerate(text):
                    # 같은 문장을 되풀이하는 폭주(작은 모델의 JSON 모드에서 흔함) → 온도를 올려 한 번 더, 그래도면 실패
                    last = '출력 한도 초과(MAX_TOKENS)' + (' · 반복 폭주' if degenerate(text) else ' — 입력이 길어 한 번에 정리하지 못함')
                    self.degenerate_retries = getattr(self, 'degenerate_retries', 0) + 1
                    if gen['temperature'] < 0.85:  # 0.1 → 0.6 → 0.9 순서로 두 번까지 다시
                        gen['temperature'] = 0.6 if gen['temperature'] < 0.5 else 0.9
                        continue
                    break
                if not text:
                    last = f"빈 응답(finishReason={cand.get('finishReason')}, block={res.get('promptFeedback', {}).get('blockReason')})"
                    break
                try:
                    data = parse_json(text)
                except ValueError as e:
                    parse_fail += 1
                    last = f'JSON 해석 실패: {e}'
                    if parse_fail >= 2:
                        break
                    continue
                um = res.get('usageMetadata', {})
                rec = {'stage': stage, 'model': self.model, 'meta': meta, 'prompt_tokens': um.get('promptTokenCount', 0),
                       'output_tokens': um.get('candidatesTokenCount', 0), 'data': data, 'raw_text': text}
                f.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding='utf-8')
                self.calls.append(CallLog(stage, key, int((time.time() - t0) * 1000), rec['prompt_tokens'], rec['output_tokens']))
                if self.verbose:
                    print(f"    · {stage:<11} {meta.get('idx', '') if isinstance(meta, dict) else ''} {int((time.time() - t0) * 1000)}ms  in {rec['prompt_tokens']} / out {rec['output_tokens']} tok", flush=True)
                return data
            except urllib.error.HTTPError as e:
                detail = e.read().decode('utf-8', 'replace')[:400]
                last = f'HTTP {e.code}: {detail}'
                if e.code == 400 and 'schema' in detail.lower() and 'responseSchema' in gen:
                    gen.pop('responseSchema')  # 스키마 미지원 모델이면 JSON 모드로만 재시도
                    continue
                if e.code in (429, 500, 502, 503, 504):
                    time.sleep(min(60, 2 ** attempt * 3))
                    continue
                break
            except (urllib.error.URLError, TimeoutError, KeyError, IndexError) as e:
                last = f'{type(e).__name__}: {e}'
                time.sleep(min(20, 2 ** attempt))
        self.calls.append(CallLog(stage, key, int((time.time() - t0) * 1000), error=last))
        raise BackendError(f'Gemini 호출 실패 ({stage}): {last}')


class ReplayBackend(Backend):
    name = 'replay'

    def __init__(self, model: str, cache_dir: Path):
        super().__init__()
        self.model, self.cache_dir = model, cache_dir

    def complete(self, stage, system, user, meta):
        key = _cache_key(self.model, stage, system, user)
        f = self.cache_dir / f'{stage}-{key}.json'
        if not f.exists():
            raise BackendError(f'replay 캐시 없음: {f.name} — 먼저 --backend gemini 로 실행해 주세요')
        rec = json.loads(f.read_text(encoding='utf-8'))
        self.calls.append(CallLog(stage, key, 0, rec.get('prompt_tokens', 0), rec.get('output_tokens', 0), cached=True))
        return rec['data']


def degenerate(text: str, unit: int = 40, times: int = 6) -> bool:
    """같은 40자 이상 구절이 6번 넘게 되풀이되면 폭주로 본다."""
    if len(text) < unit * times:
        return False
    for i in range(0, len(text) - unit, max(1, len(text) // 50)):
        frag = text[i:i + unit]
        if frag.strip() and '"' not in frag and text.count(frag) >= times:  # 한 문자열 값 안에서의 되풀이만
            return True
    return False


def parse_json(text: str) -> Any:
    text = text.strip()
    m = re.search(r'```(?:json)?\s*(.*?)```', text, re.S)
    if m:
        text = m.group(1)
    try:
        return json.loads(text)
    except ValueError:
        a, b = text.find('{'), text.rfind('}')
        if a >= 0 and b > a:
            return json.loads(text[a:b + 1])
        raise


# ---------------------------------------------------------------- rule backend (LLM 없는 기준선 · 배선 확인용)
RULE_CAT = [
    ('무효', r'무효'), ('청렴', r'청렴|금품|향응|담합|비즈니스 가이드라인'), ('일정', r'\d+\s*월\s*\d+\s*일|\d+/\d+|까지|일정|기한'),
    ('제출', r'제출|서류|e-?mail|접수|구매포탈'), ('가격', r'가격|단가|견적|부가세|보증금'), ('선정', r'선정|평가|낙찰|입찰|협상|점'),
    ('자격', r'자격|실적|부정당|제재|원제작사'), ('보안', r'보안|USB|무선|IP|시건'), ('인증', r'인증|KC|WHQL|TPM'),
    ('납품', r'납품|배송|노드|발주'), ('A/S', r'유지보수|서비스|부품|교체|DOA|대체'), ('계약', r'계약|정산|소유권|효력'),
    ('형식', r'A4|파워포인트|쪽번호|양식|표준어|모호'), ('규격', r'\d+\s*(?:PPM|GB|W|ms|Hz|인치|cd|kg)|CPU|메모리|SSD|해상도|포트|HDMI|패널|ODD|OS|Windows'),
    ('범위', r'수량|\d+\s*대'), ('문의', r'문의|☎|담당자'),
]
REQ_HINT = re.compile(r'\d|필수|불가|금지|이상|이하|이내|제출|까지|제거|해야|하여야|한다|함|않|없|포함|준수|선정|제공')


class RulesBackend(Backend):
    name = 'rules'

    def complete(self, stage, system, user, meta):
        self.calls.append(CallLog(stage, stage + '-' + str(len(self.calls)), 0))
        if stage == 'profile':
            return self._profile(meta['text'])
        if stage == 'extract':
            return self._extract(meta['chunk_text'], meta['pid_hint'], meta.get('projects', []))
        if stage == 'consolidate':
            return self._consolidate(meta['items'], meta['project'])
        if stage == 'gapfill':
            return self._extract('\n'.join(meta['lines']), meta['pid_hint'], meta.get('projects', []))
        raise BackendError(stage)

    @staticmethod
    def _profile(text):
        projects = []
        lines = text.split('\n')
        for i, ln in enumerate(lines):
            m = re.match(r'^#\s+(\d+)\.\s*\[([^\]]+)\]\s*(.*)$', ln.strip())
            if m:
                projects.append({'pid': 'P' + m.group(1), 'name': m.group(3).strip(), 'customer': m.group(2), 'issuer': '', 'start_line': i + 1, 'contacts': []})
        if not projects:
            m = re.search(r'\[([^\]]+)\]\s*([^\n]+)', text)
            name = re.search(r'사업\s*명\S*\s*[:：]?\s*([^\n]+)', text)
            projects = [{'pid': 'P1', 'name': (name.group(1) if name else (m.group(2) if m else '사업')).strip(), 'customer': m.group(1) if m else '',
                         'issuer': '', 'start_line': 1, 'contacts': []}]
        for p in projects:
            seg_end = len(lines)
            for q in projects:
                if q['start_line'] > p['start_line']:
                    seg_end = min(seg_end, q['start_line'] - 1)
            for ln in lines[p['start_line'] - 1:seg_end]:
                m = re.search(r'(\S+(?:부|팀|파트|P))\s*(팀장|부장|과장|프로|차장)?.*?(담당|문의)', ln)
                if m and len(p['contacts']) < 3:
                    p['contacts'].append({'dept': m.group(1), 'title': m.group(2) or '', 'duty': m.group(3)})
        return {'doc_type': 'RFP', 'projects': projects, 'glossary': []}

    @staticmethod
    def _cat(s):
        for c, pat in RULE_CAT:
            if re.search(pat, s, re.I):
                return c
        return '기타'

    def _extract(self, chunk, pid_hint, projects):
        items = []
        pid = pid_hint
        for ln in chunk.split('\n'):
            raw = ln.strip()
            m = re.match(r'^#\s+(\d+)\.\s*\[', raw)
            if m:
                pid = 'P' + m.group(1)
            if not raw or heading_of(raw) or raw.startswith('|:') or raw.startswith('| :') or raw.startswith('(표 계속'):
                continue
            body = re.sub(r'^[\-\*•☞※]+\s*|^\d+\.\s+|^[가-하]\.\s*|^[①-⑳]\s*', '', raw)
            body = body.strip('| ').replace(' | ', ' · ')
            if len(body) < 6 or not REQ_HINT.search(body):
                continue
            quote = re.sub(r'^[\-\*\u2022☞※|]+\s*', '', raw)[:80]
            items.append({'pid': pid, 'cat': self._cat(body), 'text': body[:220], 'quote': quote, 'modality': '필수' if re.search('필수|불가|금지', body) else '조건', 'section': ''})
        return {'items': items, 'updates': [], 'open_refs': re.findall(r'붙임\s*\d+', chunk), 'resolved_refs': [], 'carry': ''}

    @staticmethod
    def _consolidate(items, project):
        tech_cats = {'규격', '보안', '인증', '구성', '검증', '납품', '설치', 'A/S'}
        tech = [it['id'] for it in items if it['cat'] in tech_cats]
        admin = [it['id'] for it in items if it['cat'] not in tech_cats]
        contacts = project.get('contacts') or []
        n1 = contacts[0]['dept'] if contacts else '기술 담당'
        n2 = contacts[1]['dept'] if len(contacts) > 1 else '구매 · 계약 담당'
        return {'project': project.get('name', ''), 'customer': project.get('customer', ''), 'target': project.get('issuer', ''),
                'keymen': [{'name': n1, 'weight': 50, 'weight_basis': '규칙 기반 기본값', 'req_ids': tech},
                           {'name': n2, 'weight': 50, 'weight_basis': '규칙 기반 기본값', 'req_ids': admin}],
                'merges': [], 'free': '', 'evaluation': '', 'pitfalls': [], 'to_confirm': []}


# ---------------------------------------------------------------- prompts
SYS_PROFILE = """너는 B2B 제안 담당자를 돕는 RFP 분석가다. 입력은 RFP 문서의 '문서 지도'(제목 줄과 그 아래 첫 줄, 연락처 줄, 줄 번호 L#)다.
할 일: 문서에 들어 있는 사업(프로젝트)을 모두 찾아라. 한 파일에 여러 RFP가 묶여 있을 수 있다.
- projects[].pid 는 P1, P2 … 순서, start_line 은 그 사업 문서가 시작하는 줄 번호(L#)다.
- name 은 문서에 적힌 사업명 그대로, customer 는 발주 기관명, issuer 는 공고/요청 주체(부서·명의).
- contacts 는 문서에 적힌 담당 부서·직책·역할(예: 도입담당, 업무담당, 제안 상세요건 문의). 개인 이름은 넣지 마라.
- glossary 는 이 문서에서 일관되게 써야 할 핵심 용어(예: BMT, 협상적격자, 총액입찰).
문서에 없는 내용은 만들지 마라. 문자열 필드는 짧게(이름 · 부서명 수준, 60자 이내) 쓰고 같은 문장을 되풀이하지 마라. JSON만 출력."""

PROMPT_VERSION = 'v3.1'  # v1: 기본 규칙 · v2: 제출서류 · 메일 주소 · 표 수량 열 · 법 조항 · 하위 항목 규칙 · v3: + 갭 채우기(숫자 인지) · 주제별 묶음 렌더링 · v3.1: 요약에 없는 동기 금지 · id 대신 내용 · target 채우기
SYS_EXTRACT = """너는 RFP를 '고객 요구사항 목록'으로 바꾸는 분석가다. 지금 읽는 것은 긴 문서의 한 조각이다.
규칙
1. 조각 안의 요구사항 · 조건 · 일정 · 제출물 · 평가/선정 규칙 · 자격 · 계약 조건 · 금지 사항을 빠짐없이 원자 단위(한 항목에 한 조건)로 뽑아라. 표의 각 행도 항목이다.
2. 숫자 · 단위 · 날짜 · 시각 · 메일 주소 · 법 조항은 원문 그대로 옮겨라. 계산하거나 바꿔 쓰지 마라.
3. 강도(필수/불가/이상/이하/할 수 있음/~될 수 있음)를 원문보다 세거나 약하게 바꾸지 마라. modality 로도 표시하라.
4. quote 에는 그 항목의 근거가 되는 원문 구절을 40자 안팎으로 그대로 복사하라(요약 금지).
5. cat 은 주어진 분류 중 하나. pid 는 '전역 맥락'의 사업 중 이 항목이 속한 사업.
6. '지금까지의 원장'에 이미 있는 항목은 다시 만들지 마라. 같은 항목에 이 조각이 세부 내용을 더하면 updates 에 그 id 와 덧붙일 내용을 넣어라.
7. '붙임 3 참조'처럼 다른 곳을 가리키는 항목은 open_refs 에 남기고, 이 조각이 그 붙임의 내용이면 resolved_refs 에 적고 세부를 항목/updates 로 반영하라.
8. 빈 서식(이름 · 날짜 칸), 서명란, 인사말 같은 비요구 문장은 뽑지 마라.
8-1. 제출서류 · 구비서류 목록은 서류 이름을 하나도 빼지 말고 옮겨라(여러 개면 한 항목에 ' · '로 나열해도 된다).
8-2. 제출처 · 접수 방법의 메일 주소 · 포털 주소는 원문 그대로 항목에 넣어라.
8-3. 표는 모든 열을 반영하라 — 수량 · 예상수량 · 비고 열도 항목에 넣어라(예: 예상수량/년 500 → '연 예상 500').
8-4. 법령 · 조항 번호(예: 시행령 제27조)와 인증 이름은 원문 그대로 남겨라.
8-5. 들여쓴 하위 항목(①②, -, * 등)도 각각 빠짐없이 옮겨라.
9. carry 에는 다음 조각을 읽을 사람에게 넘길 메모를 1~3문장으로(예: '표 (3) 노트북 상세 스펙이 이어짐', '붙임 3 미해결').
10. 같은 문장을 되풀이하지 마라. section 은 제목 몇 단어, quote 는 40자 안팎.
JSON만 출력."""

SYS_GAPFILL = """너는 RFP 요구사항 추출을 검수하는 분석가다. 아래 '빠졌을 수 있는 원문 줄'은 이 조각에서 아직 어떤 항목으로도 옮겨지지 않은 줄이다.
- 줄이 요구사항 · 조건 · 일정 · 제출물 · 평가/선정 규칙 · 자격 · 계약 조건 · 금지 사항이면 원자 단위 항목으로 뽑아라(숫자 · 메일 · 조항은 원문 그대로, 강도 유지, quote 는 그 줄의 원문 구절).
- 줄의 일부만 원장에 있고 숫자(수량 · 예상수량 · 기한 · 금액 · 비율)나 조건이 빠져 있으면, 빠진 부분을 담은 항목을 만들거나 updates 로 그 항목에 덧붙여라(표의 예상수량 열 → '연 예상 500' 처럼).
- '지금까지의 원장'에 이미 같은 내용이 있거나, 빈 서식 · 인사말 · 제목뿐인 줄이면 뽑지 마라.
- 새 항목이 없으면 items 를 빈 배열로. carry 는 빈 문자열.
JSON만 출력."""

SYS_CONSOLIDATE = """너는 정리된 요구사항 원장으로 '고객 요구사항 입력 폼'을 완성하는 편집자다. 원문은 주어지지 않는다. 원장 항목은 id 로만 다룬다.
할 일
- keymen: 원장에 나온 담당 부서/역할로 2~3명을 정하고 모든 항목 id 를 빠짐없이 배정하라(항목은 한 키맨에만). 기술 · 규격 · 검증은 업무/기술 담당, 입찰 · 가격 · 계약 · 제출은 도입/구매 담당이 자연스럽다.
- weight: 평가 구조(가격/기술 배점, 통과 기준)를 근거로 정하고 합을 100으로. 문서에 배점이 없으면 weight_basis 에 '추정'이라고 밝혀라.
- merges: 같은 조건을 두 번 적은 항목만 병합하라. 내용이 조금이라도 다르면 병합하지 마라.
- groups: 각 키맨 안에서 한 주제로 읽히는 항목(예: 제출서류 목록, 입찰무효 사유, 한 제품의 사양, 같은 일정 묶음)을 2~8개씩 묶어라. 묶인 항목은 원장 문장이 그대로 ' · '로 이어 붙여지므로 표현을 바꿀 필요가 없다. 키맨당 6~15줄이 되게. tag 는 분류 한 단어(예: 규격, 제출, 선정).
- free: 고객 요구를 3~5문단으로 요약(무엇을 · 얼마나 · 어떻게 뽑는지 · 언제까지). 숫자는 원장에 있는 것만.
- evaluation: 평가 · 선정 구조 해석 1~2문장. pitfalls: 제안서에서 놓치기 쉬운 점. to_confirm: 원장 안에서 서로 어긋나거나 모호해 질의가 필요한 점.
- target: 원장의 담당 부서 중 최종 결정에 가장 가까운 부서(들)를 짧게.
- free · evaluation · pitfalls · to_confirm 에는 원장에 없는 목적 · 배경 · 동기 · 수치를 쓰지 마라(예: '업무 효율 제고를 위해' 같은 말을 지어내지 말 것).
- 사람이 읽는 글이므로 R001 같은 id 를 쓰지 말고 내용으로 가리켜라.
JSON만 출력."""


def uncovered_lines(chunk_text: str, items: List[dict], limit: int = 30, thr: float = 0.45) -> List[str]:
    """요구사항처럼 보이는 원문 줄 중 어떤 항목(text · quote)에도 충분히 반영되지 않은 줄."""
    item_grams = [grams(norm(it.get('text', '') + ' ' + it.get('quote', ''))) for it in items]
    item_nums = set()
    for it in items:
        item_nums.update(re.findall(r'\d+', (it.get('text', '') + ' ' + it.get('quote', '')).replace(',', '')))
    out = []
    for ln in chunk_text.split('\n'):
        raw = ln.strip()
        if raw.startswith('(표 계속') or len(raw) < 8 or heading_of(raw) or re.match(r'^\|?\s*:?-{2,}', raw) or not REQ_HINT.search(raw):
            continue
        g = grams(norm(raw))
        if not g:
            continue
        best = max((len(g & ig) / len(g) for ig in item_grams), default=0.0)
        # 숫자 인지: 줄의 두 자리 이상 숫자(수량 · 기한 · 금액 등) 중 어떤 항목에도 없는 것이 있으면 일부만 옮겨진 줄로 본다
        nums = [n for n in re.findall(r'\d+', raw.replace(',', '')) if len(n) >= 2]
        missing_num = any(n not in item_nums for n in nums)
        if best < thr or missing_num:
            out.append(raw[:300])
        if len(out) >= limit:
            break
    return out


def ledger_brief(items: List[dict], pid: Optional[str], budget: int) -> str:
    rows = [f"{it['id']} [{it['cat']}] {it['text'][:70]}" for it in items if pid is None or it['pid'] == pid]
    out, total = [], 0
    for r in reversed(rows):  # 최근 항목부터 예산 안에서
        if total + len(r) + 1 > budget:
            out.append(f'… (이전 항목 {len(rows) - len(out)}개 생략)')
            break
        out.append(r)
        total += len(r) + 1
    return '\n'.join(reversed(out)) or '(아직 없음)'


# ---------------------------------------------------------------- pipeline
@dataclass
class RunConfig:
    condition: str = 'chunk_carry'  # single | chunk_nocarry | chunk_carry | chunk_carry_gap
    max_chars: int = 3000
    ledger_budget: int = 2600
    enrich: bool = False


@dataclass
class RunResult:
    profile: dict
    chunks: List[dict]
    items: List[dict]
    forms: List[dict]
    trace: List[dict] = field(default_factory=list)
    guards: dict = field(default_factory=dict)
    enrich: List[dict] = field(default_factory=list)


def _profile_user(text: str) -> str:
    return '문서 지도\n' + outline(text)


def run_pipeline(text: str, backend: Backend, cfg: RunConfig) -> RunResult:
    source_norm = norm(text)
    trace: List[dict] = []

    # 1) profile (전역 맥락)
    prof = backend.complete('profile', SYS_PROFILE, _profile_user(text), {'text': text})
    projects = prof.get('projects') or [{'pid': 'P1', 'name': '', 'customer': '', 'start_line': 1, 'contacts': []}]
    projects = sorted(projects, key=lambda p: int(p.get('start_line') or 1))
    for i, p in enumerate(projects):
        p['pid'] = p.get('pid') or f'P{i + 1}'
    trace.append({'stage': 'profile', 'projects': [(p['pid'], p.get('name'), p.get('start_line')) for p in projects]})

    def pid_at(line_no: int) -> str:
        cur = projects[0]['pid']
        for p in projects:
            if int(p.get('start_line') or 1) <= line_no:
                cur = p['pid']
        return cur

    # 0) chunks
    if cfg.condition == 'single':
        chunks = [Chunk(0, [], text, 0, len(text.split('\n')))]
    else:
        chunks = chunk_text(text, cfg.max_chars)

    # 2) extract
    items: List[dict] = []
    carry, open_refs = '', []
    proj_ctx = json.dumps([{k: p.get(k) for k in ('pid', 'name', 'customer', 'issuer', 'contacts')} for p in projects], ensure_ascii=False)
    for ch in chunks:
        pid_hint = pid_at(ch.start_line + 1)
        parts = [f'분류(cat): {", ".join(CATS)}']
        carry_mode = cfg.condition in ('chunk_carry', 'chunk_carry_gap')
        if carry_mode:
            parts += [f'전역 맥락(사업 목록): {proj_ctx}',
                      f'지금 위치: 조각 {ch.idx + 1}/{len(chunks)} · {ch.breadcrumb() or "(문서 앞부분)"} · 이 조각은 {pid_hint} 문서에서 시작',
                      f'직전 조각 메모: {carry or "(없음)"}',
                      f'미해결 참조: {", ".join(open_refs) or "(없음)"}',
                      f'지금까지의 원장({pid_hint}):\n{ledger_brief(items, pid_hint, cfg.ledger_budget)}']
        elif cfg.condition == 'single':
            parts += [f'전역 맥락(사업 목록): {proj_ctx}']
        else:  # chunk_nocarry — 조각만 보고 판단(사업 목록도 주지 않음)
            parts += ['pid 는 조각에서 보이는 사업명으로 P1, P2… 를 스스로 정하라(모르면 P1).']
        parts.append('조각 원문:\n' + ch.text)
        user = '\n\n'.join(parts)
        data = backend.complete('extract', SYS_EXTRACT, user, {'chunk_text': ch.text, 'pid_hint': pid_hint, 'projects': projects, 'idx': ch.idx,
                                                               'single': cfg.condition == 'single'})
        new_ids = []
        for it in data.get('items') or []:
            if not (it.get('text') or '').strip():
                continue
            it = dict(it)
            it['id'] = f'R{len(items) + 1:03d}'
            it['chunk'] = ch.idx
            # chunk_nocarry 는 사업 목록을 모르므로 위치(문서 경계) 기준으로 귀속, 나머지는 모델이 고른 사업이 유효하면 그대로
            if cfg.condition == 'chunk_nocarry' or it.get('pid') not in {p['pid'] for p in projects}:
                it['pid'] = pid_hint
            it['cat'] = it.get('cat') if it.get('cat') in CATS else '기타'
            it['grounded'] = grounded(it.get('quote', ''), source_norm)
            items.append(it)
            new_ids.append(it['id'])
        n_upd = 0
        for up in data.get('updates') or []:
            tgt = next((x for x in items if x['id'] == up.get('id')), None)
            if tgt and up.get('add') and grounded(up.get('quote', ''), source_norm):
                tgt['text'] = tgt['text'].rstrip(' ·') + ' · ' + up['add'].strip()
                tgt.setdefault('updated_by', []).append(ch.idx)
                n_upd += 1
        # 갭 채우기: 이 조각에서 아직 어떤 항목에도 반영되지 않은 '요구사항 같은 줄'만 다시 묻는다
        gap_lines, gap_new = [], 0
        if cfg.condition == 'chunk_carry_gap':
            gap_lines = uncovered_lines(ch.text, [x for x in items if x['chunk'] == ch.idx])
            if gap_lines:
                guser = '\n\n'.join([f'분류(cat): {", ".join(CATS)}', f'전역 맥락(사업 목록): {proj_ctx}',
                                      f'지금 위치: 조각 {ch.idx + 1}/{len(chunks)} · {ch.breadcrumb() or "(문서 앞부분)"} · {pid_hint} 문서',
                                      f'지금까지의 원장({pid_hint}):\n{ledger_brief(items, pid_hint, cfg.ledger_budget)}',
                                      '빠졌을 수 있는 원문 줄:\n' + '\n'.join('- ' + x for x in gap_lines)])
                gdata = backend.complete('gapfill', SYS_GAPFILL, guser, {'lines': gap_lines, 'pid_hint': pid_hint, 'projects': projects, 'idx': ch.idx})
                for it in gdata.get('items') or []:
                    if not (it.get('text') or '').strip():
                        continue
                    it = dict(it)
                    it['id'] = f'R{len(items) + 1:03d}'
                    it['chunk'] = ch.idx
                    it['via'] = 'gapfill'
                    if it.get('pid') not in {p['pid'] for p in projects}:
                        it['pid'] = pid_hint
                    it['cat'] = it.get('cat') if it.get('cat') in CATS else '기타'
                    it['grounded'] = grounded(it.get('quote', ''), source_norm)
                    items.append(it)
                    gap_new += 1
                for up in gdata.get('updates') or []:
                    tgt = next((x for x in items if x['id'] == up.get('id')), None)
                    if tgt and up.get('add') and grounded(up.get('quote', ''), source_norm):
                        tgt['text'] = tgt['text'].rstrip(' ·') + ' · ' + up['add'].strip()
                        tgt.setdefault('updated_by', []).append(f'gap{ch.idx}')
                        gap_new += 1
        if carry_mode:
            carry = (data.get('carry') or '').strip()
            for r in data.get('open_refs') or []:
                if r not in open_refs:
                    open_refs.append(r)
            for r in data.get('resolved_refs') or []:
                open_refs = [x for x in open_refs if norm(x) != norm(r)]
        trace.append({'stage': 'extract', 'chunk': ch.idx, 'chars': len(ch.text), 'path': ch.breadcrumb(), 'new': len(new_ids), 'updates': n_upd,
                      'carry': carry, 'open_refs': list(open_refs), 'gap_lines': len(gap_lines), 'gap_new': gap_new})

    # 3) consolidate (사업별, ID 기반)
    forms = []
    for p in projects:
        pitems = [it for it in items if it['pid'] == p['pid']]
        if not pitems:
            continue
        led = '\n'.join(f"{it['id']} [{it['cat']}|{it.get('modality', '')}] {it['text']}" for it in pitems)
        user = (f"사업: {json.dumps({k: p.get(k) for k in ('name', 'customer', 'issuer', 'contacts')}, ensure_ascii=False)}\n\n"
                f"원장({len(pitems)}개):\n{led}")
        try:
            dec = backend.complete('consolidate', SYS_CONSOLIDATE, user, {'items': pitems, 'project': p})
            fallback = ''
        except BackendError as e:  # 통합이 실패해도 폼은 잃지 않는다: 규칙 기반 배정으로 대체(요약 · 의견은 비움)
            dec = RulesBackend._consolidate(pitems, p)
            fallback = str(e)[:200]
        form = assemble_form(p, pitems, dec)
        if fallback:
            form['stats']['consolidate_fallback'] = fallback
            trace.append({'stage': 'consolidate', 'pid': p['pid'], 'fallback': fallback})
        forms.append(form)
    res = RunResult(profile=prof, chunks=[{'idx': c.idx, 'path': c.breadcrumb(), 'chars': len(c.text), 'lines': [c.start_line, c.end_line], 'table_header': bool(c.table_header)} for c in chunks],
                    items=items, forms=forms, trace=trace)
    res.guards = guard_report(res, text)
    return res


def assemble_form(project: dict, pitems: List[dict], dec: dict) -> dict:
    """LLM 결정(키맨 배정 · 병합 · 요약)을 원장 항목에 적용해 Winmate 입력 폼을 만든다. 본문은 원장에서만 가져온다."""
    by_id = {it['id']: it for it in pitems}
    dropped, merge_log = set(), []
    for m in dec.get('merges') or []:
        keep = by_id.get(m.get('keep'))
        for d in m.get('drop') or []:
            it = by_id.get(d)
            if not keep or not it or d == keep['id']:
                continue
            # 안전 병합: 버리는 항목의 숫자가 남기는 항목에 모두 있고 글자가 충분히 비슷할 때만
            safe = set(numbers_with_units(it['text'])) <= set(numbers_with_units(keep['text'])) and jaccard(it['text'], keep['text']) >= 0.5
            merge_log.append({'keep': keep['id'], 'drop': d, 'applied': safe})
            if safe:
                dropped.add(d)
    keymen, assigned = [], set()
    clean = lambda t: t.strip().rstrip('.').strip()  # noqa: E731
    for k in dec.get('keymen') or []:
        ids = [i for i in (k.get('req_ids') or []) if i in by_id and i not in dropped and i not in assigned]
        for g in k.get('groups') or []:  # 그룹에만 있고 req_ids 에 빠진 id 도 이 키맨 것으로
            for i in g.get('ids') or []:
                if i in by_id and i not in dropped and i not in assigned and i not in ids:
                    ids.append(i)
        assigned.update(ids)
        lines, used = [], set()
        for g in k.get('groups') or []:  # 주제별 묶음: 원장 문장을 그대로 이어 붙인다(표현 변경 없음) · 2~6개만, 크면 나눔
            gids = [i for i in (g.get('ids') or []) if i in ids and i not in used]
            if len(gids) < 2:
                continue
            tag = (g.get('tag') or by_id[gids[0]]['cat']).strip('[] ')
            for s0 in range(0, len(gids), 6):
                part = gids[s0:s0 + 6]
                used.update(part)
                lines.append((min(ids.index(i) for i in part), f"[{tag}] " + ' · '.join(clean(by_id[i]['text']) for i in part), part))
        # 남은 항목은 같은 분류끼리(처음 나온 순서) 4개까지 한 줄로
        rest = [i for i in ids if i not in used]
        for cat in dict.fromkeys(by_id[i]['cat'] for i in rest):
            cids = [i for i in rest if by_id[i]['cat'] == cat]
            for s0 in range(0, len(cids), 4):
                part = cids[s0:s0 + 4]
                text = by_id[part[0]]['text'] if len(part) == 1 else ' · '.join(clean(by_id[i]['text']) for i in part)
                lines.append((min(ids.index(i) for i in part), f"[{cat}] {text}", part))
        lines.sort(key=lambda x: x[0])
        keymen.append({'name': k.get('name') or '담당자', 'weight': int(k.get('weight') or 0), 'weight_basis': k.get('weight_basis', ''),
                       'reqs': [ln for _, ln, _ in lines], 'req_ids': ids, 'line_ids': [g for _, _, g in lines]})
    missing = [i for i in by_id if i not in assigned and i not in dropped]
    if missing:  # 배정 누락은 버리지 않고 '미배정' 키맨으로 보존
        keymen.append({'name': '미배정', 'weight': 0, 'weight_basis': '통합 단계에서 배정되지 않은 항목', 'reqs': [f"[{by_id[i]['cat']}] {by_id[i]['text']}" for i in missing], 'req_ids': missing})
    def deref(t: str) -> str:  # 사람이 읽는 글에 남은 원장 id 는 그 항목 내용(짧게)으로 바꾼다
        t = re.sub(r'\s*\((?:R\d{3}[\s,·]*)+(?:관련|참조)?\)', '', t or '')
        return re.sub(r'(?<![A-Za-z0-9])R\d{3}(?!\d)', lambda m: '‘' + by_id[m.group()]['text'][:28].rstrip() + '…’' if m.group() in by_id else m.group(), t)
    for key in ('free', 'evaluation'):
        if dec.get(key):
            dec[key] = deref(dec[key])
    for key in ('pitfalls', 'to_confirm'):
        dec[key] = [deref(x) for x in dec.get(key) or []]
    note = []
    if dec.get('evaluation'):
        note.append('평가 구조: ' + dec['evaluation'])
    if dec.get('pitfalls'):
        note.append('놓치기 쉬운 점: ' + ' / '.join(dec['pitfalls']))
    if dec.get('to_confirm'):
        note.append('확인 필요: ' + ' / '.join(dec['to_confirm']))
    return {'pid': project['pid'], 'project': dec.get('project') or project.get('name', ''), 'customer': dec.get('customer') or project.get('customer', ''),
            'target': dec.get('target', ''), 'keymen': keymen, 'free': dec.get('free', ''), 'note': '\n'.join(note),
            'stats': {'items': len(pitems), 'merged': len(dropped), 'unassigned': len(missing), 'merge_log': merge_log}}


def form_text(form: dict, include_free: bool = False) -> str:
    parts = [form.get('project', ''), form.get('customer', ''), form.get('target', '')]
    for k in form['keymen']:
        parts.extend(k['reqs'])
    if include_free:
        parts += [form.get('free', ''), form.get('note', '')]
    return '\n'.join(parts)


def guard_report(res: RunResult, source: str) -> dict:
    n = len(res.items)
    g = sum(1 for it in res.items if it.get('grounded'))
    unsup = {}
    dups = 0
    for f in res.forms:
        unsup[f['pid']] = unsupported_numbers(form_text(f, include_free=True), source)
        reqs = [r for k in f['keymen'] for r in k['reqs']]
        for i in range(len(reqs)):
            for j in range(i + 1, len(reqs)):
                if jaccard(reqs[i], reqs[j]) >= 0.75:
                    dups += 1
    return {'items': n, 'grounded_rate': round(g / n, 3) if n else 0.0, 'ungrounded_ids': [it['id'] for it in res.items if not it.get('grounded')][:40],
            'unsupported_numbers': unsup, 'near_duplicates': dups}


# ---------------------------------------------------------------- Tavily enrich (선택)
def tavily_search(api_key: str, query: str, max_results: int = 3, timeout: int = 30) -> dict:
    body = json.dumps({'query': query, 'max_results': max_results, 'search_depth': 'basic', 'include_answer': True}).encode('utf-8')
    req = urllib.request.Request('https://api.tavily.com/search', data=body, method='POST',
                                 headers={'content-type': 'application/json', 'authorization': 'Bearer ' + api_key})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def enrich_terms(forms: List[dict], api_key: str, limit: int = 3) -> List[dict]:
    """확인 필요 · 인증 · 법 조항 용어의 출처만 모은다. 요구사항 본문에는 섞지 않는다."""
    terms = []
    for f in forms:
        for k in f['keymen']:
            for r in k['reqs']:
                for m in re.finditer(r'(WHQL|TPM\s*2\.0|KC\s*인증|전파인증|국가를 당사자로 하는 계약에 관한 법률 시행령 제\d+조|시행규칙 제\d+조)', r):
                    t = m.group(1)
                    if t not in terms:
                        terms.append(t)
    out = []
    for t in terms[:limit]:
        try:
            q = (t + ' 조문 내용') if re.search(r'법|조$', t) else ('WHQL Windows Hardware Quality Labs 드라이버 인증 정의' if t.upper() == 'WHQL' else t + ' 인증 정의')
            r = tavily_search(api_key, q)
            out.append({'term': t, 'query': q, 'answer': r.get('answer', ''), 'sources': [{'title': x.get('title'), 'url': x.get('url')} for x in r.get('results', [])[:3]]})
        except Exception as e:  # noqa: BLE001
            out.append({'term': t, 'error': f'{type(e).__name__}: {e}'})
    return out


# ---------------------------------------------------------------- scoring against TC checkpoints
def score(res: RunResult, tc: dict, sources: Optional[Dict[str, str]] = None) -> dict:
    """sources: 사업 key → norm(원문). 다른 사업 출력에서 발견돼도 그 사업 원문에도 있는 사실(같은 은행 공통 문구 등)은 잘못된 귀속으로 세지 않는다."""
    exp = tc['expected']['projects']
    # 출력 사업 ↔ 기대 사업 매칭 (이름 · 고객 정규식)
    mapping = {}
    for e in exp:
        for f in res.forms:
            hay = f"{f.get('project', '')} {f.get('customer', '')}"
            if re.search(e['match'], hay, re.I) and f['pid'] not in mapping.values():
                mapping[e['key']] = f['pid']
                break
    by_pid = {f['pid']: f for f in res.forms}
    per, tot_hit, tot_all, misattr = [], 0, 0, 0
    for e in exp:
        f = by_pid.get(mapping.get(e['key']))
        req_txt = norm(form_text(f)) if f else ''
        all_txt = norm(form_text(f, include_free=True)) if f else ''
        inv = {v: k for k, v in mapping.items()}
        others = [(inv.get(x['pid']), norm(form_text(x))) for x in res.forms if f is None or x['pid'] != f['pid']]
        rows = []
        for cp in e['checkpoints']:
            pats = cp['any']
            hit = any(re.search(p, req_txt) for p in pats)
            hit_any = hit or any(re.search(p, all_txt) for p in pats)
            wrong = (not hit) and len(exp) > 1 and any(
                re.search(p, o) and not (sources and okey in sources and re.search(p, sources[okey]))
                for okey, o in others for p in pats)
            rows.append({'id': cp['id'], 'cat': cp.get('cat', ''), 'desc': cp['desc'], 'hit': hit, 'hit_with_summary': hit_any, 'misattributed': wrong})
        h = sum(r['hit'] for r in rows)
        misattr += sum(r['misattributed'] for r in rows)
        tot_hit += h
        tot_all += len(rows)
        per.append({'key': e['key'], 'matched_pid': mapping.get(e['key']), 'recall': round(h / len(rows), 3) if rows else 0.0,
                    'recall_with_summary': round(sum(r['hit_with_summary'] for r in rows) / len(rows), 3) if rows else 0.0,
                    'missed': [r['id'] + ' ' + r['desc'] for r in rows if not r['hit']], 'rows': rows})
    return {'recall': round(tot_hit / tot_all, 3) if tot_all else 0.0, 'projects_expected': len(exp), 'projects_found': len(res.forms),
            'projects_matched': len(mapping), 'misattributed': misattr, 'per_project': per}
