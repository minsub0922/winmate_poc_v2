"""결과 내보내기 — 미리보기 HTML 덱 · 앱 호환 제안서 JSON · 마크다운 리포트."""
from __future__ import annotations

import base64
import html as H
import json
import os
import random
import re
from pathlib import Path

from .config import APP_ROOT
from .kb import BLANK, KB
from .slots import render_filled

IMG_ROOT = APP_ROOT / "img"  # winmatev2/img


def _img_src(file: str, base: Path | None = None) -> str:
    """미리보기 HTML 에서 쓸 이미지 경로 — base(미리보기 폴더) 기준 상대 경로라 다른 컴퓨터 · 마운트 위치에서도 같은 폴더 구조면 열린다."""
    p = (APP_ROOT / file).resolve()
    if not p.exists():
        return ""
    if base is not None:
        try:
            return os.path.relpath(p, base.resolve()).replace(os.sep, "/")
        except ValueError:  # 다른 드라이브(Windows)
            pass
    return p.as_uri()


_PACKS: dict[str, list] = {}


def _asset(ref: str, base: Path | None = None) -> str:
    """사진 주소 → 미리보기에서 열리는 경로. 묶음 사진(img/fill/<묶음>.json#k)은 base/_img/ 에 풀어 쓴다."""
    if not ref:
        return ""
    if re.search(r"\.json#\d+$", ref):
        pack, k = ref.split("#")
        fp = APP_ROOT / pack
        if not fp.exists():
            return ""
        if pack not in _PACKS:
            _PACKS[pack] = json.loads(fp.read_text(encoding="utf-8")).get("images", [])
        imgs = _PACKS[pack]
        if int(k) >= len(imgs):
            return ""
        uri = imgs[int(k)]
        if base is None:
            return uri
        m = re.match(r"data:image/(\w+);base64,", uri)
        ext = (m.group(1) if m else "jpg").replace("jpeg", "jpg")
        name = f"{Path(pack).stem}-{k}.{ext}"
        out = base / "_img" / name
        if not out.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(base64.b64decode(uri.split(",", 1)[1]))
        return f"_img/{name}"
    return _img_src(ref, base)


def _resolve_baked(html: str, base: Path | None) -> str:
    """레이아웃에 박힌 사진(src="img/…" · data-fill="img/fill/…") 을 미리보기 경로로."""
    def fill_rep(m: re.Match) -> str:
        tag = m.group(0)
        df = re.search(r'data-fill="([^"]+)"', tag)
        src = _asset(df.group(1), base) if df else ""
        return re.sub(r'src="[^"]*"', f'src="{H.escape(src)}"', tag, count=1) if src else tag

    def src_rep(m: re.Match) -> str:
        p = _asset(m.group(1), base)
        return f'src="{H.escape(p)}"' if p else m.group(0)
    html = re.sub(r"<img[^>]*data-fill=[^>]*>", fill_rep, html)
    return re.sub(r'src="(img/[^"]+)"', src_rep, html)


def slide_html(kb: KB, fill: dict, base: Path | None = None) -> str:
    html = kb.html[fill["f"]]
    texts = {int(k): v for k, v in fill["texts"].items()}
    imgs = {}
    for k, v in fill.get("images", {}).items():
        imgs[int(k)] = {"src": _asset(v["file"], base) if v.get("file") else "", "label": v.get("label", ""), "fit": v.get("fit", "cover")}
    return _resolve_baked(render_filled(html, texts, page_no=fill["no"], img_fills=imgs), base)


