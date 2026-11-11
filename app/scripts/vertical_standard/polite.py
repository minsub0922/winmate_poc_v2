# -*- coding: utf-8 -*-
"""한다체 문장 끝을 합니다체로 — 공간 · 솔루션 장면 문장(vertical_space_solution.json scenario)을 장표 어투에 맞춘다."""
import re

BASE, JONG = 0xAC00, 28


def _jong(ch):
    o = ord(ch)
    return (o - BASE) % JONG if 0xAC00 <= o <= 0xD7A3 else -1


def _with_jong(ch, j):
    o = ord(ch)
    return chr(o - (o - BASE) % JONG + j)


def end_polite(word):
    """하나의 끝 낱말(…다)을 합니다체로"""
    if not word.endswith('다') or len(word) < 2: return word
    stem, last = word[:-1], word[-2]
    if word.endswith('는다'):
        return word[:-2] + '습니다'
    j = _jong(last)
    if j == 4:  # ㄴ 받침: 한다 → 합니다, 보낸다 → 보냅니다
        return stem[:-1] + _with_jong(last, 17) + '니다'
    if j == 8:  # ㄹ 받침: 길다 → 깁니다
        return stem[:-1] + _with_jong(last, 17) + '니다'
    if j == 0:  # 받침 없음: 크다 → 큽니다
        return stem[:-1] + _with_jong(last, 17) + '니다'
    if j > 0:  # 있다 · 없다 · 같다 · 높다
        return stem + '습니다'
    return word


def polite(text):
    def fix(m):
        return end_polite(m.group(1)) + m.group(2)
    return re.sub(r'(\S+다)([.!]?)(?=\s|$)', lambda m: fix(m) if m.group(1).endswith('다') and _is_final(m) else m.group(0), text)


def _is_final(m):
    # only sentence-final words: followed by a period, or end of text
    s, e = m.string, m.end()
    return m.group(2) in ('.', '!') or e == len(s)


if __name__ == '__main__':
    for t in ['리셉션 비즈니스 TV에 회사 소개·방문객 환영 화면과 아트 콘텐츠를 예약 송출한다.', '꺼진 화면은 조기 경보로 바로 찾는다.', '출근 전 예냉·예열 스케줄로 사무실을 준비하고, 퇴근 후 켜진 냉난방을 감지해 끈다.',
              '업무폰을 KME로 등록하고, Knox Manage로 앱과 정책을 배포한다.', '방문객 동선이 길다.', '시원하게 유지된다. 그리고 전력도 아낀다.', '데이터가 남는다', '수리비 부담이 없다.']:
        print(polite(t))
