// Header/footer follows L_PH_SS_OF_A, L_PH_P_A and the callouts of L_SOL_03.
const tb=(i,text,x,y,w,size=14,color='#596170',extra='')=>`<div data-tb="${i}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;color:${color};line-height:1.4;${extra}">${text}</div>`;
function html(view){
  let out=`<div data-spatial-template="${view}" style="width:1280px;height:720px;position:relative;overflow:hidden;background:#ffffff;color:#121417;font-family:'Noto Sans KR',sans-serif">`;
  out+=tb(0,'03 · 공간별 제품 배치',64,44,1100,13,'#1428a0','font-weight:700;letter-spacing:.06em');
  out+=tb(1,view==='2d'?'공간과 제품을 한눈에 연결하는 2D 배치도':'공간마다 쓰임에 맞춘 3D 조감도',64,66,1152,30,'#121417','font-weight:700');
  out+=tb(2,'업종 · 공간 · 제품의 설치 위치를 확인하고, 공간별 구성을 제안합니다.',64,112,1152,15);
  out+=`<div data-spatial-slot="0" data-img="0" data-kind="aerial" data-hint="재현 가능한 ${view} 공간 조감도" style="position:absolute;left:64px;top:160px;width:820px;height:490px;background:#f4f7f6;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center"><span style="font-size:17px;color:#82908e">공간 조감도에서 생성한 장면을 연결하세요</span></div>`;
  for(let i=0;i<6;i++){
    const y=164+i*79;out+=`<div data-spatial-card="${i}" style="position:absolute;left:940px;top:${y}px;width:276px;height:69px;border-bottom:1px solid #e2e7e6"><div data-spatial-number="${i}" style="position:absolute;left:0px;top:2px;font-size:13px;color:#1428a0;font-weight:800">${String(i+1).padStart(2,'0')}</div></div>`;
    out+=tb(3+i*2,'공간 '+(i+1),969,y,247,15,'#121417','font-weight:700');out+=tb(4+i*2,'제품 모델 · 설치 위치',969,y+25,247,11.5);
  }
  out+=`<div style="position:absolute;left:64px;top:670px;width:1152px;height:1px;background:#e2e5ea"></div>`;
  out+=tb(15,'개념 배치 · 실측 도면 아님 · 추정 치수는 제품 상세에서 확인',64,679,1060,10.5,'#8a91a0');out+=tb(16,'1',1170,679,46,10.5,'#8a91a0','text-align:right').replace('data-tb="16"','data-tb="16" data-pgno');return out+'</div>';
}
export const SPATIAL_META=['2d','3d'].map(view=>({f:'L_SPATIAL_'+view.toUpperCase(),c:'PH',code:'SPACE-'+view.toUpperCase(),name:`공간 조감도 · ${view.toUpperCase()} · 공간·제품 연결`,when:'공간 조감도에서 생성·저장한 전체 또는 개별 공간의 제품 배치를 실제 좌표와 연결선으로 제안할 때',g:'공간 · 제품',p:'scenario',p2:'products',ind:null,sol:null,pc:0,req:['spaces','products','images'],prods:[],sols:[],phs:['공간 조감도'],ph:1,hl:'공간별 제품 배치',txt:`재현 가능한 공간 조감도 ${view} 평면도 공간맵 제품 배치 좌표 연결선`,eb:'03 · 공간별 제품 배치',foot:'개념 배치 · 실측 아님',sample:'예시 공간',nT:17,nI:1,ik:['aerial'],ih:[`공간 조감도에서 생성한 ${view.toUpperCase()} 장면`],pf:.44}));
export const SPATIAL_HTML=Object.fromEntries(SPATIAL_META.map(m=>[m.f,html(m.f.endsWith('2D')?'2d':'3d')]));