def to_app_proposal(state: dict, fills: list[dict]) -> dict:
    """winmatev2 store.js 제안서 모델과 같은 모양 — 앱 localStorage 에 그대로 넣어 볼 수 있다."""
    inp, ctx = state["input"], state["ctx"]
    uid = lambda p: p + "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(7))  # noqa: E731
    by_part: dict[str, list[dict]] = {}
    for f in fills:
        by_part.setdefault(f["part_id"], []).append(f)
    parts = []
    for p in state["parts"]:
        lays = []
        for f in by_part.get(p["id"], []):
            img = {k: {"src": v["file"], "name": v["label"], "fit": v.get("fit", "cover")} if v.get("file") else {"src": BLANK, "name": v.get("label", "")}
                   for k, v in f["images"].items() if v.get("file") or v.get("blank")}  # 비운 칸 = 투명 1px — 앱에서 레이아웃의 샘플 사진을 가린다
            lays.append({"uid": uid("l"), "f": f["f"], "status": "partial", "ov": {"t": f["texts"], "img": img}})
        parts.append({"id": uid("s"), "type": p["type"], "name": p["name"], "items": p["items"], "done": True, "layouts": lays,
                      "meta": {"priority": p.get("priority"), "priority_rank": p.get("priority_rank"), "req_ids": p.get("req_ids"), "source": p.get("source")}})
    return {
        "id": "p_agent_" + inp["id"], "title": inp.get("title") or inp.get("project") or "제안서", "customer": inp.get("customer", ""), "ind": ctx["industry"],
        "stage": "story", "reqTab": "form",
        "req": {"free": [{"t": inp.get("free_text", "")}], "form": {"project": inp.get("project", ""), "customer": inp.get("customer", ""), "target": inp.get("target", ""),
                "keymen": [{"id": uid("k"), "name": k["name"], "weight": k.get("weight", 0), "reqs": [[{"t": r}] for r in k.get("reqs", [])]} for k in inp.get("keymen", [])],
                "note": inp.get("note", "")}, "files": [{"id": uid("f"), "name": f["name"], "size": len(f.get("text", "")), "type": f["name"].split(".")[-1], "text": f.get("text", ""), "memo": f.get("memo", "")} for f in inp.get("files", [])]},
        "ctx": {"products": ctx["products"], "solutions": ctx["solutions"], "cases": ctx["cases"]}, "parts": parts,
    }


CSS = """
:root{--bg:#f4f5f7;--ink:#121417;--ink2:#596170;--line:#e2e5ea;--card:#fff;--acc:#1428a0;--warn:#b54708;--bad:#b42318;--ok:#067647}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){--bg:#111317;--ink:#eceef2;--ink2:#a2a9b6;--line:#2a2e36;--card:#1a1d23;--acc:#8ea2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 'Noto Sans KR',system-ui,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 16px 80px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 10px}
.sub{color:var(--ink2)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}.k{font-size:12px;color:var(--ink2)}.v{font-size:17px;font-weight:700}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13px}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;color:var(--ink2);font-weight:600}
.tag{display:inline-block;padding:1px 7px;border-radius:99px;border:1px solid var(--line);font-size:11.5px;margin:1px 3px 1px 0;color:var(--ink2)}
.must{color:var(--bad);border-color:currentColor}.should{color:var(--warn);border-color:currentColor}
.slide{margin:18px 0 34px}.shead{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}.shead b{font-size:15px}
.frame{width:100%;aspect-ratio:16/9;position:relative;overflow:hidden;border-radius:8px;border:1px solid var(--line);background:#fff}
.frame>.inner{position:absolute;left:0;top:0;width:1280px;height:720px;transform-origin:0 0}
.why{font-size:12px;color:var(--ink2)}.alts{font-size:12px;color:var(--ink2)}
.q{margin:6px 0}.q b{display:block}
"""


