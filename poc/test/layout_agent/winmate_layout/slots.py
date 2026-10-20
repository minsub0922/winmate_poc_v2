"""레이아웃 HTML → 텍스트 칸(data-tb) · 이미지 칸(data-img) 구조.

앱(slide.jsx readBlocks / readImageSlots)과 같은 인덱스를 쓰므로, 여기서 만든 채우기 결과
{i: text} 를 그대로 앱 제안서 모델의 `ov.t` 로 넣을 수 있다.
"""
from __future__ import annotations

import html as _html
import re
from html.parser import HTMLParser

VOID = {"br", "img", "hr", "input", "meta", "link", "source", "col", "area", "base", "wbr", "embed", "param", "track"}
FIXED_RE = re.compile(r"^(CONFIDENTIAL( · \d+)?|고객사 로고|제안사 로고|LOGO)$")
KPI_RE = re.compile(r"^[\[\(]?[~약+\-]?[\d.,]+[\]\)]?\s*(%|%p|배|분|초|일|시간|억|만|원|곳|개|실|대|층|명|년|주|개월|nit|kW|℃|x|X|건|점)?[\s+]*$|^\[[^\]]{1,10}\]\s*(%|%p|배|분|일|시간|억|만|원|곳|개|실|대|층|명|년|주|개월|건|점)?$")


def _style(attrs: dict) -> dict:
    st = attrs.get("style") or ""
    out = {}
    m = re.search(r"font-size:\s*([\d.]+)px", st)
    out["fs"] = float(m.group(1)) if m else 0.0
    m = re.search(r"font-weight:\s*(\d+)", st)
    out["fw"] = int(m.group(1)) if m else 0
    out["ls"] = "letter-spacing" in st
    m = re.search(r"(?:^|;)\s*color:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))", st)
    out["color"] = m.group(1) if m else ""
    return out


class _Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, dict]] = []  # (tag, style ctx)
        self.open_tb: list[dict] = []  # currently capturing text blocks
        self.tbs: list[dict] = []
        self.imgs: list[dict] = []
        self.img_open: list[dict] = []
        self.order = 0

    def _ctx(self) -> dict:
        return self.stack[-1][1] if self.stack else {"fs": 0.0, "fw": 0}

    def handle_starttag(self, tag, attrs_list):
        attrs = dict(attrs_list)
        st = _style(attrs)
        parent = self._ctx()
        ctx = {"fs": st["fs"] or parent.get("fs", 0.0), "fw": st["fw"] or parent.get("fw", 0)}
        if "data-img" in attrs:
            im = {
                "i": int(attrs["data-img"]), "kind": attrs.get("data-kind", ""), "slot": attrs.get("data-slot", ""),
                "hint": attrs.get("data-hint") or attrs.get("alt") or "", "pid": attrs.get("data-pid", ""),
                "w": _px(attrs.get("style", ""), "width"), "h": _px(attrs.get("style", ""), "height"), "_txt": [],
            }
            self.imgs.append(im)
            if tag not in VOID:
                self.img_open.append({"im": im, "depth": len(self.stack)})
        if "data-tb" in attrs:
            tb = {"i": int(attrs["data-tb"]), "fs": ctx["fs"], "fw": ctx["fw"], "ls": st["ls"], "color": st["color"],
                  "order": self.order, "_txt": [], "depth": len(self.stack), "ph": attrs.get("data-ph")}
            self.order += 1
            self.tbs.append(tb)
            self.open_tb.append(tb)
        if tag in VOID:
            if tag == "br":
                for tb in self.open_tb:
                    tb["_txt"].append(" ")
            return
        self.stack.append((tag, ctx))

    def handle_startendtag(self, tag, attrs):
        # <path .../> 같은 자기 닫힘 태그는 스택에 쌓지 않는다
        attrs_d = dict(attrs)
        if "data-img" in attrs_d or "data-tb" in attrs_d:
            self.handle_starttag(tag, attrs)
            if tag not in VOID:
                self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        # pop until matching tag (lenient)
        for k in range(len(self.stack) - 1, -1, -1):
            if self.stack[k][0] == tag:
                depth = k
                del self.stack[k:]
                self.open_tb = [tb for tb in self.open_tb if tb["depth"] < depth]
                self.img_open = [o for o in self.img_open if o["depth"] < depth]
                return

    def handle_data(self, data):
        for tb in self.open_tb:
            tb["_txt"].append(data)
        for o in self.img_open:
            o["im"]["_txt"].append(data)


def _px(style: str, prop: str) -> float:
    m = re.search(rf"(?:^|;|\s){prop}:\s*([\d.]+)px", style or "")
    return float(m.group(1)) if m else 0.0


def parse_layout(html: str) -> dict:
    p = _Parser()
    p.feed(html or "")
    tbs = []
    for tb in p.tbs:
        s = re.sub(r"\s+", " ", _html.unescape("".join(tb.pop("_txt")))).strip()
        if not s:
            continue
        tb["s"] = s
        tb.pop("depth", None)
        tbs.append(tb)
    # 중첩된 data-tb 는 바깥 칸에도 글자가 들어가 중복되므로, 같은 텍스트가 안쪽에 있으면 바깥 칸은 그대로 두되 표시만 한다
    imgs = []
    for im in p.imgs:
        t = re.sub(r"\s+", " ", "".join(im.pop("_txt"))).strip()
        if not im["hint"] and t:
            im["hint"] = t[:60]
        imgs.append(im)
    tbs.sort(key=lambda b: b["i"])
    assign_roles(tbs)
    return {"texts": tbs, "images": sorted(imgs, key=lambda x: x["i"])}


