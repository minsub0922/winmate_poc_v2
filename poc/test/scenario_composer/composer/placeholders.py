"""자리표시 — 레이아웃 견본이 "여기에 실제 값이 들어간다"고 적어 둔 표시([00] · [0]주 · [확인 필요] · [모델명] …).

제안서에는 남기지 않는다. 화면(app/web/src/domain/slides/placeholders.js)과 같은 규칙을 레이아웃 자동 구성이 스스로 지킨다 —
그래야 구성이 끝난 덱을 화면이 다시 고치지 않는다:
  1. 근거가 있는 값으로 채운다(고객이 준 수치 · 제품 사양).
  2. 문장 칸은 수치 없이 같은 뜻으로 쓴다 — 그래도 남으면 ``strip_placeholders`` 가 수치 자리만 걷어 낸다.
  3. 숫자만 들어가는 칸(``number_only``)을 채울 수 없으면 그 장을 숫자가 필요 없는 장으로 바꾼다(``ALTERNATIVE_LAYOUTS``).
  4. 바꿀 장도 없으면 그 칸(과 그 줄의 이름표 · 단위)을 비운다.

정규식과 표는 placeholders.js 를 그대로 옮긴 것이다 — 한쪽을 고치면 다른 쪽도 고친다(app/tests/test_compose_auto.py 가 같은 예문으로 확인한다).
"""
from __future__ import annotations

import re
from typing import Dict, List

# 채워 넣을 값을 뜻하는 낱말. 대괄호 안이 이 낱말로 시작하면 자리표시다.
WORDS = '확인 필요|확인|미정|입력|고객사|번호|모델명|수량|금액|날짜|제안|담당|회사|사업명|지역|N'
# [00] · [0.0] · [0,000] · [00/00] · [30] · [ ] 같은 숫자 · 빈칸, 또는 위 낱말로 시작하는 짧은 대괄호. 긴 대괄호 설명([샘플 버티컬 시나리오 · …])은 아니다.
TOKEN = r'\[\s*(?:[0-9][0-9.,/ ]{0,10}|(?:' + WORDS + r')[^\]\n]{0,14})?\s*\]|\bTBD\b'
_ANY = re.compile(TOKEN)


def has_placeholder(text) -> bool:
    """글에 자리표시가 남아 있는가"""
    return bool(_ANY.search(str(text or '')))


# 수치 바로 뒤에 붙는 단위 — 수치가 없으면 단위도 뜻이 없다. 긴 것부터 맞춘다.
UNITS = ['만 원대', '만 원', '만원', '억 원', '억원', '천만 원', '천만원', '조 원', '조원', '만 명', '만명', '억 달러', '만 달러', '달러', '개월', '시간', '퍼센트', '인치', '세대', '가구', '병상', '객실',
         '%p', 'kWh', 'kW', 'kg', 'km', 'mm', 'cm', 'ms', 'nit', 'Mbps', 'GB', 'TB', 'Hz', 'dB', '℃', '단계', '권역', '년차', '원대',
         '%', '원', '억', '조', '개', '곳', '명', '건', '대', '일', '주', '월', '달', '년', '분', '초', '배', '회', '㎡', '평', '점', '위', '차', '종', '층', '호', '줄', '실', '팀', '장', '동', '석', '형', 'p', 'W', 'm', 'L', 'A', 'V']
_UNIT = '(?:' + '|'.join(re.escape(u) for u in UNITS) + ')'
# 수치를 꾸미는 말(앞) · 수치와 견주는 말(뒤) · 부호 · 쪽 번호 표시 — 수치와 함께 걷어 낸다
_BEFORE = '(?:약|최대|최소|평균|총|각|주|월|연|일|매)'
_AFTER = '(?:이하|이상|이내|미만|초과|내외|가량|정도|씩)'
_SIGN = r'[−\-+±×▲▼~]'
_PARTICLE = '(?:으로|가|이|를|을|은|는|의|로|에|와|과|도)'
# 수치에 바로 붙은 말(띄어 쓰지 않은 6자 이내)은 그 수치의 단위 · 조사다 — 표에 없는 단위([0]등급 · [00]h · [00]/7)도 함께 걷어 낸다
_ATTACHED = r'[^\s·\[\]→↓↑,()]{1,6}(?=$|[\s·\[→↓↑,()])'
_FIGURE = re.compile(
    r'(?:(?<![^\s·(])' + _BEFORE + r'\s*)?(?:(?<![A-Za-z])(?:pp|p|P|No)\.\s*)?(?:' + _SIGN + r'\s*)?(?:' + TOKEN + r')'
    + r'(?:' + _ATTACHED + r')?(?:\s?' + _UNIT + _PARTICLE + r'?(?![가-힣A-Za-z]))?(?:\s*' + _AFTER + r'(?![가-힣]))?')