def deck_html(kb: KB, state: dict, fills: list[dict], title: str = "", base: Path | None = None) -> str:
    a, ctx, rv = state["analysis"], state["ctx"], state.get("review", {})
    m = state.get("scenario_match", {})
    parts = {p["id"]: p for p in state["parts"]}
    reqs = {r["id"]: r for r in a["requirements"]}
    out = [f"<!doctype html><html lang=ko><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{H.escape(title or 'Layout Agent 결과')}</title>",
           "<link rel=preconnect href=https://fonts.googleapis.com><link href='https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Manrope:wght@600;800&display=swap' rel=stylesheet>",
           f"<style>{CSS}</style></head><body><div class=wrap>"]
    out.append(f"<h1>{H.escape(ctx['customer'])} · {H.escape(ctx['project'] or '')}</h1><div class=sub>{H.escape(a['level_label'])} — {H.escape(a['level_reason'])}</div>")
    chosen = m.get("chosen", "")
    sc_title = kb.standard_scenarios.get(chosen, {}).get("title") or kb.BS.get(chosen, {}).get("title") or (kb.STRATEGIES.get(chosen, {}).get("label", chosen) + " (사용자 선택 전략)")
    out.append("<div class=grid style='margin-top:16px'>")
    for k, v in [("업종", f"{a['industry_name'] or '미확정'} ({a['industry_source']})"), ("시나리오", f"{chosen} · {sc_title}"), ("요구사항", f"{len(a['requirements'])}개 · 반영 {rv.get('req_coverage', 0):.0%}"),
                 ("슬라이드", f"{len(fills)}장 · 흐름 {rv.get('flow_score', 0):.2f}"), ("제품", ", ".join(kb.P[p]["model"] for p in ctx["products"]) or "-"), ("솔루션", ", ".join(kb.S[s]["name"] for s in ctx["solutions"]) or "-")]:
        out.append(f"<div class=card><div class=k>{k}</div><div class=v>{H.escape(str(v))}</div></div>")
    out.append("</div>")
    if rv.get("issues"):
        sev = {"high": "must", "mid": "should", "low": ""}
        out.append("<h2>검토 이슈</h2><ul>" + "".join(f"<li><span class='tag {sev.get(i['sev'], '')}'>{i['sev']}</span> {H.escape(i['msg'])}</li>" for i in rv["issues"]) + "</ul>")
    if rv.get("checklist"):
        out.append("<details><summary>입찰 절차 · 제출 체크리스트 (" + str(len(rv["checklist"])) + "개 — 제안서 본문 반영률에서 제외)</summary><ul>"
                   + "".join(f"<li>{c['id']} {H.escape(c['text'])}</li>" for c in rv["checklist"]) + "</ul></details>")
    if m.get("candidates"):
        out.append("<h2>시나리오 매칭</h2><table><tr><th>후보</th><th>점수</th><th>이유</th></tr>")
        for c in m["candidates"][:3]:
            cid = c.get("id") or c.get("strategy")
            t = kb.standard_scenarios.get(cid, {}).get("title") or kb.BS.get(cid, {}).get("title") or c.get("label", "")
            out.append(f"<tr><td>{H.escape(str(cid))} · {H.escape(t)}</td><td>{c.get('score', '')}</td><td>{H.escape(str(c.get('why') or c.get('desc', '')))}</td></tr>")
        out.append("</table>")
    d = state.get("decomposition")
    if d:
        out.append("<h2>요구사항 분해 · 기준별 정리</h2><table><tr><th>기준</th><th>요구</th><th>필수</th><th>요약</th><th>답하는 장표</th></tr>")
        for g in d["groups"]:
            out.append(f"<tr><td>{H.escape(g['dimension'])}</td><td>{g['n']}</td><td>{g['must']}</td><td>{H.escape(g['summary'])}</td><td>{', '.join(g['answer_layouts'])}</td></tr>")
        out.append("</table>")
        if d.get("eval"):
            out.append(f"<p><b>평가 구조</b> · {H.escape(d['eval']['type'])} — {H.escape(', '.join(d['eval']['signals']))}</p>")
        if d["conflicts"]:
            out.append("<p><b>충돌 · 위험</b></p><ul>" + "".join(f"<li>[{H.escape(c['kind'])}] {H.escape(c['note'])}</li>" for c in d["conflicts"]) + "</ul>")
        ch = state.get("choice") or {}
        out.append("<p><b>사용자와 정할 질문</b></p>")
        for q in d["questions"]:
            ans = (ch.get("raw") or {}).get(q["id"], q["default"])
            out.append(f"<div class=q><b>{H.escape(q['question'])}</b><span class=sub>선택지: {H.escape(' / '.join(q['options']))} → 답: {H.escape(str(ans))}</span></div>")
    out.append("<h2>요구사항 → 파트 추적</h2><table><tr><th>ID</th><th>요구</th><th>분류</th><th>우선</th><th>점수</th><th>연결 파트</th></tr>")
    links = state.get("links", {}).get("links", {})
    for r in a["requirements"]:
        ps = [state["parts"][i] for i in links.get(r["id"], []) if i < len(state["parts"])]
        out.append(f"<tr><td>{r['id']}</td><td>{H.escape(r['text'])}<div class=k>{H.escape(r['source'])}</div></td><td>{H.escape(r['category'])}</td>"
                   f"<td><span class='tag {r['priority']}'>{r['priority']}</span></td><td>{r['score']}</td><td>{H.escape(', '.join(p['id'] + ' ' + p['name'] for p in ps)) or '<b style=color:var(--bad)>미반영</b>'}</td></tr>")
    out.append("</table><h2>Storyboard · 우선순위</h2><table><tr><th>#</th><th>파트</th><th>내용</th><th>우선순위</th><th>연관</th></tr>")
    for p in state["parts"]:
        out.append(f"<tr><td>{p['id']}</td><td><b>{H.escape(p['name'])}</b><div class=k>{H.escape(kb.part_label(p['type']))} · {H.escape(p.get('source', ''))}</div></td>"
                   f"<td>{'<br>'.join(H.escape(x) for x in p['items'])}</td><td>{p.get('priority_rank', '')}위 · {p.get('priority', '')}<div class=k>{H.escape(p.get('priority_reason', ''))}</div></td>"
                   f"<td>{H.escape(', '.join(kb.part_label(t) for t in p.get('related', [])))}</td></tr>")
    out.append("</table><h2>슬라이드</h2>")
    slides = {(s["part_id"], s["f"], s.get("pg", 0)): s for s in state["slides"]}
    for f in fills:
        s = slides.get((f["part_id"], f["f"], f.get("pg", 0)), {})
        p = parts.get(f["part_id"], {})
        c = f["checks"]
        alts = " · ".join(f"{x['code']} {x['name']}" for x in s.get("alternates", []))
        out.append(f"<div class=slide><div class=shead><b>{f['no']}. {H.escape(p.get('name', ''))}</b><span class=tag>{H.escape(f['code'])} {H.escape(s.get('name', ''))}</span>"
                   f"<span class=why>{H.escape(' / '.join(s.get('why', [])))}</span></div>"
                   f"<div class=frame><div class=inner data-scale>{slide_html(kb, f, base)}</div></div>"
                   f"<div class=alts>대안: {H.escape(alts or '-')} · 채운 칸 {c['changed']}/{c['n_slots']} · 자리표시 {c['placeholders_left']} · 근거 없는 수치 되돌림 {len(c['unsupported_numbers'])}</div></div>")
    out.append("</div><script>function fit(){document.querySelectorAll('.frame').forEach(f=>{const i=f.firstElementChild;i.style.transform='scale('+(f.clientWidth/1280)+')'})}addEventListener('resize',fit);fit()</script></body></html>")
    return "".join(out)


