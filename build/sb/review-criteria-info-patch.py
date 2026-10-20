"""Winmate v2 — 제안서 검토 페이지: 점수 링 옆 느낌표(!) 버튼 → 검토 점수 기준 팝업.

Usage: python3 review-criteria-info-patch.py <in index.html> <out index.html>
Patches the published bundle in place of the (unavailable) source build.
(사본 — 원본은 프로젝트 문서 claude/review-criteria-info-patch.py. 이 기능은 소스에 없어 빌드할 때마다 이 패치를 다시 적용한다.)

The bundle is re-minified on every build, so every component and data table is located by its markup
(className:"rv-report", className:"mback", {id:"CU1",cat:"CU" …), never by its minified name.

Popup content comes from the app's own tables at runtime, so it stays in sync with src/review/criteria.js:
  - categories (name · short · weight % · desc · hue · icon)   ← the {id:"CU",name:… } array
  - criteria   (id · name · importance w · desc · check)       ← the {id:"CU1",cat:"CU",… } array
  - grade labels / verdicts at 0 · 50 · 70 · 85                 ← the app's band + verdict functions
  - this proposal's status per criterion (score · 미적용 · 해당 없음 · why) ← r.sel / r.results
Hard-coded text mirrors the app's aggregation (X8-style): category = importance-weighted mean,
overall = category-weight mean over categories with applied criteria, 보완 필요 < 70, 먼저 고칠 것 < 80 top 5.
"""
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8', newline='').read()
assert 'wmCritInfo' not in s, 'already patched'

ID = r'[\w$]+'


def esc(t):
    return ''.join('\\u%04X' % ord(c) if ord(c) > 127 else c for c in t)


def one(pat, text, what):
    m = list(re.finditer(pat, text))
    assert len(m) == 1, (what, len(m))
    return m[0]


# ---------- locate pieces by markup ----------
anchor = s.find('className:"rv-report"')
assert anchor > 0 and s.count('className:"rv-report"') == 1
st = s.rfind('function ', 0, anchor)
en = s.find('function ', anchor)
ipc = s[st:en]
assert ipc.endswith(']})}'), ipc[-40:]
m = re.match(r'function (%s)\(\{r:(%s)\}\)\{let ' % (ID, ID), ipc)
assert m, ipc[:80]
REP, RP = m.group(1), m.group(2)                                                    # report component, its `r` param
J = one(r'\(0,(%s)\.jsxs\)\("div",\{className:"rv-report"' % ID, ipc, 'jsx').group(1)  # jsx runtime alias
R = re.search(r'\(0,(%s)\.useState\)' % ID, ipc).group(1)                           # React alias
ICON = re.search(r'\(0,%s\.jsx\)\((%s),\{name:"info",size:15\}\)' % (re.escape(J), ID), ipc).group(1)
ring = one(r'\(0,%s\.jsx\)\((%s),\{v:(%s)\.overall\}\)' % (re.escape(J), ID, ID), ipc, 'ring')
vm = one(r'"rv-verdict b-"\+(%s)\(%s\.overall\)\.k,children:(%s)\(%s\.overall\)' % (ID, ID, ID, ID), ipc, 'verdict')
BAND, VERDICT = vm.group(1), vm.group(2)

mb = s.find('className:"mback"')
assert mb > 0 and s.count('className:"mback"') == 1
MODAL = re.match(r'function (%s)\(' % ID, s[s.rfind('function ', 0, mb):]).group(1)

CRIT = one(r'[,\s](%s)=\[\{id:"CU1",cat:"CU",' % ID, s, 'criteria').group(1)
CATS = one(r'[,\s](%s)=\[\{id:"CU",name:"[^"]*",short:"[^"]*",w:\d+,hue:' % ID, s, 'categories').group(1)
print('aliases', dict(report=REP, jsx=J, react=R, icon=ICON, band=BAND, verdict=VERDICT, modal=MODAL, crit=CRIT, cats=CATS))

