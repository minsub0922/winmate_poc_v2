"""제안 시뮬레이션 실성능 검증(sim_eval) — 실행 · 이어 돌리기 · 실시간 보기.

sim_eval 은 Node 로 돈다(앱의 src/sim 엔진을 그대로 묶어 씀). 이 어댑터는
  - node run.mjs 를 하위 프로세스로 띄우고(작업 로그로 흘림),
  - runs/<id>/run.json · sessions/*.jsonl 을 읽어 화면에 실시간으로 보여 준다.
터미널에서 직접 돌린 실행도 같은 폴더에 쌓이므로 이 화면에서 그대로 보인다.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path

from core import JOBS, TEST_DIR, Job

SIM_DIR = TEST_DIR / "sim_eval"
RUNS = SIM_DIR / "runs"
_PROCS: dict[str, subprocess.Popen] = {}
_ID = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


def available() -> dict:
    node = shutil.which("node")
    ok = (SIM_DIR / "run.mjs").exists()
    return {"ok": ok and bool(node), "node": node or "", "dir": str(SIM_DIR), "error": "" if node else "node 가 없습니다(Node 18 이상 필요)"}


def _read_jsonl(p: Path) -> list[dict]:
    out = []
    try:
        with p.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass  # 쓰는 중인 마지막 줄
    except FileNotFoundError:
        pass
    return out


def _run_dir(run_id: str) -> Path:
    if not _ID.match(run_id):
        raise ValueError("잘못된 실행 id")
    d = RUNS / run_id
    if not (d / "run.json").exists():
        raise FileNotFoundError(run_id)
    return d


def list_runs() -> list[dict]:
    out = []
    if not RUNS.exists():
        return out
    for d in RUNS.iterdir():
        p = d / "run.json"
        if not p.exists():
            continue
        try:
            r = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        ss = r.get("sessions", [])
        out.append({
            "id": r.get("id", d.name), "tag": r.get("tag"), "created": r.get("created"), "finished": r.get("finished"), "status": r.get("status"),
            "models": r.get("models"), "engine": (r.get("engine") or {}).get("which") or "current", "engine_label": (r.get("engine") or {}).get("label", ""),
            "n": len(ss), "done": sum(1 for s in ss if s.get("status") in ("won", "lost", "ended", "error")), "won": sum(1 for s in ss if s.get("status") == "won"),
            "note": r.get("note", ""), "has_report": (d / "report.html").exists(), "mtime": p.stat().st_mtime,
            "live": any(s.get("status") in ("running", "judging") for s in ss) and time.time() - p.stat().st_mtime < 120,
        })
    out.sort(key=lambda x: x.get("created") or "", reverse=True)
    return out


def _session_brief(events: list[dict], meta: dict) -> dict:
    start = next((e for e in events if e.get("type") == "start"), {})
    turns = [e for e in events if e.get("type") == "turn"]
    end = next((e for e in events if e.get("type") == "end"), None)
    judge = next((e for e in events if e.get("type") == "judge"), None)
    last = turns[-1] if turns else None
    checks: dict[str, int] = {}
    for t in turns:
        for c in t.get("checks") or []:
            checks[c["id"]] = checks.get(c["id"], 0) + 1
    return {
        "id": meta.get("id"), "status": (end or {}).get("status") or meta.get("status"), "pid": meta.get("pid"), "level": meta.get("level"), "mode": meta.get("mode"), "sid": meta.get("sid"),
        "customer": start.get("customer"), "person": start.get("person"), "levelName": start.get("levelName"), "modeLabel": start.get("modeLabel"), "indName": start.get("indName"),
        "scenarioTitle": start.get("scenarioTitle"), "ask": start.get("ask"), "win": start.get("win"), "lose": start.get("lose"), "maxTurns": start.get("maxTurns"),
        "trend": [{"n": t["n"], "sat": t["ev"]["satisfaction"], "q": t["ev"].get("quality"), "d": t["ev"].get("delta", 0), "end": t["ev"].get("end"),
                   "rv": t["ev"].get("revealed") or [], "rs": t["ev"].get("resolved") or [], "ai": (t.get("customer") or {}).get("ai", True), "w": len(t.get("checks") or [])} for t in turns],
        "concerns": (last or {}).get("concerns") or [{"id": c["id"], "short": c["text"][:16], "revealed": False, "resolved": False} for c in start.get("concerns", [])],
        "last": (last or {}).get("customer", {}).get("text", "")[:160] if last else "",
        "checks": checks, "judge": ({"scores": judge.get("scores"), "expected": judge.get("expected_outcome"), "summary": judge.get("summary")} if judge else None),
    }


def get_run(run_id: str) -> dict:
    d = _run_dir(run_id)
    r = json.loads((d / "run.json").read_text(encoding="utf-8"))
    sessions = [_session_brief(_read_jsonl(d / "sessions" / f"{m['id']}.jsonl"), m) for m in r.get("sessions", [])]
    summary = None
    if (d / "summary.json").exists():
        try:
            s = json.loads((d / "summary.json").read_text(encoding="utf-8"))
            summary = {k: s.get(k) for k in ("totals", "modes", "levels", "judgeDims", "checks")}
        except (json.JSONDecodeError, OSError):
            summary = None
    return {"run": {k: v for k, v in r.items() if k != "sessions"}, "sessions": sessions, "summary": summary,
            "has_report": (d / "report.html").exists(), "mtime": (d / "run.json").stat().st_mtime}


def get_session(run_id: str, sid: str) -> dict:
    d = _run_dir(run_id)
    if not _ID.match(sid):
        raise ValueError("잘못된 세션 id")
    ev = _read_jsonl(d / "sessions" / f"{sid}.jsonl")
    for e in ev:
        e.pop("raw", None)  # 화면에는 원문(평가 JSON)을 싣지 않는다 — 파일에는 남아 있음
    return {"events": ev}


def _spawn(job: Job, args: list[str]) -> dict:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("node 가 없습니다 — Node 18 이상을 설치하세요")
    env = {**os.environ, "NODE_NO_WARNINGS": "1"}
    p = subprocess.Popen([node, "run.mjs", *args], cwd=str(SIM_DIR), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    _PROCS[job.id] = p
    run_id = ""
    try:
        assert p.stdout is not None
        for line in p.stdout:
            line = line.rstrip()
            if not line:
                continue
            m = re.match(r"^▶ (\S+) ·", line)
            if m and not run_id:
                run_id = m.group(1)
                job.ctx["run"] = run_id
                job.result = {"run": run_id}
            job.log(line, "error" if line.lstrip().startswith("✗") else "info")
        p.wait()
    finally:
        _PROCS.pop(job.id, None)
    if p.returncode not in (0, None) and p.returncode != -signal.SIGTERM:
        raise RuntimeError(f"run.mjs 종료 코드 {p.returncode}")
    return {"run": run_id, "returncode": p.returncode}


def start(body: dict) -> Job:
    args: list[str] = []
    tag = re.sub(r"[^A-Za-z0-9_-]", "", str(body.get("tag") or "tb"))[:30] or "tb"
    args += ["--tag", tag]
    if body.get("set"):
        args += ["--set", str(body["set"])]
    modes = [m for m in (body.get("modes") or ["scenario"]) if m in ("scenario", "expert", "suggest", "weak")]
    args += ["--modes", ",".join(modes or ["scenario"])]
    ctr = body.get("controls") or {}
    parts = [f"{k}:{int(v)}" for k, v in ctr.items() if k in ("weak", "suggest") and int(v or 0) > 0]
    args += ["--controls", ",".join(parts) if parts else "none"]
    if body.get("only"):
        args += ["--only", re.sub(r"[^A-Za-z0-9,]", "", str(body["only"]))]
    args += ["--turns", str(max(2, min(30, int(body.get("turns") or 14))))]
    args += ["--concurrency", str(max(1, min(16, int(body.get("concurrency") or 4))))]
    if body.get("engine") == "baseline":
        args += ["--engine", "baseline"]
    if not body.get("judge", True):
        args.append("--no-judge")
    if body.get("persona_level"):
        args.append("--persona-level")
    if body.get("offline"):
        args.append("--offline")
    title = f"시뮬레이션 · {tag} · {','.join(modes)}"
    return JOBS.submit("sim", title, {"args": args}, lambda job: _spawn(job, args))


def resume(run_id: str, concurrency: int = 4) -> Job:
    _run_dir(run_id)
    args = ["--resume", run_id, "--concurrency", str(max(1, min(16, int(concurrency or 4))))]
    return JOBS.submit("sim", f"시뮬레이션 이어서 · {run_id}", {"args": args}, lambda job: _spawn(job, args))


def stop(job_id: str) -> bool:
    p = _PROCS.get(job_id)
    if not p:
        return False
    p.send_signal(signal.SIGINT)  # run.mjs 가 상태를 저장하고 '멈춤'으로 끝낸다

    def _kill_later() -> None:
        time.sleep(15)
        if p.poll() is None:
            p.terminate()
    threading.Thread(target=_kill_later, daemon=True).start()
    return True


def report(run_id: str) -> dict:
    """요약 · 리포트를 다시 만든다(멈춘 실행도 지금까지 기록으로)."""
    d = _run_dir(run_id)
    node = shutil.which("node")
    if not node:
        raise RuntimeError("node 가 없습니다")
    r = subprocess.run([node, "lib/report.mjs", str(d)], cwd=str(SIM_DIR), capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout)[-400:])
    return {"ok": True, "headline": r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""}
