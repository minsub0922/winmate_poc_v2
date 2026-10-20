"""⑤ 검증 · ⑥ 규칙 수리."""
from __future__ import annotations

import re

from .brief import Brief
from .kb import KB, STAGE_OF, STAGE_ORDER
from .planner import NAME_TPL, _rule_part
from .references import Ref, foreign_terms
from .situation import Situation
from .text import clip, containment, dice, norm, unsupported_claims, unsupported_numbers

CLOSERS = ("closing", "appendix")


def _num_pat(n: str) -> str:
    """'2129' → 2,?1,?2,?9 — 쉼표가 들어간 표기도 같은 수로 찾는다."""
    return ",?".join(re.escape(ch) for ch in n).replace(",?\\.,?", "\\.")


def part_text(p: dict) -> str:
    items = p.get("items") or []
    if not items and p.get("text"):
        items = [x for x in p["text"].split("\n") if x.strip()]
    return (p.get("name") or "") + "\n" + "\n".join(map(str, items))


def resolve(draft: dict, b: Brief, kbx: KB) -> tuple[list[dict], list[dict]]:
    """LLM/규칙 초안 → 파트 목록. keep 항목은 이전 파트 원본으로 바꾸고, 빠지거나 순서가 바뀐 이전 파트는 원래 순서로 되돌린다."""
    issues = []
    prev = b.prev_parts
    out: list[dict] = []
    emitted = 0
    seen_keep: list[int] = []
    for e in draft.get("parts") or []:
        if not isinstance(e, dict):
            continue
        k = str(e.get("keep") or "").strip()
        m = re.fullmatch(r"P(\d+)", k)
        if m and prev:
            i = int(m.group(1)) - 1
            if 0 <= i < len(prev):
                seen_keep.append(i)
                while emitted <= i:
                    out.append({**prev[emitted], "origin": "kept", "_pi": emitted})
                    emitted += 1
            continue
        t = e.get("type")
        if t not in kbx.PARTS or t in ("cover", "free"):
            if t:
                issues.append({"code": "type", "detail": f"쓸 수 없는 유형 '{t}' — 뺌"})
            continue
        items = [clip(str(x), 60) for x in (e.get("items") or []) if str(x).strip()]
        dedup = []
        for x in items:
            if all(dice(x, y) < 0.9 for y in dedup):
                dedup.append(x)
        out.append({"type": t, "name": clip(str(e.get("name") or kbx.PARTS[t]["label"]), 24), "goal": clip(str(e.get("goal") or ""), 80),
                    "items": dedup[:5], "answers": [str(a) for a in (e.get("answers") or []) if re.fullmatch(r"R\d+", str(a))],
                    "ref": str(e.get("ref") or ""), "adapted": clip(str(e.get("adapted") or ""), 80), "origin": "new"})
    if prev:
        if emitted < len(prev):
            issues.append({"code": "keep", "detail": f"이전 파트 {len(prev) - emitted}개가 빠져 원래 순서로 넣음"})
        if seen_keep != sorted(seen_keep):
            issues.append({"code": "keep", "detail": "이전 파트 순서가 바뀌어 원래 순서로 되돌림"})
        while emitted < len(prev):
            # 마무리 파트 앞에 넣는다
            pos = len(out)
            if out and out[-1].get("type") in CLOSERS and out[-1].get("origin") == "new":
                pos -= 1
            out.insert(pos, {**prev[emitted], "origin": "kept", "_pi": emitted})
            emitted += 1
    return out, issues


