"""자동 테스트 · 배치 평가 — 각 모듈의 테스트 스위트와 평가 스크립트를 하위 프로세스로 돌리고 출력을 흘린다."""
from __future__ import annotations

import os
import re
import subprocess
import sys
import time

from core import JOBS, LAYOUT_DIR, TEST_DIR, Job

SUITES = {
    "rfp_unit": {"title": "RFP 요구사항 정리 · 단위 테스트", "cwd": TEST_DIR, "cmd": [sys.executable, "-m", "unittest", "-v", "test_rfp_pipeline"]},
    "layout_unit": {"title": "레이아웃 Agent · 단위 테스트", "cwd": LAYOUT_DIR, "cmd": [sys.executable, "-m", "pytest", "-v", "-p", "no:cacheprovider", "tests"]},
}
PYTEST_RE = re.compile(r"^(?P<name>\S+::\S+)\s+(?P<st>PASSED|FAILED|SKIPPED|ERROR|XFAIL|XPASS)")
UNIT_RE = re.compile(r"^(?P<name>test\w*) \((?P<cls>[\w.]+)\)\s*\.\.\.\s*(?P<st>ok|FAIL|ERROR|skipped.*)$")
UNIT_HEAD = re.compile(r"^(?P<name>test\w*) \((?P<cls>[\w.]+)\)$")  # docstring 이 있으면 이름 줄과 결과 줄이 나뉜다
UNIT_TAIL = re.compile(r"\.\.\.\s*(?P<st>ok|FAIL|ERROR|skipped.*)$")


def _stream(job: Job, cmd: list[str], cwd, env_extra: dict | None = None, timeout: int = 3600) -> dict:
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONUNBUFFERED="1", **(env_extra or {}))
    job.log("$ " + " ".join(str(c) for c in cmd[1:]))
    t0 = time.time()
    p = subprocess.Popen(cmd, cwd=str(cwd), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    tests, lines = [], []
    pending = None

    def cls_of(c: str) -> str:
        return next((x for x in reversed(c.split(".")) if x[:1].isupper()), c)

    def add(name: str, st: str) -> None:
        st = {"ok": "PASSED", "FAIL": "FAILED"}.get(st, "SKIPPED" if st.startswith("skipped") else st)
        tests.append({"name": name, "status": st})
    for line in p.stdout:  # type: ignore[union-attr]
        line = line.rstrip("\n")
        lines.append(line)
        m = PYTEST_RE.match(line) or UNIT_RE.match(line)
        if m:
            add(m.group("name") + (f" ({cls_of(m.group('cls'))})" if "cls" in m.groupdict() else ""), m.group("st"))
            pending = None
        elif UNIT_HEAD.match(line):
            mh = UNIT_HEAD.match(line)
            pending = mh.group("name") + f" ({cls_of(mh.group('cls'))})"
        elif pending and UNIT_TAIL.search(line):
            add(pending, UNIT_TAIL.search(line).group("st"))
            pending = None
        level = "error" if re.search(r"FAIL|ERROR|Traceback", line) else "info"
        job.log(line, level)
        if time.time() - t0 > timeout:
            p.kill()
            job.log("시간 초과로 중단", "error")
            break
    rc = p.wait()
    tail = "\n".join(lines[-40:])
    return {"returncode": rc, "tests": tests, "passed": sum(t["status"] == "PASSED" for t in tests), "failed": sum(t["status"] in ("FAILED", "ERROR") for t in tests),
            "skipped": sum(t["status"] == "SKIPPED" for t in tests), "tail": tail, "seconds": round(time.time() - t0, 1)}


def start_suite(key: str, live: bool = False) -> Job:
    s = SUITES[key]
    env = {"RFP_LIVE": "1" if live else "0"} if key == "rfp_unit" else {}
    return JOBS.submit("selftest", s["title"] + (" (Gemini 라이브 포함)" if live else ""), {"suite": key, "live": live},
                       lambda job: _stream(job, s["cmd"], s["cwd"], env))


def start_layout_eval(set_: str, llm: str, only: str = "", render: bool = True) -> Job:
    name = time.strftime("webui-%m%d-%H%M%S-") + llm + "-" + set_
    cmd = [sys.executable, "eval/run_eval.py", "--llm", llm, "--set", set_, "--name", name]
    if only:
        cmd += ["--only", only]
    if render:
        cmd.append("--render")

    def fn(job: Job):
        out = _stream(job, cmd, LAYOUT_DIR)
        m = re.search(r"overall=([\d.]+)\s+by level=(\{.*\})", out["tail"])
        out.update(report=name, overall=float(m.group(1)) if m else None, by_level=m.group(2) if m else "")
        return out
    return JOBS.submit("eval", f"레이아웃 평가 · {set_} · {llm}" + (f" · {only}" if only else ""), {"set": set_, "llm": llm, "only": only}, fn)


def start_rfp_experiment(backend: str, conds: list[str], tcs: list[str], max_chars: list[int], rpm: int = 30, enrich: bool = False) -> Job:
    run_id = time.strftime("webui-%Y%m%d-%H%M%S-") + backend
    cmd = [sys.executable, "run_experiment.py", "--backend", backend, "--run-id", run_id, "--rpm", str(rpm)]
    if conds:
        cmd += ["--cond", *conds]
    if tcs:
        cmd += ["--tc", *tcs]
    if max_chars:
        cmd += ["--max-chars", *[str(x) for x in max_chars]]
    if enrich:
        cmd.append("--enrich")

    def fn(job: Job):
        out = _stream(job, cmd, TEST_DIR)
        out["run_id"] = run_id
        return out
    return JOBS.submit("experiment", f"RFP 실험 · {backend} · {' '.join(tcs) or '전체 TC'}", {"backend": backend, "conds": conds, "tcs": tcs, "max_chars": max_chars}, fn)
