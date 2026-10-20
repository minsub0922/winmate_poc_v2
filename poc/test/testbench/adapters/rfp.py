"""RFP → 고객 요구사항 정리(poc/test/rfp_pipeline.py) 어댑터."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from core import TEST_DIR, Job

if str(TEST_DIR) not in sys.path:
    sys.path.insert(0, str(TEST_DIR))

CONDS = ["single", "chunk_nocarry", "chunk_carry", "chunk_carry_gap"]
RESULTS = TEST_DIR / "results"


def _mods():
    import rfp_pipeline as rp  # noqa: WPS433 — 실행 시점에 불러야 파일 수정이 반영된다
    import run_experiment as rx
    return rp, rx


def _tcs() -> list[dict]:
    return json.loads((TEST_DIR / "tc" / "rfp_tc.json").read_text(encoding="utf-8"))["tcs"]


def available() -> dict:
    ok = (TEST_DIR / "rfp_pipeline.py").exists() and (TEST_DIR / "tc" / "rfp_tc.json").exists()
    return {"ok": ok, "path": str(TEST_DIR / "rfp_pipeline.py")}


def list_tcs() -> list[dict]:
    out = []
    for t in _tcs():
        cps = sum(len(p["checkpoints"]) for p in t["expected"]["projects"])
        out.append({"id": t["id"], "title": t["title"], "kind": t["kind"], "chars": len(t["input"]), "checkpoints": cps,
                    "projects": len(t["expected"]["projects"]), "source_file": t.get("source_file", "")})
    return out


def get_tc(tc_id: str) -> dict:
    t = next(t for t in _tcs() if t["id"] == tc_id)
    return {"id": t["id"], "title": t["title"], "input": t["input"],
            "checkpoints": [{"project": p["key"], "id": c["id"], "cat": c.get("cat", ""), "desc": c["desc"]} for p in t["expected"]["projects"] for c in p["checkpoints"]]}


def run(job: Job, params: dict | None = None) -> dict:
    p = params or job.params
    rp, rx = _mods()
    env = rp.load_env()
    backend_name = p.get("backend", "gemini")
    if backend_name == "gemini" and not env.get("GEMINI_API_KEY"):
        raise RuntimeError("poc/.env 에 GEMINI_API_KEY 가 없습니다 — rules 또는 replay 백엔드로 실행하세요")
    backend = rx.make_backend(backend_name, env, RESULTS / "cache", int(p.get("rpm") or 30))
    if hasattr(backend, "verbose"):
        backend.verbose = False
    model = env.get("GEMINI_MODEL") or "gemini-3.1-flash-lite"
    if backend_name == "gemini":
        job.log("Gemini 연결 확인 중")
        job.log(backend.preflight())

    orig = backend.complete

    def logged(stage, system, user, meta):  # 단계별 진행 상황을 화면에 흘린다
        idx = meta.get("idx")
        job.log(f"{stage}" + (f" · 조각 {idx}" if idx is not None else "") + (f" · 사업 {meta['project'].get('name', '')}" if stage == "consolidate" and meta.get("project") else ""))
        t0 = time.time()
        out = orig(stage, system, user, meta)
        last = backend.calls[-1] if backend.calls else None
        if last is not None:
            job.log(f"  └ {int((time.time() - t0) * 1000)}ms" + (" · 캐시" if getattr(last, "cached", False) else "") +
                    (f" · 토큰 {last.prompt_tokens}+{last.output_tokens}" if getattr(last, "prompt_tokens", 0) else ""))
        return out
    backend.complete = logged

    tc = None
    if p.get("source") == "tc":
        tc = next(t for t in _tcs() if t["id"] == p["tc_id"])
        text = tc["input"]
    else:
        text = (p.get("text") or "").strip()
        if len(text) < 50:
            raise ValueError("원문이 너무 짧습니다(50자 이상)")
    cond = p.get("condition", "chunk_carry_gap")
    if cond not in CONDS:
        raise ValueError(f"조건은 {CONDS} 중 하나")
    mc = len(text) if cond == "single" else int(p.get("max_chars") or 1500)
    enrich_key = env.get("TAVILY_API_KEY", "") if p.get("enrich") else ""
    job.log(f"시작 — {tc['id'] if tc else '직접 입력'} · {cond}@{mc} · {backend_name} · {len(text):,}자")
    if tc:
        sources = {t["expected"]["projects"][0]["key"]: rp.norm(t["input"]) for t in _tcs() if t["kind"] == "single"}
        out = rx.run_one(tc, cond, mc, backend, enrich_key, sources)
    else:
        n0, t0 = len(backend.calls), time.time()
        res = rp.run_pipeline(text, backend, rp.RunConfig(condition=cond, max_chars=mc, enrich=bool(enrich_key)))
        if enrich_key:
            res.enrich = rp.enrich_terms(res.forms, enrich_key)
        calls = backend.calls[n0:]
        out = {"res": res, "score": None, "cost": {"calls": len(calls), "cached": sum(c.cached for c in calls), "prompt_tokens": sum(c.prompt_tokens for c in calls),
                                                   "output_tokens": sum(c.output_tokens for c in calls), "ms": int((time.time() - t0) * 1000),
                                                   "errors": [c.error for c in calls if c.error]}}
    res = out["res"]
    saved = ""
    if p.get("save"):
        run_dir = RESULTS / (time.strftime("webui-%Y%m%d-%H%M%S-") + backend_name)
        rx.save(run_dir / (tc["id"] if tc else "custom") / f"{cond}@{mc}", out)
        saved = str(run_dir.relative_to(TEST_DIR))
        job.log(f"저장 — {saved}")
    sc = out["score"]
    job.log(f"완료 — 항목 {len(res.items)}개 · 사업 {len(res.forms)}개" + (f" · recall {sc['recall']:.3f}" if sc else "") + f" · 호출 {out['cost']['calls']}회")
    return {"meta": {"tc": tc["id"] if tc else None, "title": tc["title"] if tc else "직접 입력", "condition": cond, "max_chars": mc, "backend": backend_name,
                     "model": model if backend_name != "rules" else "rules", "chars": len(text), "saved": saved, "prompt_version": getattr(rp, "PROMPT_VERSION", "")},
            "source": text, "profile": res.profile, "chunks": res.chunks, "items": res.items, "forms": res.forms, "trace": res.trace,
            "guards": res.guards, "enrich": res.enrich, "score": sc, "cost": out["cost"]}


# ---------------------------------------------------------------- 저장된 실험 결과
def list_runs() -> list[dict]:
    out = []
    if not RESULTS.exists():
        return out
    for d in sorted(RESULTS.iterdir(), key=lambda x: x.name, reverse=True):
        s = d / "summary.json"
        if not s.exists():
            continue
        try:
            j = json.loads(s.read_text(encoding="utf-8"))
        except ValueError:
            continue
        rows = j.get("rows", [])
        out.append({"run_id": d.name, "backend": j.get("meta", {}).get("backend"), "model": j.get("meta", {}).get("model"),
                    "prompt_version": j.get("meta", {}).get("prompt_version"), "n": len(rows),
                    "recall": round(sum(r.get("recall", 0) for r in rows) / len(rows), 3) if rows else None})
    return out


def get_run(run_id: str) -> dict:
    d = _safe(RESULTS, run_id)
    j = json.loads((d / "summary.json").read_text(encoding="utf-8"))
    for r in j.get("rows", []):
        r["has_detail"] = (d / r["tc"] / f"{r['cond']}@{r['max_chars']}" / "result.json").exists()
    return j


def get_run_detail(run_id: str, tc: str, tag: str) -> dict:
    d = _safe(RESULTS, run_id, tc, tag)
    full = json.loads((d / "result.json").read_text(encoding="utf-8"))
    t = next((x for x in _tcs() if x["id"] == tc), None)
    cond, _, mc = tag.partition("@")
    full["meta"] = {"tc": tc, "title": t["title"] if t else tc, "condition": cond, "max_chars": int(mc or 0), "backend": "saved", "model": run_id, "saved": f"results/{run_id}"}
    full["source"] = t["input"] if t else ""
    return full


def _safe(root: Path, *parts: str) -> Path:
    p = root.joinpath(*parts).resolve()
    if root.resolve() not in p.parents and p != root.resolve():
        raise ValueError("잘못된 경로")
    return p


def to_layout_input(form: dict, source: str = "", title: str = "") -> dict:
    """정리된 고객 요구 폼 → 레이아웃 Agent 입력(ProposalInput)."""
    return {
        "id": "rfp_" + time.strftime("%H%M%S"), "title": title or form.get("project", ""), "customer": form.get("customer", ""),
        "project": form.get("project", ""), "target": form.get("target", ""), "free_text": form.get("free", ""), "note": form.get("note", ""),
        "keymen": [{"name": k["name"], "weight": k.get("weight", 0), "reqs": k.get("reqs", [])} for k in form.get("keymen", [])],
        "files": [{"name": "RFP 원문.md", "text": source[:30000]}] if source else [],
    }
