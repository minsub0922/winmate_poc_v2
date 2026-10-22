// Account analysis: the contracting business, its operating roles and approval outputs.
// Same 1280×720 editable text/image contract as the existing photo layouts.
const text=(id,value,x,y,w,h,size=16,weight=400,color='#3d4452')=>`<div data-tb="${id}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${size}px;font-weight:${weight};line-height:1.4;color:${color};white-space:pre-line">${value}</div>`;
const card=(x,y,first,values)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:380px;height:184px;border:1px solid #e2e5ea;border-radius:12px;background:#f5f6f8"></div>${text(first,values[0],x+18,y+16,344,28,20,800,'#121417')}${text(first+1,values[1],x+18,y+50,344,22,14,700,'#1428a0')}${text(first+2,values[2],x+18,y+80,344,52,16)}${text(first+3,values[3],x+18,y+138,344,36,14,500,'#596170')}`;
const title='사업자·운영자·이용자의 책임을 먼저 나눕니다';
const html=`<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:#ffffff;color:#121417;font-family:'Noto Sans KR',system-ui,sans-serif;word-break:keep-all;overflow-wrap:anywhere">
${text(0,'01 · 제안 대상 이해',64,40,1152,22,14,700,'#1428a0')}
${text(1,title,64,66,1152,44,32,800,'#121417')}
${text(2,'협의 역할별 검토 사항과 산출물 · 실제 계약·결재 권한은 첫 협의에서 확정',64,114,1152,30,18)}
<div data-img="0" data-kind="space" data-hint="제안 대상 기업의 대표 사업장" style="position:absolute;left:64px;top:168px;width:352px;height:282px;overflow:hidden;border-radius:12px;background:#eaeefb"><img src="/img/ph/of-meeting.jpg" alt="제안 대상의 대표 업무 공간" style="display:block;width:100%;height:100%;object-fit:cover"></div>
<div style="position:absolute;left:64px;top:466px;width:352px;height:186px;border-radius:12px;background:#eaeefb"></div>
${text(3,'제안 대상 · 공개자료 확인',84,482,312,22,14,700,'#1428a0')}
${text(4,'시설 운영 법인',84,512,312,54,20,800,'#121417')}
${text(5,'발주자·운영자·최종 이용자를 구분하고 계약과 개인정보의 경계를 합의합니다.',84,576,312,66,16)}
${card(440,168,6,['투자·계약 검토','예산·구매 검토 역할','사업 범위·투자 주체·계약 책임을 확인합니다.','산출물 · 제안 범위와 승인 조건'])}
${card(836,168,10,['시스템·보안 검토','IT·정보보호 역할','기존 시스템·지원 모델·계정 권한을 대조합니다.','산출물 · 연동·접근 권한 확인서'])}
${card(440,368,14,['현장 운영 검토','사업장 운영 역할','작업 동선·운영 시간·예외 대응을 검증합니다.','산출물 · 작업 절차와 인수 기록'])}
${card(836,368,18,['서비스 품질 검토','브랜드·서비스 검토 역할','고객 접점의 기준과 배포·검수 절차를 합의합니다.','산출물 · 시범 평가와 확산 판정'])}
<div style="position:absolute;left:440px;top:568px;width:776px;height:84px;border:1px solid #dce2f3;border-radius:12px;background:#ffffff"></div>
${[0,1,2].map((i)=>text(22+i*2,['구매자','운영자','이용자'][i],456+i*256,578,232,20,14,700,'#1428a0')+text(23+i*2,['투자·계약·승인 범위','설정·점검·업무 인수','사용 경험·개인 계정'][i],456+i*256,604,232,44,16)).join('')}
<div style="position:absolute;left:64px;top:668px;width:1152px;height:1px;background:#e2e5ea"></div>
${text(28,'업체 분석',64,680,84,20,12,600,'#596170')}${text(29,'공개자료 기반 검토안 · 협의 역할과 승인권은 실제 계약에 따라 확정',160,680,900,20,12,400,'#8a91a0')}${text(30,'CONFIDENTIAL · 5',1106,680,110,20,12,400,'#8a91a0')}
</div>`;
export const ACCOUNT_HTML={L_AC_GOV_01:html};
export const ACCOUNT_META=[{
 f:'L_AC_GOV_01',c:'PH',code:'AC-GOV-01',name:'제안 대상 · 구매·운영 책임 지도',
 when:'B2B 제안의 발주자·운영자·최종 이용자를 구분하고, 투자·IT·현장·서비스 역할의 검토 항목과 승인 산출물을 정할 때',
 g:'고객사 이해 · 사업·조직·구매 구조',p:'customer',p2:null,ind:null,sol:null,sample:'시설 운영 법인',
 eb:'01 · 제안 대상 이해',hl:title,sub:'계약·시스템·현장·서비스의 검토 역할과 산출물',foot:'공개자료 기반 검토안',
 nT:31,nI:1,ik:['space'],ih:['제안 대상 기업의 대표 사업장'],ph:0,phs:[],pc:0,req:['customer','challenges','images'],prods:[],sols:[],pf:.11,
 txt:'제안 대상 기업 운영 법인 사업 이해 사업자 발주자 구매자 운영자 최종 이용자 의사결정 구매 투자 예산 계약 승인 권한 IT 보안 현장 운영 브랜드 서비스 검토 산출물 인수 개인정보 경계 '+title,
}];