def report_md(kb: KB, state: dict, fills: list[dict]) -> str:
    a, ctx, rv = state["analysis"], state["ctx"], state.get("review", {})
    m = state.get("scenario_match", {})
    L = [f"# {ctx['customer']} · {ctx['project']}", "", f"- 맥락: **{a['level_label']}** — {a['level_reason']}", f"- 업종: {a['industry_name']} ({a['industry_source']})",
         f"- 시나리오: {m.get('chosen')} ({m.get('kind')})", f"- 요구 {len(a['requirements'])}개 · 반영률 {rv.get('req_coverage', 0):.0%} · 슬라이드 {len(fills)}장", "", "## Storyboard", ""]
    for p in state["parts"]:
        sl = [f for f in fills if f["part_id"] == p["id"]]
        L.append(f"{p['id']}. **{p['name']}** ({kb.part_label(p['type'])}) — 우선순위 {p.get('priority_rank')}위 · 요구 {', '.join(p.get('req_ids', [])) or '-'}")
        for x in p["items"]:
            L.append(f"   - {x}")
        for f in sl:
            L.append(f"   - 슬라이드 {f['no']}: `{f['f']}` {f['code']} · 채운 칸 {f['checks']['changed']}/{f['checks']['n_slots']}")
    if rv.get("issues"):
        L += ["", "## 검토 이슈", ""] + [f"- [{i['sev']}] {i['msg']}" for i in rv["issues"]]
    ch = state.get("choice") or {}
    if ch:
        L += ["", "## 전략 인터뷰 결과", "", f"- 전략 {ch.get('strategy')} · 결말 {ch.get('ending')} · 분량 {ch.get('budget')} · 앞에 둘 키맨 {ch.get('keyman') or '-'}"]
        L += [f"- 충돌 [{c.get('kind')}] → {c.get('answer')}" for c in (ch.get("conflicts") or {}).values()]
        L += [f"- 인터뷰로 추가된 요구 {r['id']}: {r['text']}" for r in a["requirements"] if r.get("interview")]
    if rv.get("checklist"):
        L += ["", "## 입찰 절차 · 제출 체크리스트 (본문 반영률에서 제외)", ""] + [f"- {c['id']} {c['text']}" for c in rv["checklist"]]
    return "\n".join(L) + "\n"


def write_outputs(kb: KB, state: dict, fills: list[dict], out_dir: Path, title: str = "") -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "preview.html").write_text(deck_html(kb, state, fills, title, base=out_dir), encoding="utf-8")
    (out_dir / "proposal.app.json").write_text(json.dumps(to_app_proposal(state, fills), ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "report.md").write_text(report_md(kb, state, fills), encoding="utf-8")
    keep = {k: state.get(k) for k in ("input", "analysis", "ctx", "route", "scenario_match", "decomposition", "choice", "parts", "links", "slides", "review")}
    keep["fills"] = fills
    (out_dir / "state.json").write_text(json.dumps(keep, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return {"preview": str(out_dir / "preview.html"), "proposal": str(out_dir / "proposal.app.json")}
