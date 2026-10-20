"""평가 지표 — 정답 대비(구조 · 사실) 와 정답 없이 보는 지표(요구 · 선택 · 근거 · 복제 · 형식)."""
from __future__ import annotations

import json
import re
from collections import Counter

from sbagent.brief import Brief
from sbagent.kb import KB, PART_GROUP
from sbagent.references import foreign_terms
from sbagent.text import claims, containment, dice, norm, number_set, supported, unsupported_numbers

COV_T = 0.5  # (보조) 글자 반영: 요구 문장의 2글자 단위 중 절반 이상이 한 파트(이름 + 내용)에 있으면 반영
KEY_T = 0.5  # 요구 반영: 요구의 핵심어(조사를 뗀 낱말 · 수치) 중 절반 이상이 storyboard 글에 있으면 반영
PARTICLE = re.compile(r"(으로|에서|까지|부터|에게|하고|하는|하게|하기|해서|되는|된다|한다|이나|이고|을|를|이|가|은|는|의|에|로|와|과|도|만|한|할|해|된|됨|및)$")
STOP = {"지원", "관리", "기능", "필수", "가능", "위해", "통해", "대한", "있는", "없는", "하나로", "같은", "모든", "모두", "경우", "사용", "제공",
        "필요", "요구", "가능한", "있도록", "위한", "대해", "그리고", "또는", "이상", "이하", "이내", "등", "수", "것", "때", "중", "내", "후", "전"}


def key_terms(text: str) -> list[str]:
    t = re.sub(r"^\s*\[[^\]]{1,10}\]\s*", "", str(text or ""))
    out = []
    for w in re.findall(r"[가-힣]+|[A-Za-z][A-Za-z0-9.+-]*|\d[\d,.]*", t):
        w = w.replace(",", "")
        if re.fullmatch(r"[가-힣]+", w):
            w2 = PARTICLE.sub("", w)
            w = w2 if len(w2) >= 2 else w
            if len(w) < 2 or w in STOP:
                continue
        elif re.fullmatch(r"\d[\d.]*", w):
            if len(w) < 2:
                continue
        elif len(w) < 2:
            continue
        if w not in out:
            out.append(w)
    return out


def term_in(w: str, text_norm: str) -> bool:
    n = norm(w)
    if n in text_norm:
        return True
    return len(n) >= 3 and re.fullmatch(r"[가-힣]+", n) is not None and n[:-1] in text_norm


def ptext(p: dict) -> str:
    items = p.get("items") or []
    if not items and p.get("text"):
        items = [x for x in p["text"].split("\n") if x.strip()]
    return (p.get("name") or "") + "\n" + "\n".join(map(str, items))


def types(parts: list[dict]) -> list[str]:
    return [p["type"] for p in parts if p.get("type") not in ("free", "cover", None)]


def lcs(a: list, b: list) -> int:
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a)):
        for j in range(len(b)):
            dp[i + 1][j + 1] = dp[i][j] + 1 if a[i] == b[j] else max(dp[i][j + 1], dp[i + 1][j])
    return dp[-1][-1]


def type_f1(pred: list[str], gold: list[str]) -> float:
    if not pred or not gold:
        return 0.0
    cp, cg = Counter(pred), Counter(gold)
    tp = sum((cp & cg).values())
    if not tp:
        return 0.0
    p, r = tp / len(pred), tp / len(gold)
    return 2 * p * r / (p + r)


def gold_facts(gold: list[dict], b: Brief, kbx: KB) -> list[str]:
    """정답 storyboard 가 쓴 입력 사실 — 입력에 있는 숫자 · 선택한 제품 모델 · 솔루션 이름."""
    txt = "\n".join(ptext(p) for p in gold)
    facts = sorted({json.dumps(c[:-1], ensure_ascii=False) for c in claims(txt) if supported(c[:-1], b.source_numbers)})
    facts = ["#" + f for f in facts]
    for pid in b.products:
        if norm(kbx.P[pid]["model"]) in norm(txt):
            facts.append("@" + kbx.P[pid]["model"])
    for sid in b.solutions:
        if norm(kbx.S[sid]["name"]) in norm(txt):
            facts.append("@" + kbx.S[sid]["name"])
    return facts


def fact_hit(f: str, pred_txt: str, pred_nums: set) -> bool:
    if f.startswith("#"):
        return supported(tuple(json.loads(f[1:])), pred_nums)
    return norm(f[1:]) in norm(pred_txt)


def aliases(model: str, name: str) -> set[str]:
    """제품 · 솔루션을 부르는 말 — 모델 · 이름 · 괄호 뺀 이름 · 대문자 약칭(SAC · EHS) · 앞 수식어 뺀 이름."""
    out = {model, name, re.sub(r"\s*\(.*?\)", "", name).strip()}
    words = re.sub(r"\s*\(.*?\)", "", name).split()
    if words and re.fullmatch(r"[A-Z]{3,}", words[0]):
        out.add(words[0])
    if len(words) >= 3:
        out.add(" ".join(words[:2]))
        out.add(" ".join(words[1:]))
    return {x for x in out if x and len(norm(x)) >= 3}