def check(parts: list[dict], b: Brief, sit: Situation, refs: list[Ref], kbx: KB) -> list[dict]:
    issues: list[dict] = []
    new = [p for p in parts if p.get("origin") == "new"]
    # 중복
    for i, p in enumerate(parts):
        for q in parts[:i]:
            if p.get("origin") == "new" and (norm(p["name"]) == norm(q.get("name", "")) or (p["type"] == q.get("type") and dice(p["name"], q.get("name", "")) >= 0.8)):
                issues.append({"code": "dup", "detail": f"'{p['name']}' 가 '{q.get('name')}' 와 겹침", "part": p["name"]})
                break
    lo, hi = sit.budget
    if len(parts) > hi:
        issues.append({"code": "budget", "detail": f"파트 {len(parts)}개 — {hi}개 이하로"})
    if len(parts) < lo:
        issues.append({"code": "budget", "detail": f"파트 {len(parts)}개 — {lo}개 이상으로"})
    # 요구 반영
    for r in b.keyman_reqs:
        if not (r.weight >= 0.2 or r.must):
            continue
        declared = any(r.id in p.get("answers", []) for p in parts)
        textual = max((containment(r.text, part_text(p)) for p in parts), default=0.0)
        if not declared and textual < 0.5:
            issues.append({"code": "uncovered", "detail": f"{r.id} '{clip(r.text, 50)}' 에 답하는 파트가 없음", "req": r.id})
    # 선택 밖 제품 · 솔루션
    for p in new:
        txt = part_text(p)
        for pid, names in kbx.product_names.items():
            if pid in b.products:
                continue
            for nm in names:
                if len(nm) >= 4 and re.search(r"(?<![A-Za-z0-9])" + re.escape(nm) + r"(?![A-Za-z0-9])", txt) and norm(nm) not in norm(b.source_text):
                    issues.append({"code": "stray", "detail": f"'{p['name']}': 선택하지 않은 제품 {nm}", "part": p["name"], "term": nm})
        for sid, names in kbx.solution_names.items():
            if sid in b.solutions:
                continue
            for nm in names:
                if nm in txt and norm(nm) not in norm(b.source_text):
                    issues.append({"code": "stray", "detail": f"'{p['name']}': 선택하지 않은 솔루션 {nm}", "part": p["name"], "term": nm})
    # 근거 없는 수치
    for p in new:
        bad = unsupported_numbers(part_text(p), b.source_numbers)
        if bad:
            issues.append({"code": "number", "detail": f"'{p['name']}': 입력에 없는 수치 {', '.join(bad[:5])}", "part": p["name"], "nums": bad})
    # 레퍼런스 고유 표현
    own = norm(b.source_text)
    avoid = sorted({a for r in refs for a in r.avoid}, key=lambda x: (-len(x), x))
    for p in new:
        txt = part_text(p)
        hit = [a for a in avoid if a in txt and norm(a) not in own]
        hit += [a for a in foreign_terms(txt, b.source_text, kbx, limit=20, own_ind=b.ind) if a not in hit]
        if hit:
            issues.append({"code": "leak", "detail": f"'{p['name']}': 레퍼런스 고유 표현 {', '.join(hit[:4])}", "part": p["name"], "terms": hit})
    # 흐름
    if parts and parts[-1].get("type") not in CLOSERS:
        issues.append({"code": "flow", "detail": "마지막이 결정 요청 · 다음 단계(closing)가 아님"})
    return issues


