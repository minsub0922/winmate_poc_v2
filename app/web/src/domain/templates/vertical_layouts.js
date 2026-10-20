// Reusable photo layouts for the authored vertical scenarios. Original templates
// and their slot meanings are preserved; all new editable slots start at zero.
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const box = (x, y, w, h, css = '') => `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;${css}`;
const text = (i, value, x, y, w, h, size = 20, css = '') => `<div data-tb="${i}" style="${box(x,y,w,h)}font-size:${size}px;line-height:1.35;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;${css}">${esc(value)}</div>`;
const image = (i, x, y, w, h, src, hint, css = '') => `<div data-slot="Photo" data-img="${i}" data-kind="space" data-hint="${esc(hint)}" style="${box(x,y,w,h)}overflow:hidden;background:#fff;${css}"><img src="${esc(src)}" alt="${esc(hint)}" style="width:100%;height:100%;display:block;object-fit:cover"></div>`;
const root = (body, bg = '#ffffff', color = '#121417') => `<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:${bg};color:${color};font-family:'Noto Sans KR',sans-serif">${body}</div>`;
const footer = (customerSlot, sourceSlot, pageSlot) => text(customerSlot,'가상 고객 · 제안 예시',64,675,250,22,12,'color:#68717d') + text(sourceSlot,'사진: 삼성 공식 도입 현장 참고 · 고객·수치·일정은 가정',324,675,820,30,11,'color:#68717d') + text(pageSlot,'1',1170,675,46,24,12,'text-align:right;color:#68717d');
const defs = [
  {
    f:'L_PH_VX_COVER_A',name:'표지 · 공간 사진 + 하단 메시지',p:'cover',nT:7,nI:1,pf:.63,
    when:'상단 공간 사진과 하단 메시지로 제안을 시작할 때',
    html:root(image(0,0,0,1280,454,'img/ph/of-meeting.jpg','고객 업종의 대표 공간 참고사진') +
      `<div style="${box(0,454,1280,4)}background:#1428a0"></div>` +
      text(0,'SPACE & BUSINESS',64,486,1152,24,13,'color:#1428a0;letter-spacing:.06em;font-weight:700') +
      text(1,'일하는 공간을 다음 경험으로',64,519,1152,77,40,'font-weight:700;line-height:1.2') +
      text(2,'사람의 동선과 운영 방식을 함께 바꾸는 공간 제안',64,604,1152,45,18,'color:#596170') +
      text(3,'가상 고객 · 제안 예시',64,658,750,24,13) +
      text(4,'가상 고객의 요구를 바탕으로 구성한 맞춤 제안',64,702,1152,15,9,'color:#596170;line-height:1.3') +
      text(5,'사진: 삼성 공식 도입 현장 참고',64,684,1152,16,10,'color:#596170;line-height:1.3') +
      text(6,'삼성 B2B 제품 · 솔루션',900,658,316,24,12,'text-align:right;color:#596170')),
  },
  {
    f:'L_PH_VX_COVER_B',name:'표지 · 상단 메시지 + 넓은 현장 사진',p:'cover',nT:7,nI:1,pf:.625,
    when:'상단의 짧은 메시지와 넓은 현장 사진으로 운영 개선 제안을 시작할 때',
    html:root(image(0,0,270,1280,450,'img/ph/of-control-room.jpg','고객 업종의 운영 현장 참고사진') +
      text(0,'OPERATIONS / NEXT',64,34,1152,26,13,'color:#1428a0;letter-spacing:.06em;font-weight:700') +
      text(1,'매일의 운영을 더 단순하게',64,70,1152,98,40,'font-weight:700;line-height:1.2') +
      text(2,'현장 확인에서 조치와 인계까지 연결하는 제안',64,177,1152,40,18,'color:#596170') +
      text(3,'가상 고객 · 제안 예시',64,229,750,26,13) +
      text(4,'가상 고객의 운영 조건 · 실제 성과를 의미하지 않음',32,702,1216,15,9,'color:#fff;line-height:1.3;text-shadow:0 1px 3px #111') +
      text(5,'사진: 삼성 공식 도입 현장 참고',32,681,1216,17,10,'color:#fff;line-height:1.3;text-shadow:0 1px 3px #111') +
      text(6,'삼성 B2B 제품 · 솔루션',900,229,316,26,12,'color:#596170;text-align:right')),
  },
  {
    f:'L_PH_VX_PROOF',name:'관련 사례 · 현장 2컷 + 적용 근거와 검토 조건',p:'case',nT:14,nI:2,pf:.2456,
    req:['cases','customer','images'],
    when:'검증된 사례의 적용 제품·공간과 이번 고객에게 검토할 조건을 나란히 설명할 때. 성과 수치를 임의로 추가하지 않는다',
    html:root(text(0,'REFERENCE / APPLICATION',64,34,1152,24,13,'color:#1428a0;letter-spacing:.1em') +
      text(1,'관련 사례에서 적용 범위의 근거를 찾습니다',64,69,1152,60,34,'font-weight:700') +
      text(2,'사례의 실제 적용 내용과 고객별 검토 조건을 분리합니다',64,130,1152,36,18,'color:#68717d') +
      image(0,64,188,654,282,'img/ph/of-meeting.jpg','공식 도입 현장 참고사진') +
      image(1,64,484,272,154,'img/ph/of-control-room.jpg','공식 도입 현장 보조사진') +
      text(3,'실제 적용 공간',766,184,450,26,15,'color:#1428a0;font-weight:700') +
      text(4,'업무 공간 · 공용 회의실',766,220,450,66,24,'font-weight:700') +
      text(5,'공식 사례의 제안 범위',766,306,450,26,15,'color:#1428a0;font-weight:700') +
      text(6,'디스플레이 · 공조와 운영 솔루션의 실제 적용 범위',766,342,450,112,18) +
      text(7,'이번 고객에게 검토할 점',766,474,450,26,15,'color:#1428a0;font-weight:700') +
      text(8,'동일한 성과를 보장하지 않고 설치 조건과 운영 절차를 비교합니다',766,510,450,116,19) +
      text(9,'사진의 실제 촬영 현장은 이미지 설명에 별도 기록',356,492,362,108,12,'color:#68717d') +
      text(10,'제품·서비스 지원 범위는 모델·현장·계약에 따라 확인',64,643,1152,24,12,'color:#68717d') + footer(11,12,13)),
  },
];

export const VERTICAL_HTML = Object.fromEntries(defs.map(d=>[d.f,d.html.replace('<div ',`<div data-proposal-authored="1" data-reference-layout="1" data-design-template="${d.f}" `)]));
export const VERTICAL_META = defs.map(({html,...d})=>({
  c:'PH',code:d.f.slice(2),g:'사진 중심 · 업종 맞춤 제안',p2:null,ind:null,sol:null,
  pc:0,req:['project','customer','images'],prods:[],sols:[],phs:[],ph:0,
  hl:d.p==='cover'?'고객 상황에 맞춘 공간 · 운영 제안':'실제 적용 내용과 고객별 검토 조건',
  txt:d.name+' '+d.when,eb:'VERTICAL PROPOSAL',foot:'고객명·수치·일정은 제안 예시',sample:'가상 고객',
  sub:'사진과 편집 가능한 텍스트로 구성',ik:['space'],ih:['업종·공간에 맞는 공식 참고사진'],...d,
}));