def sel_mentioned(b: Brief, kbx: KB, txt: str) -> tuple[int, int]:
    t = norm(txt)
    n = hit = 0
    for pid in b.products:
        x = kbx.P[pid]
        n += 1
        hit += any(norm(v) and norm(v) in t for v in aliases(x["model"], x["name"]))
    for sid in b.solutions:
        n += 1
        hit += any(norm(v) and norm(v) in t for v in aliases("", kbx.S[sid]["name"]))
    return hit, n


def scenario_units(kbx: KB) -> list[str]:
    out = []
    for s in kbx.scenarios:
        out += kbx.scenario_units(s)
    return out


def compute(task: dict, out_parts: list[dict], strategy: str | None, b: Brief, kbx: KB, units: list[str]) -> dict:
    new = [p for p in out_parts if p.get("origin") == "new"]
    m: dict = {"n_parts": len(out_parts), "n_new": len(new)}
    gold = task.get("gold")
    if gold is not None:
        pt, gt = types(new if task["kind"] == "cont" else out_parts), types(gold)
        m["type_f1"] = type_f1(pt, gt)
        m["order_lcs"] = lcs(pt, gt) / max(len(pt), len(gt), 1)
        gg = {PART_GROUP.get(t) for t in gt}
        m["group_cov"] = len({PART_GROUP.get(t) for t in pt} & gg) / max(1, len(gg))
        m["len_diff"] = abs(len(pt) - len(gt))
        facts = gold_facts(gold, b, kbx)
        ptxt = "\n".join(ptext(p) for p in new)
        pn = number_set(ptxt)
        m["n_facts"] = len(facts)
        m["fact_recall"] = (sum(fact_hit(f, ptxt, pn) for f in facts) / len(facts)) if facts else None
    meta = task.get("meta") or {}
    if meta.get("strategy") and strategy:
        m["strategy_acc"] = float(strategy == meta["strategy"])
    # 요구 반영 (storyboard 전체 기준)
    reqs = b.keyman_reqs
    if reqs:
        alln = norm("\n".join(ptext(p) for p in out_parts))
        frac = []
        for r in reqs:
            ks = key_terms(r.text)
            frac.append(sum(term_in(k, alln) for k in ks) / len(ks) if ks else 1.0)
        m["req_cov"] = sum(x >= KEY_T for x in frac) / len(reqs)
        w = [max(r.weight, 0.05) for r in reqs]
        m["req_cov_w"] = sum(wi for wi, x in zip(w, frac) if x >= KEY_T) / sum(w)
        best = [max((containment(r.text, ptext(p)) for p in out_parts), default=0.0) for r in reqs]
        m["req_lex"] = sum(x >= COV_T for x in best) / len(reqs)
    alltxt = "\n".join(ptext(p) for p in out_parts)
    hit, n = sel_mentioned(b, kbx, alltxt)
    if n:
        m["sel_cov"] = hit / n
    # 새 파트 기준 위생 지표
    ntxt = "\n".join(ptext(p) for p in new)
    stray = set()
    src = norm(b.source_text)
    for pid, names in kbx.product_names.items():
        if pid in b.products:
            continue
        for nm in names:
            if len(nm) >= 4 and re.search(r"(?<![A-Za-z0-9])" + re.escape(nm) + r"(?![A-Za-z0-9])", ntxt) and norm(nm) not in src:
                stray.add(nm)
    for sid, names in kbx.solution_names.items():
        if sid not in b.solutions and any(nm in ntxt and norm(nm) not in src for nm in names):
            stray.add(names[0])
    m["stray"] = len(stray)
    m["unsup_num"] = len(unsupported_numbers(ntxt, b.source_numbers))
    ulist = []
    for p in new:
        ulist += [p.get("name") or ""] + [str(x) for x in (p.get("items") or [])]
    ulist = [u for u in ulist if len(norm(u)) >= 4]
    copied = 0
    for u in ulist:
        ref_sim = max((dice(u, x) for x in units), default=0.0)
        if ref_sim >= 0.6 and containment(u, b.source_text) < 0.5:
            copied += 1
    m["copy_rate"] = copied / len(ulist) if ulist else 0.0
    m["foreign"] = len(foreign_terms(ntxt, b.source_text, kbx, limit=99, own_ind=b.ind))
    names = [norm(p.get("name") or "") for p in out_parts]
    tv = all(p.get("type") in kbx.PARTS and p.get("type") != "cover" for p in out_parts)
    m["valid"] = float(tv and len(set(names)) == len(names) and 4 <= len(out_parts) <= 10 and bool(out_parts) and out_parts[-1].get("type") in ("closing", "appendix"))
    m["ends_close"] = float(bool(out_parts) and out_parts[-1].get("type") in ("closing", "appendix"))
    if task["kind"] in ("cont", "open-cont"):
        prev = [p for p in task["proposal"]["parts"]]
        kept = [p for p in out_parts if p.get("origin") == "kept"]
        same = len(kept) == len(prev) and all(norm(a.get("name", "")) == norm(c.get("name", "")) and a.get("type") == c.get("type") for a, c in zip(kept, prev))
        m["keep_ok"] = float(same)
    return m