# 수치가 빠지고 꾸미는 말 · 기호만 남았는가
_LEFTOVER = re.compile(r'^(?:' + _BEFORE + '|' + _AFTER + r'|[\s·→↓↑▲▼~×+\-−±:,./%()])*$')


def strip_placeholders(text) -> str:
    """문장 칸에서 수치 자리만 걷어 낸다 — '월 전기료 [00]% 절감' → '월 전기료 절감', '화면 장애 [0]건 이하' → '화면 장애', '근거 · 구성 p.[00]' → '근거 · 구성'.

    수치밖에 없던 칸은 빈 문자열이 된다('[00]곳' · '연 −[00]%' → ''). 자리표시가 없는 글은 그대로 돌려준다."""
    source = str(text or '')
    if not has_placeholder(source):
        return source
    out = _FIGURE.sub(' ', source)
    pieces: List[str] = []
    # 한쪽이 비어 버린 화살표('[0]일 → 당일' → '당일')와 끝에 남은 구분 기호를 정리한다
    for piece in re.split(r'\s*·\s*', out):
        p = re.sub(r'\s+', ' ', piece).strip()
        p = re.sub(r'^(?:→|->|~|-|:|,|/)\s*', '', p)
        p = re.sub(r'\s*(?:→|->|~|-|,|/)$', '', p).strip()
        if p and not _LEFTOVER.match(p):
            pieces.append(p)
    out = ' · '.join(pieces)
    out = re.sub(r'\(\s*\)', '', re.sub(r'\s+', ' ', out)).strip()
    # 이름표만 남은 칸('출처:') · 글자가 하나도 없는 칸(기호뿐) · 한 글자나 숫자 · 비율 표시만 남은 칸('대 1' · '0')은 빈 칸이다
    if (re.match(r'^[^:：]{1,8}[:：]$', out) or not re.search(r'[가-힣A-Za-z0-9]', out) or len(re.sub(r'\s', '', out)) <= 1
            or re.match(r'^[\d\s.,대:~/-]+$', out)):
        return ''
    return out


_UNIT_ONLY = re.compile('^' + _UNIT + '$')


def unit_only(text) -> bool:
    """단위만 적힌 칸인가('명' · '만 원' · '%') — 옆의 숫자 칸을 비우면 함께 비운다"""
    return bool(_UNIT_ONLY.match(str(text or '').strip()))


def number_only(text) -> bool:
    """숫자만 들어가는 칸인가 — 자리표시를 걷어 내면 아무것도 남지 않는 칸. 값을 모르면 채울 방법이 없다."""
    return has_placeholder(text) and strip_placeholders(text) == ''


# 숫자를 채울 수 없을 때 대신 쓰는 레이아웃(목차 템플릿 묶음). 비용(TCO) · 요약 · 파일럿 · 로드맵은 문장 칸이라 수치 없이 다시 쓰면 되므로 대체 레이아웃이 없다.
ALTERNATIVE_LAYOUTS: Dict[str, List[str]] = {
    'L_TOC_UAPROF': ['L_TOC_UAPAIN'],   # 고객사 현황 지표 → 고객 과제
    'L_TOC_KPI': ['L_TOC_VP3'],         # 전후 비교 숫자 → 가치 세 가지
    'L_TOC_TRLINE': ['L_TOC_TRKEY'], 'L_TOC_TRSHARE': ['L_TOC_TRKEY'], 'L_TOC_TRSTAT': ['L_TOC_TRKEY'],   # 시장 수치 → 키워드
    **{f'L_TOC_BOM{n}': ['L_TOC_SPEC', 'L_TOC_PFEAT'] for n in (3, 4, 5, 6, 7, 8)},   # 수량표 → 제품 사양 · 제품 가치
    'L_TOC_TCO': [], 'L_TOC_SUMMARY': [], 'L_TOC_PILOT': [], 'L_TOC_ROADMAP': [],
}
# 값 칸이 모두 비면 함께 비우는 이름표 칸(목차 템플릿의 칸 이름) — 값 없는 줄에 이름표만 남지 않게
VALUE_LABELS: Dict[str, List[dict]] = {
    'L_TOC_TCO': [{'label': 'tl', 'values': ['tv0', 'tv1', 'tv2']}],   # '5년 총소유비용' — 구매 방식별 금액
}