# ---------- 1. popup component (inserted before the report component) ----------
COMP = r'''function wmCritInfo({r:wmR,onClose:wmClose}){let wmJ=__J__.jsx,wmJs=__J__.jsxs,[wmCat,wmSetCat]=(0,__R__.useState)(null),[wmOpen,wmSetOpen]=(0,__R__.useState)(()=>new Set),wmSel=Object.fromEntries(((wmR&&wmR.sel)||[]).map(x=>[x.id,x])),wmRes=(wmR&&wmR.results)||{},wmN=__CRIT__.filter(x=>wmSel[x.id]&&wmSel[x.id].applied).length,wmAll=__CRIT__.every(x=>wmOpen.has(x.id)),wmTog=id=>wmSetOpen(o=>{let n=new Set(o);return n.has(id)?n.delete(id):n.add(id),n}),wmDots=w=>wmJ("span",{className:"rv-w","aria-label":"중요도 "+w,children:[1,2,3].map(p=>wmJ("i",{className:p<=w?"on":""},p))}),wmSt=c=>{let a=wmSel[c.id],x=wmRes[c.id];if(!a)return null;if(!a.applied)return wmJ("span",{className:"wm-ci-s off",children:"미적용"});if(!x||x.score==null||x.na)return wmJ("span",{className:"wm-ci-s off",children:"해당 없음"});let b=__BAND__(x.score);return wmJs("span",{className:"wm-ci-s b-"+b.k,children:[wmJ("b",{className:"num",children:x.score}),b.label]})},wmBands=[[0,49],[50,69],[70,84],[85,100]].map(([lo,hi])=>({lo,hi,b:__BAND__(lo),v:__VERDICT__(lo)})),wmTot=__CATS__.reduce((t,c)=>t+c.w,0),wmGroups=__CATS__.filter(c=>!wmCat||c.id===wmCat),wmPick=(v,id)=>{let h=v.currentTarget.parentElement.previousElementSibling,b=h&&h.closest(".mbody");wmSetCat(id),b&&setTimeout(()=>{let d=h.getBoundingClientRect().top-b.getBoundingClientRect().top;d<0&&(b.scrollTop+=d)},0)};return wmJs(__MODAL__,{size:"wm-ci",onClose:wmClose,title:"검토 점수 기준",sub:__CRIT__.length+"개 검토 기준 중 이 제안서에 맞는 기준만 골라 기준마다 0~100점을 매기고, 중요도와 영역 가중치로 묶어 종합 점수를 내요.",bodyClass:"mbody wm-ci-b",children:[
wmJs("section",{className:"wm-ci-sec","aria-label":"점수 계산",children:[wmJ("h3",{className:"wm-ci-h",children:"종합 점수는 이렇게 계산해요"}),
wmJs("ol",{className:"wm-ci-steps",children:[
wmJs("li",{children:[wmJ("span",{className:"wm-ci-n num",children:"1"}),wmJs("div",{children:[wmJs("b",{children:["기준 점수",wmJ("span",{className:"num",children:"0~100"})]}),wmJ("p",{children:"AI가 기준마다 장 번호와 짧은 인용을 근거로 채점해요. AI를 쓸 수 없거나 응답이 없으면 자동 점검 규칙으로 매겨요."}),wmJ("small",{children:"90 이상 그대로 제출 가능 · 75~89 사소한 보완 · 60~74 눈에 띄는 보완 · 40~59 큰 문제 · 40 미만 심각하거나 빠짐"})]})]}),
wmJs("li",{children:[wmJ("span",{className:"wm-ci-n num",children:"2"}),wmJs("div",{children:[wmJs("b",{children:["영역 점수",wmJ("span",{className:"num",children:"중요도 가중 평균"})]}),wmJ("p",{children:"한 영역 안에서 적용된 기준 점수를 기준 중요도(1~3)로 가중 평균해요. 중요도 3인 기준은 1인 기준보다 3배 크게 반영돼요."}),wmJs("small",{className:"wm-ci-wl",children:[wmDots(1),wmJ("span",{children:"1"}),wmDots(2),wmJ("span",{children:"2"}),wmDots(3),wmJ("span",{children:"3"})]})]})]}),
wmJs("li",{children:[wmJ("span",{className:"wm-ci-n num",children:"3"}),wmJs("div",{children:[wmJs("b",{children:["종합 점수",wmJ("span",{className:"num",children:"영역 가중 평균"})]}),wmJ("p",{children:__CATS__.length+"개 영역 점수를 아래 영역 가중치로 가중 평균해요. 적용된 기준이 없는 영역은 빼고 남은 가중치로 다시 나눠요."})]})]})]}),
wmJ("div",{className:"wm-ci-wts","aria-label":"영역 가중치",children:__CATS__.map(c=>wmJs("span",{className:"wm-ci-wt",title:c.name+" "+c.w+"%",style:{flexGrow:c.w,"--hc":"var(--h-"+c.hue+")","--hcb":"var(--h-"+c.hue+"-bg)"},children:[wmJ("b",{children:c.short}),wmJ("span",{className:"num",children:Math.round(c.w*100/wmTot)+"%"})]},c.id))})]}),
wmJs("section",{className:"wm-ci-sec","aria-label":"등급",children:[wmJ("h3",{className:"wm-ci-h",children:"점수 등급"}),
wmJ("div",{className:"wm-ci-bands",children:wmBands.map(x=>wmJs("div",{className:"wm-ci-band b-"+x.b.k,children:[wmJs("span",{className:"wm-ci-bt",children:[wmJ("b",{children:x.b.label}),wmJ("span",{className:"num",children:x.lo+"~"+x.hi})]}),wmJ("span",{className:"wm-ci-bv",children:x.v})]},x.lo))}),
wmJs("dl",{className:"wm-ci-notes",children:[wmJ("dt",{children:"보완 필요"}),wmJ("dd",{children:"70점 미만인 기준 수예요."}),wmJ("dt",{children:"먼저 고칠 것"}),wmJ("dd",{children:"80점 미만 기준 중 중요도 × 영역 가중치 × (100 − 점수)가 큰 순서로 최대 5개를 골라요."}),wmJ("dt",{children:"적용 기준"}),wmJ("dd",{children:"고객 요구사항 연결, 수치 · 경쟁사 언급, 파일 형식 같은 조건으로 이 제안서에 맞는 기준만 채점해요. ‘기준 조정 · 다시 평가’에서 직접 넣고 뺄 수 있어요."})]})]}),
wmJs("section",{className:"wm-ci-sec","aria-label":"평가 기준",children:[wmJs("div",{className:"wm-ci-lh",children:[wmJs("h3",{className:"wm-ci-h",children:["평가 기준 ",wmJ("span",{className:"num",children:__CRIT__.length}),"개"]}),wmR&&wmR.sel?wmJs("span",{className:"faint",children:["이 제안서에 ",wmJ("b",{className:"num",children:wmN}),"개 적용"]}):null,wmJ("span",{style:{flex:1}}),wmJ("button",{type:"button",className:"btn btn-ghost btn-sm",onClick:()=>wmSetOpen(wmAll?new Set:new Set(__CRIT__.map(x=>x.id))),children:wmAll?"확인할 점 모두 접기":"확인할 점 모두 펼치기"})]}),
wmJs("div",{className:"wm-ci-nav",role:"group","aria-label":"영역",children:[wmJs("button",{type:"button",className:"wm-ci-chip","aria-pressed":!wmCat,onClick:v=>wmPick(v,null),children:["전체",wmJ("span",{className:"num",children:__CRIT__.length})]}),__CATS__.map(c=>wmJs("button",{type:"button",className:"wm-ci-chip","aria-pressed":wmCat===c.id,onClick:v=>wmPick(v,wmCat===c.id?null:c.id),children:[c.short,wmJ("span",{className:"num",children:__CRIT__.filter(x=>x.cat===c.id).length})]},c.id))]}),
wmGroups.map(c=>wmJs("div",{className:"wm-ci-g",style:{"--hc":"var(--h-"+c.hue+")","--hcb":"var(--h-"+c.hue+"-bg)"},children:[wmJs("div",{className:"wm-ci-gh",children:[wmJ("span",{className:"wm-ci-gi",children:wmJ(__ICON__,{name:c.icon,size:14})}),wmJ("b",{children:c.name}),wmJ("span",{className:"wm-ci-gw num",children:"가중 "+c.w+"%"}),wmJ("span",{className:"wm-ci-gd",children:c.desc})]}),
wmJ("ul",{className:"wm-ci-cl",children:__CRIT__.filter(x=>x.cat===c.id).map(x=>{let op=wmOpen.has(x.id),a=wmSel[x.id],rs=wmRes[x.id];return wmJs("li",{className:"wm-ci-c"+(op?" open":"")+(a&&!a.applied?" off":""),children:[wmJs("button",{type:"button",className:"wm-ci-ch","aria-expanded":op,onClick:()=>wmTog(x.id),children:[wmJ("span",{className:"wm-ci-id num",children:x.id}),wmJs("span",{className:"wm-ci-ct",children:[wmJs("span",{className:"wm-ci-cn",children:[wmJ("b",{children:x.name}),wmDots(x.w)]}),wmJ("span",{className:"wm-ci-cd",children:x.desc})]}),wmSt(x),wmJ(__ICON__,{name:op?"chevU":"chevD",size:15,className:"wm-ci-cv"})]}),
op&&wmJs("dl",{className:"wm-ci-cx",children:[wmJ("dt",{children:"확인할 점"}),wmJ("dd",{children:x.check}),wmJ("dt",{children:"중요도"}),wmJ("dd",{children:x.w+" — 영역 점수에 "+x.w+"배로 반영"}),a?wmJ("dt",{children:"이 제안서"}):null,a?wmJ("dd",{children:(a.applied?"적용":"적용 안 함")+" · "+a.why+(a.applied&&rs&&rs.src==="rule"?" · 규칙 채점":"")}):null]})]},x.id)})})]},c.id))]})]})}'''
for k, v in dict(__J__=J, __R__=R, __CRIT__=CRIT, __CATS__=CATS, __BAND__=BAND, __VERDICT__=VERDICT,
                 __MODAL__=MODAL, __ICON__=ICON).items():
    COMP = COMP.replace(k, v)
