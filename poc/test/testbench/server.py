"""Winmate PoC 테스트 벤치 — poc/test 아래 모듈을 한 페이지에서 실행 · 검증한다.

  ./start.command            (macOS: Finder 에서 더블클릭) 또는  ./start.sh
  → http://127.0.0.1:8787   (계정은 auth.json — 비밀번호는 해시로만 저장)
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from fastapi import Body, FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from adapters import layout as LA  # noqa: E402
from adapters import rfp as RF  # noqa: E402
from adapters import selftest as ST  # noqa: E402
from adapters import sim as SM  # noqa: E402
from core import JOBS, LAYOUT_DIR, SESSION_COOKIE, SESSION_HOURS, TEST_DIR, LoginGuard, check_password, make_token, read_env_keys, read_token  # noqa: E402

PORT = int(os.environ.get("TESTBENCH_PORT", "8787"))
app = FastAPI(title="Winmate PoC Testbench", docs_url=None, redoc_url=None, openapi_url=None)
guard = LoginGuard()
STATIC = HERE / "static"


def _app_root() -> Path:
    try:
        from winmate_layout.config import APP_ROOT
        return APP_ROOT
    except Exception:  # noqa: BLE001
        return TEST_DIR.parent.parent


class J(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(content, ensure_ascii=False, default=str).encode("utf-8")


# ---------------------------------------------------------------- 인증
PUBLIC = ("/login", "/api/login", "/static/login", "/static/app.css", "/favicon")


@app.middleware("http")
async def auth_mw(request: Request, call_next):
    path = request.url.path
    if request.method == "POST" and request.headers.get("origin"):
        host = request.headers.get("host", "")
        if not request.headers["origin"].endswith("//" + host):  # 다른 사이트에서 보낸 요청 차단
            return J({"detail": "origin"}, status_code=403)
    if path.startswith(PUBLIC):
        return await call_next(request)
    user = read_token(request.cookies.get(SESSION_COOKIE))
    if not user:
        if path.startswith("/api/"):
            return J({"detail": "로그인이 필요합니다"}, status_code=401)
        return RedirectResponse("/login")
    request.state.user = user
    return await call_next(request)


@app.get("/login")
def login_page():
    return FileResponse(STATIC / "login.html")


@app.post("/api/login")
def login(request: Request, body: dict = Body(...)):
    ip = request.client.host if request.client else "-"
    wait = guard.blocked(ip)
    if wait:
        raise HTTPException(429, f"로그인 시도가 너무 많습니다. {wait // 60 + 1}분 뒤에 다시 시도하세요")
    if not check_password(str(body.get("username", "")), str(body.get("password", ""))):
        guard.fail(ip)
        raise HTTPException(401, "아이디 또는 비밀번호가 맞지 않습니다")
    guard.ok(ip)
    r = J({"ok": True})
    r.set_cookie(SESSION_COOKIE, make_token(body["username"]), max_age=SESSION_HOURS * 3600, httponly=True, samesite="strict")
    return r


@app.post("/api/logout")
def logout():
    r = J({"ok": True})
    r.delete_cookie(SESSION_COOKIE)
    return r


@app.get("/api/me")
def me(request: Request):
    return {"user": request.state.user}


# ---------------------------------------------------------------- 상태 · 작업
@app.get("/api/status")
def status():
    return J({"keys": read_env_keys(), "python": sys.version.split()[0], "test_dir": str(TEST_DIR),
              "modules": {"rfp": RF.available(), "layout": LA.available(), "sim": SM.available()}, "jobs": JOBS.recent(10), "port": PORT})


@app.get("/api/jobs")
def jobs():
    return J(JOBS.recent(40))


@app.get("/api/jobs/{jid}")
def job(jid: str, since: int = 0):
    j = JOBS.get(jid)
    if not j:
        raise HTTPException(404, "작업이 없습니다(서버를 다시 켜면 지워집니다)")
    return J(j.view(since))


# ---------------------------------------------------------------- RFP
@app.get("/api/rfp/tcs")
def rfp_tcs():
    return J(RF.list_tcs())


@app.get("/api/rfp/tcs/{tc_id}")
def rfp_tc(tc_id: str):
    return J(RF.get_tc(tc_id))


@app.post("/api/rfp/run")
def rfp_run(body: dict = Body(...)):
    title = f"RFP · {body.get('tc_id') or '직접 입력'} · {body.get('condition')} · {body.get('backend')}"
    shown = {k: v for k, v in body.items() if k != "text"} | {"text_chars": len(body.get("text") or "")}
    j = JOBS.submit("rfp", title, shown, lambda job: RF.run(job, body))
    return {"job": j.id}


@app.get("/api/rfp/runs")
def rfp_runs():
    return J(RF.list_runs())


@app.get("/api/rfp/runs/{run_id}")
def rfp_run_get(run_id: str):
    return J(RF.get_run(run_id))


@app.get("/api/rfp/runs/{run_id}/{tc}/{tag}")
def rfp_run_detail(run_id: str, tc: str, tag: str):
    return J(RF.get_run_detail(run_id, tc, tag))


@app.post("/api/rfp/to-layout")
def rfp_to_layout(body: dict = Body(...)):
    return J(RF.to_layout_input(body["form"], body.get("source", ""), body.get("title", "")))


@app.post("/api/rfp/experiment")
def rfp_experiment(body: dict = Body(...)):
    j = ST.start_rfp_experiment(body.get("backend", "rules"), body.get("conds") or [], body.get("tcs") or [], [int(x) for x in body.get("max_chars") or []],
                                int(body.get("rpm") or 30), bool(body.get("enrich")))
    return {"job": j.id}


# ---------------------------------------------------------------- 레이아웃 Agent
@app.get("/api/layout/catalog")
def layout_catalog():
    return J(LA.catalog())


@app.get("/api/layout/cases")
def layout_cases():
    return J(LA.list_cases())


@app.get("/api/layout/cases/{set_}/{cid}")
def layout_case(set_: str, cid: str):
    return J(LA.get_case(set_, cid))


@app.post("/api/layout/run")
def layout_run(body: dict = Body(...)):
    if not body.get("input"):
        raise HTTPException(400, "입력이 없습니다")
    j = LA.start(body)
    return {"job": j.id}


def _job(jid: str):
    j = JOBS.get(jid)
    if not j or j.kind != "layout":
        raise HTTPException(404, "작업이 없습니다")
    return j


@app.post("/api/layout/jobs/{jid}/answer")
def layout_answer(jid: str, body: dict = Body(...)):
    try:
        LA.answer(_job(jid), body.get("answers") or {})
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    return {"ok": True}


@app.post("/api/layout/jobs/{jid}/copilot")
def layout_copilot(jid: str, body: dict = Body(...)):
    try:
        return J(LA.copilot(_job(jid), str(body.get("message", ""))[:4000]))
    except ValueError as e:
        raise HTTPException(409, str(e)) from e


@app.post("/api/layout/jobs/{jid}/copilot/finalize")
def layout_copilot_finalize(jid: str):
    try:
        LA.copilot_finalize(_job(jid))
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    return {"ok": True}


@app.get("/api/layout/jobs/{jid}/proposal.json")
def layout_proposal(jid: str):
    j = _job(jid)
    if "state" not in j.ctx:
        raise HTTPException(409, "아직 끝나지 않았습니다")
    return Response(json.dumps(LA.proposal_json(j), ensure_ascii=False, indent=1), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="proposal-{jid}.app.json"'})


@app.get("/api/layout/jobs/{jid}/report.md")
def layout_report(jid: str):
    j = _job(jid)
    if "state" not in j.ctx:
        raise HTTPException(409, "아직 끝나지 않았습니다")
    return PlainTextResponse(LA.report_md(j), headers={"Content-Disposition": f'attachment; filename="report-{jid}.md"'})


@app.get("/api/layout/search")
def layout_search(q: str, part: str = "", ind: str = "", products: str = "", solutions: str = "", strategy: str = "", level: str = "ambiguous", k: int = 12):
    return J(LA.search(q, part, ind or None, products, solutions, strategy or None, min(max(k, 1), 40), level))


@app.get("/api/layout/layouts/{f}.html", response_class=HTMLResponse)
def layout_html(f: str):
    try:
        return HTMLResponse(LA.layout_html(f))
    except KeyError as e:
        raise HTTPException(404, "레이아웃이 없습니다") from e


@app.get("/api/layout/cards/{f}")
def layout_card(f: str):
    return J(LA.card(f))


@app.get("/api/layout/reports")
def layout_reports():
    return J(LA.list_reports())


@app.get("/api/layout/reports/{name}")
def layout_report_get(name: str):
    return J(LA.get_report(name))


@app.post("/api/layout/eval")
def layout_eval(body: dict = Body(...)):
    j = ST.start_layout_eval(body.get("set", "cases"), body.get("llm", "offline"), body.get("only", ""), bool(body.get("render", True)))
    return {"job": j.id}


# ---------------------------------------------------------------- 제안 시뮬레이션 실성능 검증 (sim_eval)
def _sim(fn, *a):
    try:
        return fn(*a)
    except FileNotFoundError as e:
        raise HTTPException(404, "실행 기록이 없습니다") from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e


@app.get("/api/sim/sets")
def sim_sets():
    out = []
    for p in sorted((SM.SIM_DIR / "sets").glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            out.append({"path": f"sets/{p.name}", "name": d.get("name", p.stem), "n": len(d.get("items", [])), "rule": d.get("rule", "")})
        except (json.JSONDecodeError, OSError):
            continue
    return J(out)


@app.get("/api/sim/runs")
def sim_runs():
    return J(SM.list_runs())


@app.get("/api/sim/runs/{run_id}")
def sim_run(run_id: str):
    return J(_sim(SM.get_run, run_id))


@app.get("/api/sim/runs/{run_id}/sessions/{sid}")
def sim_session(run_id: str, sid: str):
    return J(_sim(SM.get_session, run_id, sid))


@app.post("/api/sim/run")
def sim_start(body: dict = Body(...)):
    j = _sim(SM.start, body)
    return {"job": j.id}


@app.post("/api/sim/runs/{run_id}/resume")
def sim_resume(run_id: str, body: dict = Body(default={})):
    j = _sim(SM.resume, run_id, int(body.get("concurrency") or 4))
    return {"job": j.id}


@app.post("/api/sim/jobs/{jid}/stop")
def sim_stop(jid: str):
    return {"ok": SM.stop(jid)}


@app.post("/api/sim/runs/{run_id}/report")
def sim_report(run_id: str):
    return J(_sim(SM.report, run_id))


# ---------------------------------------------------------------- 자동 테스트
@app.post("/api/selftest/{suite}")
def selftest(suite: str, body: dict = Body(default={})):
    if suite not in ST.SUITES:
        raise HTTPException(404, "테스트 스위트가 없습니다")
    j = ST.start_suite(suite, bool(body.get("live")))
    return {"job": j.id}


@app.get("/api/selftest")
def selftest_list():
    return J([{"key": k, "title": v["title"], "cwd": str(v["cwd"])} for k, v in ST.SUITES.items()])


# ---------------------------------------------------------------- 정적 파일
@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


app.mount("/static", StaticFiles(directory=STATIC), name="static")
_IMG = _app_root() / "img"
if _IMG.exists():
    app.mount("/img", StaticFiles(directory=_IMG), name="img")
_REPORTS = LAYOUT_DIR / "eval" / "reports"
_REPORTS.mkdir(parents=True, exist_ok=True)
app.mount("/files/layout-reports", StaticFiles(directory=_REPORTS, html=True), name="layout-reports")
SM.RUNS.mkdir(parents=True, exist_ok=True)
app.mount("/files/sim-runs", StaticFiles(directory=SM.RUNS, html=True), name="sim-runs")


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("TESTBENCH_HOST", "127.0.0.1")
    print(f"Winmate PoC Testbench → http://{host}:{PORT}")
    uvicorn.run(app, host=host, port=PORT, log_level="warning")