def fix(parts: list[dict], issues: list[dict], b: Brief, sit: Situation, refs: list[Ref], kbx: KB) -> tuple[list[dict], list[str]]:
    """남은 문제를 규칙으로 고친다. 반환: (파트, 한 일 목록)."""
    done: list[str] = []
    parts = [dict(p) for p in parts]
    own = norm(b.source_text)
    # 중복 — 뒤에 나온 새 파트를 앞 파트에 합친다
    out: list[dict] = []
    for p in parts:
        twin = None
        if p.get("origin") == "new":
            for q in out:
                if norm(p["name"]) == norm(q.get("name", "")) or (p["type"] == q.get("type") and dice(p["name"], q.get("name", "")) >= 0.8):
                    twin = q
                    break
        if twin is not None:
            if twin.get("origin") == "new":
                twin["items"] = (twin.get("items") or []) + [x for x in p.get("items", []) if x not in twin.get("items", [])]
                twin["items"] = twin["items"][:5]
                twin["answers"] = sorted(set(twin.get("answers", [])) | set(p.get("answers", [])))
            done.append(f"중복 '{p['name']}' 합침")
            continue
        out.append(p)
    parts = out
    for p in parts:
        if p.get("origin") != "new":
            continue
        items = []
        for x in p.get("items", []):
            y = x
            for i in issues:
                if i["code"] == "stray" and i.get("part") == p["name"] and i["term"] in y:
                    y = ""
            bad_terms = {a for r in refs for a in r.avoid} | set(foreign_terms(y, b.source_text, kbx, limit=20, own_ind=b.ind))
            for a in sorted(bad_terms, key=lambda x: (-len(x), x)):
                if y and a in y and norm(a) not in own:
                    y = ""
            if y:
                for c in sorted(unsupported_claims(y, b.source_numbers), key=lambda c: -c[-1][0]):
                    a, e, _ = c[-1]
                    y = y[:a] + "[확인 필요]" + y[e:]
            if y:
                items.append(y)
        if len(items) != len(p.get("items", [])):
            done.append(f"'{p['name']}' 항목 {len(p.get('items', [])) - len(items)}개 뺌(선택 밖 이름 · 레퍼런스 표현)")
        if any(a in p["name"] and norm(a) not in own for r in refs for a in r.avoid):
            p["name"] = NAME_TPL.get(p["type"], kbx.PARTS[p["type"]]["label"]).format(cust=b.customer or "고객사", ind="시장")
            done.append(f"'{p['type']}' 파트 이름을 기본 이름으로")
        p["items"] = items or [x for x in kbx.PARTS[p["type"]].get("items", [])][:2]
    # 요구 미반영 — 선호 유형 파트에 항목으로, 없으면 파트 추가
    used = {a for p in parts for a in p.get("answers", [])}
    for i in issues:
        if i["code"] != "uncovered":
            continue
        r = next((x for x in b.reqs if x.id == i["req"]), None)
        if not r:
            continue
        tgt = next((p for t in r.prefer for p in parts if p["type"] == t and p.get("origin") == "new"), None)
        present = {p["type"] for p in parts}
        t_new = next((t for t in r.prefer if t not in present), None)  # 이미 있는(유지한) 유형을 또 만들지 않는다
        if tgt is None and t_new and len(parts) < sit.budget[1]:
            tgt = _rule_part(t_new, b, sit, kbx, used - {r.id}, "")
            tgt["origin"] = "new"
            pos = len(parts) - (1 if parts and parts[-1]["type"] in CLOSERS else 0)
            for j, q in enumerate(parts):
                if STAGE_ORDER.index(STAGE_OF.get(q["type"], "value")) > STAGE_ORDER.index(STAGE_OF.get(tgt["type"], "value")) and q.get("origin") == "new":
                    pos = j
                    break
            parts.insert(pos, tgt)
            done.append(f"{r.id} 에 답하는 '{tgt['name']}' 파트 추가")
        elif tgt is None:
            tgt = next((p for p in parts if p.get("origin") == "new" and p["type"] not in CLOSERS and len(p.get("items", [])) < 5), None)
        if tgt is not None and r.id not in tgt.get("answers", []):
            if not any(containment(r.text, x) >= 0.5 for x in tgt.get("items", [])):
                tgt["items"] = (tgt.get("items") or [])[:4] + [clip(re.sub(r"^\[[^\]]{1,8}\]\s*", "", r.text), 45)]
            tgt["answers"] = sorted(set(tgt.get("answers", [])) | {r.id})
            done.append(f"{r.id} 를 '{tgt['name']}' 에 반영")
    # 마무리를 끝으로
    closers = [p for p in parts if p["type"] in CLOSERS and p.get("origin") == "new"]
    if parts and parts[-1]["type"] not in CLOSERS:
        if closers:
            parts.remove(closers[-1])
            parts.append(closers[-1])
            done.append("마무리 파트를 끝으로 옮김")
        else:
            c = _rule_part("closing", b, sit, kbx, set(), "")
            c["origin"] = "new"
            parts.append(c)
            done.append("마무리(다음 단계) 파트 추가")
    # 예산 — 요구와 연결 안 된 새 파트부터 뺀다
    hi = sit.budget[1]
    while len(parts) > hi:
        cands = [p for p in parts if p.get("origin") == "new" and p["type"] not in CLOSERS]
        if not cands:
            break
        drop = min(cands, key=lambda p: (len(p.get("answers", [])), -parts.index(p)))
        parts.remove(drop)
        done.append(f"분량 맞추려 '{drop['name']}' 뺌")
    return parts, done