assert '__' not in re.sub(r'"[^"]*"', '', COMP)
COMP = esc(COMP.replace('\n', ''))

# ---------- 2. report component: state, ! button on the score ring, popup ----------
ipc2 = ipc.replace('function %s({r:%s}){let ' % (REP, RP),
                   'function %s({r:%s}){let[wmCiO,wmCiS]=(0,%s.useState)(!1),' % (REP, RP, R), 1)
btn = ('(0,{J}.jsxs)("div",{{className:"wm-ci-ring",children:[{ring},'
       '(0,{J}.jsx)("button",{{type:"button",className:"wm-ci-btn","aria-label":"{lab}",title:"{lab}","aria-haspopup":"dialog",'
       'onClick:()=>wmCiS(!0),children:(0,{J}.jsx)({I},{{name:"notice",size:16,stroke:2.8}})}})]}})').format(
    J=J, ring=ring.group(0), I=ICON, lab=esc('검토 점수 기준 보기'))
ipc2 = ipc2.replace(ring.group(0), btn, 1)
ipc2 = ipc2[:-4] + ',wmCiO&&(0,%s.jsx)(wmCritInfo,{r:%s,onClose:()=>wmCiS(!1)})]})}' % (J, RP)
s = s[:st] + COMP + ipc2 + s[en:]