def assign_roles(tbs: list[dict]) -> None:
    n = len(tbs)
    max_fs = max([b["fs"] for b in tbs] or [0])
    head_done = False
    for k, b in enumerate(tbs):
        s, fs, fw = b["s"], b["fs"], b["fw"]
        tail = k >= n - 3
        if FIXED_RE.match(s):
            role = "fixed"
        elif k == 0 and fs and fs <= 15 and (b["ls"] or re.match(r"^\d{1,2}\s*·", s) or s.isupper()):
            role = "eyebrow"
        elif KPI_RE.match(s) and fs >= 24:
            role = "kpi"
        elif not head_done and fs >= 24 and k <= 3:
            role = "headline"
            head_done = True
        elif head_done and k <= 3 and 13 <= fs <= 19 and fw < 700 and (s.startswith("출처") or len(s) > 12):
            role = "subhead"
        elif tail and fs and fs <= 12:
            role = "footer"
        elif s.startswith("#"):
            role = "tag"
        elif fs >= 24:
            role = "title_lg"
        elif (fw >= 600 and len(s) <= 34) or (len(s) <= 14 and fs >= 14):
            role = "title"
        elif fs and fs <= 12.5:
            role = "caption"
        else:
            role = "body"
        b["role"] = role
        b["max"] = max(4, round(len(s) * 1.35))
        b["ph_in"] = bool(re.search(r"\[[^\[\]]{1,24}\]", s))
    if not head_done and max_fs >= 24:
        for b in tbs:
            if b["fs"] == max_fs and b["role"] in ("title_lg", "kpi"):
                b["role"] = "headline"
                break


ROLE_LABEL = {
    "eyebrow": "아이브로(섹션 라벨)", "headline": "헤드라인", "subhead": "부제 · 출처", "kpi": "핵심 수치", "title_lg": "큰 제목",
    "title": "항목 제목 · 라벨", "body": "설명", "caption": "캡션", "tag": "해시태그", "footer": "푸터", "fixed": "고정 문구",
}


def render_filled(html: str, fills: dict[int, str], page_no: int | None = None, img_fills: dict[int, dict] | None = None) -> str:
    """data-tb 칸 텍스트를 바꾼 HTML 을 돌려준다 (미리보기용)."""
    def rep(m: re.Match) -> str:
        open_tag, idx = m.group(1), int(m.group(2))
        if idx in fills:
            inner = _html.escape(fills[idx])
            return f"{open_tag}{inner}</"
        return m.group(0)

    # 안쪽에 다른 태그가 없는 단순 data-tb 만 정확히 바꿀 수 있어서, 중첩 칸은 단순화(텍스트로 덮기)한다
    out = html
    for idx, txt in sorted(fills.items(), key=lambda x: -x[0]):
        out = _replace_tb(out, idx, txt)
    if page_no is not None:
        out = re.sub(r"CONFIDENTIAL · \d+", f"CONFIDENTIAL · {page_no}", out)
    if img_fills:
        for idx, im in img_fills.items():
            out = _replace_img(out, idx, im)
    return out


def _find_element(html: str, attr_re: str) -> tuple[int, int, int] | None:
    """attr 이 붙은 요소의 (start, inner_start, end) — 같은 태그 이름 깊이를 세어 닫는 태그를 찾는다."""
    m = re.search(rf"<([a-zA-Z0-9]+)\b[^>]*{attr_re}[^>]*>", html)
    if not m:
        return None
    tag = m.group(1)
    depth, pos = 1, m.end()
    tag_re = re.compile(rf"<(/?){tag}\b[^>]*?(/?)>")
    while depth and pos < len(html):
        t = tag_re.search(html, pos)
        if not t:
            return None
        if t.group(1):
            depth -= 1
        elif not t.group(2):
            depth += 1
        pos = t.end()
        if depth == 0:
            return m.start(), m.end(), t.start()
    return None


def _replace_tb(html: str, idx: int, txt: str) -> str:
    loc = _find_element(html, rf'data-tb="{idx}"')
    if not loc:
        return html
    s, inner, e = loc
    return html[:inner] + _html.escape(txt) + html[e:]


def _replace_img(html: str, idx: int, im: dict) -> str:
    loc = _find_element(html, rf'data-img="{idx}"')
    if not loc:
        return html
    s, inner, e = loc
    src = im.get("src", "")
    fit = im.get("fit", "cover")
    label = _html.escape(im.get("label", ""))
    if src:
        body = f'<img src="{_html.escape(src)}" alt="{label}" style="display:block;width:100%;height:100%;object-fit:{fit}">'
    else:
        body = f'<span style="font-size:12px;color:#596170;padding:6px;text-align:center">{label}</span>'
    return html[:inner] + body + html[e:]
