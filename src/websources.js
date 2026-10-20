// 시장 조사 · 근거 자료로 쓸 만한 웹 소스 (기관 대표 주소만 — 특정 보고서 주소는 넣지 않음).
// ind: 업종 코드 목록('*' = 모든 업종), topics: 이 소스가 잘 맞는 파트 유형.
// what: 거기서 무엇을 찾으면 되는지. 앱은 이 목록을 '어디서 찾을지' 안내로만 쓰고, AI가 내용을 읽은 것처럼 인용하지 않음.
export const WEB_KIND = { stat: '공식 통계', report: '시장 리포트', gov: '공공 · 협회', disclosure: '기업 공시', samsung: '삼성 자료' };

export const WEB_SOURCES = [
  // ---- 모든 업종 공통 ----
  { id: 'kosis', name: '국가통계포털 KOSIS', org: '국가 통계', url: 'https://kosis.kr', kind: 'stat', ind: ['*'], topics: ['market', 'customer', 'insight', 'effect', 'user'], what: '업종 · 지역별 사업체 수, 매출, 종사자 수 같은 공식 통계' },
  { id: 'datagokr', name: '공공데이터포털', org: '행정안전부', url: 'https://www.data.go.kr', kind: 'stat', ind: ['*'], topics: ['market', 'customer', 'user'], what: '공공기관이 공개한 업종 · 시설 · 이용 데이터셋' },
  { id: 'index', name: 'e-나라지표', org: '정부 지표', url: 'https://www.index.go.kr', kind: 'stat', ind: ['*'], topics: ['market', 'insight'], what: '정책 지표의 연도별 추이 — 성장률 · 비중 같은 시계열 근거' },
  { id: 'ecos', name: '한국은행 경제통계시스템 ECOS', org: '한국은행', url: 'https://ecos.bok.or.kr', kind: 'stat', ind: ['*'], topics: ['market', 'cost', 'insight'], what: '소비 · 물가 · 경기 지표 — 시장 배경 수치' },
  { id: 'dart', name: '전자공시시스템 DART', org: '금융감독원', url: 'https://dart.fss.or.kr', kind: 'disclosure', ind: ['*'], topics: ['customer', 'competition', 'market'], what: '고객사 · 경쟁사 사업보고서 — 매출, 점포 · 사업장 수, 투자 계획' },
  { id: 'statista', name: 'Statista', org: '글로벌 통계 (유료)', url: 'https://www.statista.com', kind: 'report', ind: ['*'], topics: ['market', 'competition', 'insight'], what: '국가 · 업종별 시장 규모와 전망 차트' },
  { id: 'gvr', name: 'Grand View Research', org: '시장 리포트', url: 'https://www.grandviewresearch.com', kind: 'report', ind: ['*'], topics: ['market', 'competition'], what: '디지털 사이니지 · HVAC · 스마트 빌딩 등 시장 규모 · 연평균 성장률 요약' },
  { id: 'mnm', name: 'MarketsandMarkets', org: '시장 리포트', url: 'https://www.marketsandmarkets.com', kind: 'report', ind: ['*'], topics: ['market', 'competition'], what: '기술 · 장비 시장 규모와 주요 공급사 동향 요약' },
  { id: 'omdia', name: 'Omdia', org: '디스플레이 · IT 리서치', url: 'https://omdia.tech.informa.com', kind: 'report', ind: ['*'], topics: ['market', 'competition', 'why'], what: '사이니지 · 디스플레이 출하량, 공급사 점유율' },
  { id: 'idc', name: 'IDC', org: 'IT 리서치', url: 'https://www.idc.com', kind: 'report', ind: ['OF', 'FN', 'ED', 'MF', 'PB', 'OE'], topics: ['market', 'competition'], what: '모바일 · PC · IT 인프라 시장 규모와 공급사 점유율' },
  { id: 'gartner', name: 'Gartner', org: 'IT 리서치', url: 'https://www.gartner.com', kind: 'report', ind: ['OF', 'FN', 'MF', 'PB'], topics: ['market', 'insight', 'competition'], what: '기술 도입 트렌드 · 성숙도 — 업계 흐름 근거' },
  { id: 'korcham', name: '대한상공회의소', org: '경제 단체', url: 'https://www.korcham.net', kind: 'gov', ind: ['RT', 'FB', 'SV', 'MF'], topics: ['market', 'insight'], what: '소매 유통 경기 전망 · 업계 조사 보고서' },
  { id: 'samsungbiz', name: '삼성전자 비즈니스', org: '삼성전자', url: 'https://www.samsung.com/sec/business/', kind: 'samsung', ind: ['*'], topics: ['products', 'spec', 'solution', 'case', 'why', 'value'], what: 'B2B 제품 · 솔루션 소개와 고객 사례' },
  // ---- 에너지 · 공조 ----
  { id: 'energy', name: '한국에너지공단', org: '공공기관', url: 'https://www.energy.or.kr', kind: 'gov', ind: ['OF', 'RS', 'HT', 'ED', 'MD', 'PB', 'FB', 'RT', 'MF'], topics: ['effect', 'market', 'value', 'cost'], what: '건물 에너지 사용량 · 효율 기준 · 지원 제도' },
  { id: 'epsis', name: '전력통계정보시스템 EPSIS', org: '한국전력거래소', url: 'https://epsis.kpx.or.kr', kind: 'stat', ind: ['OF', 'RS', 'MF', 'PB', 'HT'], topics: ['effect', 'cost', 'market'], what: '용도별 전력 사용량 · 요금 — 절감 효과 계산의 기준값' },
  { id: 'iea', name: 'IEA', org: '국제에너지기구', url: 'https://www.iea.org', kind: 'report', ind: ['OF', 'RS', 'MF'], topics: ['market', 'insight', 'effect'], what: '히트펌프 · 건물 에너지 전환 글로벌 동향' },
  // ---- 업종별 ----
  { id: 'atfis', name: '식품산업통계정보 FIS', org: 'aT 한국농수산식품유통공사', url: 'https://www.atfis.or.kr', kind: 'stat', ind: ['FB'], topics: ['market', 'customer', 'insight'], what: '외식업 경기 · 업종별 매출 · 프랜차이즈 통계' },
  { id: 'ftcfr', name: '가맹사업거래 정보공개서', org: '공정거래위원회', url: 'https://franchise.ftc.go.kr', kind: 'disclosure', ind: ['FB', 'SV', 'RT'], topics: ['customer', 'competition', 'market'], what: '가맹본부별 가맹점 수 · 평균 매출 · 신규 개점 추이' },
  { id: 'sbiz', name: '소상공인 상권정보', org: '소상공인시장진흥공단', url: 'https://sg.sbiz.or.kr', kind: 'stat', ind: ['FB', 'SV', 'RT'], topics: ['market', 'customer', 'user'], what: '상권 · 업종별 점포 수, 유동 인구' },
  { id: 'motie', name: '산업통상자원부', org: '정부 부처', url: 'https://www.motie.go.kr', kind: 'gov', ind: ['RT', 'MF', 'OF'], topics: ['market', 'insight'], what: '유통업체 매출 동향 · 산업 정책 자료' },
  { id: 'datalab', name: '한국관광 데이터랩', org: '한국관광공사', url: 'https://datalab.visitkorea.or.kr', kind: 'stat', ind: ['HT', 'TP', 'VN', 'RT'], topics: ['market', 'user', 'customer'], what: '방문객 수 · 관광 소비 · 숙박 수요 추이' },
  { id: 'tourknow', name: '관광지식정보시스템', org: '한국문화관광연구원', url: 'https://know.tour.go.kr', kind: 'stat', ind: ['HT', 'TP'], topics: ['market', 'insight'], what: '관광 사업체 · 숙박업 통계, 관광 동향 보고서' },
  { id: 'str', name: 'STR', org: '호텔 시장 데이터', url: 'https://str.com', kind: 'report', ind: ['HT'], topics: ['market', 'competition'], what: '객실 점유율 · ADR · RevPAR 같은 호텔 성과 지표' },
  { id: 'kopis', name: '공연예술통합전산망 KOPIS', org: '예술경영지원센터', url: 'https://www.kopis.or.kr', kind: 'stat', ind: ['VN'], topics: ['market', 'user'], what: '공연 건수 · 관객 수 · 티켓 판매액' },
  { id: 'kobis', name: '영화관입장권 통합전산망', org: '영화진흥위원회', url: 'https://www.kobis.or.kr', kind: 'stat', ind: ['VN'], topics: ['market', 'user'], what: '극장 관객 수 · 스크린 수 · 매출 추이' },
  { id: 'kobaco', name: '한국방송광고진흥공사', org: '공공기관', url: 'https://www.kobaco.co.kr', kind: 'gov', ind: ['AD'], topics: ['market', 'insight'], what: '광고비 조사 — 옥외 · 디지털 광고 시장 규모' },
  { id: 'molit', name: '국토교통 통계누리', org: '국토교통부', url: 'https://stat.molit.go.kr', kind: 'stat', ind: ['OF', 'RS', 'ID', 'PB'], topics: ['market', 'customer'], what: '건축 인허가 · 착공 · 주택 공급 통계' },
  { id: 'rone', name: '부동산통계정보 R-ONE', org: '한국부동산원', url: 'https://www.reb.or.kr/r-one/', kind: 'stat', ind: ['OF', 'RS'], topics: ['market', 'competition'], what: '오피스 임대료 · 공실률, 주택 가격 동향' },
  { id: 'kess', name: '교육통계서비스', org: '한국교육개발원', url: 'https://kess.kedi.re.kr', kind: 'stat', ind: ['ED'], topics: ['market', 'user', 'customer'], what: '학교 · 학생 · 교원 수, 교육 시설 통계' },
  { id: 'keris', name: '한국교육학술정보원 KERIS', org: '공공기관', url: 'https://www.keris.or.kr', kind: 'gov', ind: ['ED'], topics: ['market', 'insight'], what: '디지털 교육 · 스마트 교실 정책과 실태 조사' },
  { id: 'hira', name: '보건의료빅데이터개방시스템', org: '건강보험심사평가원', url: 'https://opendata.hira.or.kr', kind: 'stat', ind: ['MD'], topics: ['market', 'customer', 'user'], what: '의료기관 · 병상 수, 진료 이용 통계' },
  { id: 'khidi', name: '한국보건산업진흥원', org: '공공기관', url: 'https://www.khidi.or.kr', kind: 'gov', ind: ['MD'], topics: ['market', 'insight'], what: '보건산업 · 의료기관 시장 동향 보고서' },
  { id: 'nlic', name: '국가물류통합정보센터', org: '국토교통부', url: 'https://www.nlic.go.kr', kind: 'stat', ind: ['MF'], topics: ['market', 'customer'], what: '물류 시설 · 물동량 통계' },
  { id: 'kicox', name: '한국산업단지공단', org: '공공기관', url: 'https://www.kicox.or.kr', kind: 'gov', ind: ['MF'], topics: ['market', 'customer'], what: '산업단지 입주 · 가동 · 생산 통계' },
  { id: 'fisis', name: '금융통계정보시스템 FISIS', org: '금융감독원', url: 'https://fisis.fss.or.kr', kind: 'stat', ind: ['FN'], topics: ['market', 'customer', 'competition'], what: '금융회사별 점포 · 임직원 · 영업 현황' },
  { id: 'fsc', name: '금융위원회', org: '정부 기관', url: 'https://www.fsc.go.kr', kind: 'gov', ind: ['FN'], topics: ['market', 'insight'], what: '디지털 금융 · 점포 운영 관련 정책 자료' },
  { id: 'g2b', name: '나라장터', org: '조달청', url: 'https://www.g2b.go.kr', kind: 'gov', ind: ['PB', 'ED', 'MD'], topics: ['market', 'competition', 'cost'], what: '공공 발주 공고 · 낙찰 가격 — 유사 사업 규모와 단가' },
  { id: 'ktdb', name: '국가교통DB', org: '한국교통연구원', url: 'https://www.ktdb.go.kr', kind: 'stat', ind: ['PB', 'AD'], topics: ['market', 'user'], what: '교통량 · 유동 인구 — 노출 · 이용 규모 근거' },
];

const HOST = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return u; } };
export const hostOf = HOST;

/** 업종 · 파트 유형에 맞는 웹 소스 순위. */
export function webSourcesFor(ind, type, limit = 6) {
  return WEB_SOURCES.map((w) => {
    let s = 0;
    if (ind && w.ind.includes(ind)) s += 3; else if (w.ind.includes('*')) s += 1; else s -= 4;
    if (type && w.topics.includes(type)) s += 2.5;
    if (w.kind === 'stat') s += 0.3;
    return { w, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.w);
}