# ---------- 3. exclamation icon ----------
info = 'info:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8v.5",'
assert s.count(info) == 1
s = s.replace(info, info + 'notice:"M12 5v9.5 M12 19v.2",')

# ---------- 4. CSS ----------
CSS = r'''
/* ---------- review · score criteria popup (! on the score ring) ---------- */
.wm-ci-ring { position: relative; flex-shrink: 0; display: grid; }
.wm-ci-btn { position: absolute; top: -2px; right: -2px; width: 28px; height: 28px; padding: 0; border-radius: 50%; display: grid; place-items: center;
  border: 0; background: var(--accent-soft); color: var(--accent); box-shadow: 0 0 0 3px var(--surface); cursor: pointer;
  transition: background .12s ease, color .12s ease, border-color .12s ease, transform .12s ease; }
.wm-ci-btn:hover { background: var(--accent); color: var(--on-accent); }
.wm-ci-btn:active { transform: scale(.94); }
.wm-ci-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.modal.wm-ci { width: min(920px, 100%); }
.mbody.wm-ci-b { gap: 22px; }
.wm-ci-sec { display: flex; flex-direction: column; gap: 10px; }
.wm-ci-h { margin: 0; font-size: 14px; font-weight: 800; letter-spacing: -.01em; }
.wm-ci-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.wm-ci-steps li { display: flex; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-2); }
.wm-ci-n { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 800; }
.wm-ci-steps b { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 7px; font-size: 13.5px; font-weight: 800; }
.wm-ci-steps b .num { font-size: 12px; font-weight: 700; color: var(--accent); }
.wm-ci-steps p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--ink-2); text-wrap: pretty; }
.wm-ci-steps small { display: block; margin-top: 6px; font-size: 11.5px; line-height: 1.5; color: var(--faint); }
.wm-ci-wl { display: flex !important; align-items: center; gap: 5px; }
.wm-ci-wl > span:not(.rv-w) { margin-right: 8px; font-weight: 700; }
.wm-ci-wts { display: flex; gap: 3px; }
.wm-ci-wt { flex: 1 1 0; min-width: 0; height: 38px; padding: 0 8px; border-radius: 7px; display: flex; flex-direction: column; justify-content: center; gap: 1px;
  background: var(--hcb); color: var(--hc); white-space: nowrap; overflow: hidden; }
.wm-ci-wt b { font-size: 11.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.wm-ci-wt .num { font-size: 12px; font-weight: 800; }
.wm-ci-bands { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.wm-ci-band { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px 9px; border-radius: 10px; background: var(--bcb); box-shadow: inset 0 3px 0 var(--bc); }
.wm-ci-bt { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.wm-ci-bt b { font-size: 13.5px; font-weight: 800; color: var(--bc); }
.wm-ci-bt .num { font-size: 12px; font-weight: 800; color: var(--bc); }
.wm-ci-bv { font-size: 12px; font-weight: 600; color: var(--ink-2); }
.wm-ci-notes { margin: 2px 0 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 16px; font-size: 12.5px; line-height: 1.55; }
.wm-ci-notes dt { font-weight: 700; color: var(--ink); white-space: nowrap; }
.wm-ci-notes dd { margin: 0; color: var(--ink-2); text-wrap: pretty; }
.wm-ci-lh { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; font-size: 12.5px; }
.wm-ci-lh .faint b { color: var(--ink-2); }
.wm-ci-nav { position: sticky; top: -18px; z-index: 2; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
  margin: 0 -4px; padding: 8px 4px; background: var(--surface); }
.wm-ci-nav::-webkit-scrollbar { display: none; }
.wm-ci-chip { flex-shrink: 0; height: 30px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--line-2); background: var(--surface);
  display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--ink-2); cursor: pointer; }
.wm-ci-chip .num { font-size: 11.5px; color: var(--faint); }
.wm-ci-chip:hover { border-color: var(--ink-2); }
.wm-ci-chip[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--surface); }
.wm-ci-chip[aria-pressed="true"] .num { color: inherit; opacity: .7; }
.wm-ci-g + .wm-ci-g { margin-top: 6px; }
.wm-ci-gh { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; padding: 4px 0 8px; }
.wm-ci-gi { width: 24px; height: 24px; border-radius: 7px; display: grid; place-items: center; background: var(--hcb); color: var(--hc); }
.wm-ci-gh > b { font-size: 14px; font-weight: 800; }
.wm-ci-gw { font-size: 11.5px; font-weight: 800; padding: 2px 7px; border-radius: 6px; background: var(--hcb); color: var(--hc); }
.wm-ci-gd { font-size: 12.5px; color: var(--muted); }
.wm-ci-cl { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.wm-ci-c + .wm-ci-c { border-top: 1px solid var(--line); }
.wm-ci-c.open { background: var(--surface-2); }
.wm-ci-ch { width: 100%; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 15px; align-items: center; gap: 12px; padding: 11px 14px;
  border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.wm-ci-ch:hover { background: var(--surface-2); }
.wm-ci-ch:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.wm-ci-id { font-size: 11.5px; font-weight: 800; color: var(--faint); }
.wm-ci-ct { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.wm-ci-cn { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; }
.wm-ci-cn b { font-size: 13.5px; font-weight: 700; }
.wm-ci-cd { font-size: 12.5px; line-height: 1.55; color: var(--muted); text-wrap: pretty; }
.wm-ci-c.off .wm-ci-cn b { color: var(--muted); }
.wm-ci-s { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border-radius: 7px; white-space: nowrap;
  background: var(--bcb); color: var(--bc); font-size: 11.5px; font-weight: 800; }
.wm-ci-s b { font-size: 13px; font-weight: 800; }
.wm-ci-s.off { background: var(--surface-3); color: var(--faint); font-weight: 700; }
.wm-ci-cv { color: var(--faint); }
.wm-ci-cx { margin: 0; padding: 0 14px 13px 66px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 14px; font-size: 12.5px; line-height: 1.55; }
.wm-ci-cx dt { font-weight: 700; color: var(--faint); white-space: nowrap; }
.wm-ci-cx dd { margin: 0; color: var(--ink-2); text-wrap: pretty; }
@media (max-width: 760px) {
  .wm-ci-nav { top: -14px; }
  .wm-ci-steps { grid-template-columns: minmax(0, 1fr); }
  .wm-ci-wts { flex-wrap: wrap; }
  .wm-ci-wt { flex: 1 0 auto !important; height: auto; padding: 5px 9px; flex-direction: row; align-items: baseline; gap: 5px; }
  .wm-ci-bands { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .wm-ci-notes { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .wm-ci-notes dd + dt { margin-top: 6px; }
  .wm-ci-ch { grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; padding: 11px 12px; }
  .wm-ci-id, .wm-ci-cv { display: none; }
  .wm-ci-cx { padding: 0 12px 12px; grid-template-columns: minmax(0, 1fr); gap: 1px; }
  .wm-ci-cx dd + dt { margin-top: 6px; }
}
'''
hero = s.find('.rv-hero {')
end = s.find('</style>', hero)
assert 0 < hero < end < s.find('<script'), (hero, end)
s = s[:end] + CSS + s[end:]

open(dst, 'w', encoding='utf-8', newline='').write(s)
print('ok', len(s))
