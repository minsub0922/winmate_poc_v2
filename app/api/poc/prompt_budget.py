"""프롬프트 예산 — a weak model answers short questions well and long ones badly.

User 2026-11-18: "레이아웃 흐름에서 LLM 프롬프트에 무식하게 긴 경우가 있어. 이건 절대 대답 성능을 내지 못해. 모델 성능이 상당히 안좋은
환경이야. 프롬프트는 최대한 간결해야하고 한번에 필요로 하는 input, output 처리도 제한을 둬야해. 필요하면 fan out/in 패턴을 써서
해결해. 병렬 처리를 많이 활용해도돼."

Measured before (7 real compositions — the admin samples' captured requests, the prompts the composer actually sent on
2026-11-18): one part-writing call (auto_part_fill) carried every sheet of the part — p90 11.9k chars, 36 cells to write; the
part check (auto_part_verify) p90 7.5k chars; the part plan 8.9k; the element repair 5.8k; the part review 4.5k.

The rules every layout-flow call keeps (each module builds its own prompt with these):
- one call answers at most ``WRITE_CELLS`` cells to write or ``CHECK_CELLS`` cells to judge — more is fanned out (a card's
  cells stay together) and the answers are fanned in by code;
- one prompt stays under ``HARD_CHARS``: context fields are cut to fit, the cells asked never are;
- what the call needs only: that sheet's requirements, the facts of that sheet's own items, notes shared by cells said once;
- the calls of one fan-out run at once (``fan_out``) — the provider's queue still bounds the total.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple, TypeVar

T = TypeVar('T')

WRITE_CELLS = 8        # cells one writing call answers
CHECK_CELLS = 12       # cells one checking call reads
SOFT_CHARS = 2400      # a prompt aims under this (≈ 1.3k tokens: the app's model reads Korean at ≈ 1.8 chars a token)
HARD_CHARS = 3200      # never over this: context fields are cut to stay under it
WORKERS = 6            # calls of one fan-out at once
CHARS_PER_TOKEN = 1.8  # measured: app telemetry 2026-10-20 → 11-18, composer stages (input chars ÷ prompt tokens)


def tokens(text: str) -> int:
    return int(len(text or '') / CHARS_PER_TOKEN) + 1


def cut(text: Any, n: int) -> str:
    """one line of at most ``n`` chars (whitespace collapsed; '…' when cut)"""
    t = re.sub(r'\s+', ' ', str(text or '')).strip()
    return t if len(t) <= n else t[:max(1, n - 1)].rstrip() + '…'


def dump(value: Any) -> str:
    """compact JSON (no spaces, Korean as is) — the cells and lists a prompt carries"""
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def pack(groups: Sequence[Sequence[T]], size: int) -> List[List[T]]:
    """groups (a card's cells …) packed into chunks of at most ``size``; a group stays whole unless it alone is larger"""
    out: List[List[T]] = []
    cur: List[T] = []
    for g in groups:
        g = list(g)
        if not g:
            continue
        if len(g) > size:   # a group too large for one call: its own chunks
            if cur:
                out.append(cur)
                cur = []
            out += [g[k:k + size] for k in range(0, len(g), size)]
            continue
        if len(cur) + len(g) > size:
            out.append(cur)
            cur = []
        cur += g
    if cur:
        out.append(cur)
    return out


def shared_notes(cells: List[dict], key: str = 'note', label: str = '메모') -> Tuple[List[dict], List[str]]:
    """a note several cells carry is said once ('칸 3 · 5 · 7: …'); a note of one cell stays on it"""
    by: Dict[str, List[Any]] = {}
    for c in cells:
        if c.get(key):
            by.setdefault(c[key], []).append(c.get('i'))
    lines, out = [], []
    for note, ids in by.items():
        if len(ids) >= 2:
            lines.append(f"칸 {' · '.join(str(i) for i in ids)}: {note}")
    shared = {n for n, ids in by.items() if len(ids) >= 2}
    for c in cells:
        out.append({k: v for k, v in c.items() if not (k == key and v in shared)})
    return out, lines


def fit(build: Callable[[int], str], levels: int = 4) -> str:
    """the prompt at the richest context level that stays under ``HARD_CHARS`` (level 0 = all context, higher = less)"""
    prompt = build(0)
    level = 0
    while len(prompt) > HARD_CHARS and level < levels:
        level += 1
        prompt = build(level)
    return prompt


def fan_out(fn: Callable[[T], Any], jobs: Iterable[T], workers: int = WORKERS) -> List[Tuple[T, Any, Optional[BaseException]]]:
    """``fn`` over the jobs at once → [(job, result, error)] in the jobs' order. A cancelled job stops the fan-out (raised);
    any other error is returned with its job so the caller decides (the other answers are kept)."""
    jobs = list(jobs)
    if not jobs:
        return []
    if len(jobs) == 1:
        try:
            return [(jobs[0], fn(jobs[0]), None)]
        except Exception as exc:  # noqa: BLE001
            if cancelled(exc):
                raise
            return [(jobs[0], None, exc)]
    out: List[Tuple[T, Any, Optional[BaseException]]] = []
    with ThreadPoolExecutor(max_workers=max(1, min(workers, len(jobs)))) as pool:
        futures = [(j, pool.submit(copy_context().run, fn, j)) for j in jobs]
        for j, f in futures:
            try:
                out.append((j, f.result(), None))
            except Exception as exc:  # noqa: BLE001
                if cancelled(exc):
                    raise
                out.append((j, None, exc))
    return out


def cancelled(exc: BaseException) -> bool:
    return type(exc).__name__ == 'JobCancelled' or getattr(exc, 'code', '') == 'cancelled'


def first_error(results: Sequence[Tuple[Any, Any, Optional[BaseException]]]) -> Optional[BaseException]:
    return next((e for _, _, e in results if e is not None), None)
