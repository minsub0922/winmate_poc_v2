// 건물 템플릿 — 업종마다 외벽 변형 하나에 건물 하나씩(외벽 × 공간 조합 · 층 수 · 셋백을 미리 맞춘 건물) + 복합 건물
// floors: 아래층부터. 문자열이면 그 템플릿의 외벽 번호 = 이 템플릿의 fv, [id, fv]면 따로 지정(다른 업종 층)
const T = (ind, fv, title, floors, id = `${ind.toLowerCase()}-${fv}`) => ({
  id, ind, fv, title,
  floors: floors.map((x) => (Array.isArray(x) ? { tpl: x[0], fv: x[1] } : { tpl: x, fv })),
});

export const PRESETS = [
  T('FB', 0, '테라스 카페 하우스', ['fb-full-standard', 'fb-five']),
  T('FB', 1, '우드 비스트로 빌딩', ['fb-full-spacious', 'fb-front4-sp', 'fb-front4']),
  T('FB', 2, '브릭 베이커리 하우스', ['fb-full-compact', 'fb-mid4-c', 'fb-pair-x4']),

  T('RT', 0, '블랙 플래그십 스토어', ['rt-full-standard', 'rt-mix-x6', 'rt-five']),
  T('RT', 1, '화이트 갤러리 플래그십', ['rt-front4-sp', 'rt-front4-sp', 'rt-front4']),
  T('RT', 2, '패턴 백화점', ['rt-full-spacious', 'rt-full-spacious', 'rt-full-standard', 'rt-five']),

  T('SV', 0, '그린 무인 매장 빌딩', ['sv-full-standard', 'sv-five']),
  T('SV', 1, '24시 무인 스토어', ['sv-bar3', 'sv-bar3-back']),
  T('SV', 2, '라이트 우드 스터디카페', ['sv-full-compact', 'sv-mid4-c', 'sv-pair-x4']),

  T('HT', 0, '브라운 핀 호텔', ['ht-full-standard', 'ht-five', 'ht-mix-x6', 'ht-five', 'ht-front4']),
  T('HT', 1, '화이트 리조트', ['ht-full-spacious', 'ht-full-standard', 'ht-five']),
  T('HT', 2, '클래식 그랜드 호텔', ['ht-full-standard', 'ht-full-standard', 'ht-mix-x6', 'ht-five', 'ht-back4']),

  T('TP', 0, '컬러 핀 테마 체험관', ['tp-full-spacious', 'tp-front4-sp']),
  T('TP', 1, '팝 컬러 키즈파크', ['tp-full-standard', 'tp-five', 'tp-front4']),
  T('TP', 2, '미디어 아트 큐브', ['tp-front4', 'tp-front4', 'tp-back4']),

  T('VN', 0, '아레나 LED 경기장', ['vn-full-spacious', 'vn-full-spacious', 'vn-front4-sp']),
  T('VN', 1, '스타디움 루버', ['vn-full-standard', 'vn-mix-x6', 'vn-five']),
  T('VN', 2, '시네마 콤플렉스', ['vn-full-compact', 'vn-mid4-c', 'vn-pair-x4']),

  T('AD', 0, '코너 랩 미디어 빌딩', ['ad-full-standard', 'ad-five', 'ad-mix-x6']),
  T('AD', 1, '풀 파사드 LED 타워', ['ad-front4', 'ad-front4', 'ad-back4', 'ad-front4']),
  T('AD', 2, '빌보드 타워', ['ad-full-compact', 'ad-mid4-c', 'ad-pair-x4']),

  T('OF', 0, '블루 글라스 오피스', ['of-full-standard', 'of-five', 'of-mix-x6', 'of-full-standard']),
  T('OF', 1, '알루미늄 핀 오피스', ['of-full-spacious', 'of-front4-sp', 'of-front4-sp', 'of-front4-sp', 'of-front4']),
  T('OF', 2, '수평 차양 비즈니스 센터', ['of-full-standard', 'of-back4', 'of-front4']),
  T('OF', 3, '다크 오피스 타워', ['cowork-full-standard', 'of-full-standard', 'of-five', 'of-mix-x6', 'of-full-standard', 'of-five']),

  T('RS', 0, '화이트 발코니 레지던스', ['rs-full-standard', 'rs-five', 'rs-five', 'rs-mix-x6']),
  T('RS', 1, '브릭 타운하우스', ['rs-bar3', 'rs-bar3-back', 'rs-bar3']),
  T('RS', 2, '우드 패널 분양 홍보관', ['rs-full-spacious', 'rs-front4-sp']),

  T('ID', 0, '웜 인테리어 쇼룸', ['id-full-standard', 'id-five']),
  T('ID', 1, '블랙 프레임 리빙 갤러리', ['id-full-spacious', 'id-front4-sp', 'id-front4']),
  T('ID', 2, '스톤 & 우드 디자인 쇼룸', ['id-full-compact', 'id-mid4-c']),

  T('ED', 0, '붉은 벽돌 캠퍼스', ['ed-full-standard', 'ed-five', 'ed-mix-x6', 'ed-five']),
  T('ED', 1, '컬러 패널 미래 학교', ['ed-full-compact', 'ed-full-compact', 'ed-mid4-c']),
  T('ED', 2, '화이트 그리드 러닝센터', ['ed-full-spacious', 'ed-front4-sp', 'ed-front4-sp']),

  T('PB', 0, '석재 기둥 공공 청사', ['pb-full-standard', 'pb-five', 'pb-mix-x6']),
  T('PB', 1, '시민 행정센터', ['pb-full-spacious', 'pb-full-standard', 'pb-five', 'pb-front4']),
  T('PB', 2, '교통 환승센터', ['pb-full-spacious', 'pb-front4-sp']),

  T('MD', 0, '화이트 메디컬 센터', ['md-full-standard', 'md-five', 'md-mix-x6', 'md-five']),
  T('MD', 1, '그린 케어 하우스', ['md-full-compact', 'md-mid4-c', 'md-pair-x4']),
  T('MD', 2, '블루 글라스 클리닉', ['md-front4', 'md-back4', 'md-front4']),

  T('MF', 0, '골강판 스마트 팩토리', ['mf-full-spacious', 'mf-full-spacious']),
  T('MF', 1, '프리캐스트 정밀 제조센터', ['mf-full-standard', 'mf-five']),
  T('MF', 2, '물류센터', ['mf-full-spacious', 'mf-mix-x6']),

  T('FN', 0, '석재 핀 금융센터', ['fn-full-standard', 'fn-five', 'fn-mix-x6', 'fn-full-standard']),
  T('FN', 1, '브론즈 프라이빗 뱅킹', ['fn-front4', 'fn-back4', 'fn-front4']),
  T('FN', 2, '그라니트 은행 본점', ['fn-full-spacious', 'fn-full-standard', 'fn-five', 'fn-mix-x6', 'fn-front4']),

  T('OE', 0, '모바일 스토어', ['oe-full-standard', 'oe-five']),
  T('OE', 1, '블루 글로우 디바이스 쇼룸', ['oe-front4-sp', 'oe-front4']),
  T('OE', 2, '컬러 피어 팝업 스토어', ['oe-full-compact', 'oe-pair-x4']),

  // 복합 — 근린생활 상가 · 주상복합 · 복합몰 + 업종을 섞은 건물
  T('MX', 0, '근린생활 상가 빌딩', ['mx-neighborhood', 'mx-neighborhood', ['of-front4', 0], ['of-back4', 0]]),
  T('MX', 1, '주상복합 타워', ['mx-retail-dining', 'mx-community', ['rs-full-standard', 0], ['rs-five', 0], ['rs-five', 0], ['rs-front4', 0]]),
  T('MX', 2, '석재 복합몰', ['mx-retail-dining', 'mx-wellness', 'mx-work-learn', 'mx-showroom']),
  T('MX', 0, '호텔 · 리테일 복합', [['rt-full-standard', 0], ['fb-full-standard', 1], ['ht-mix-x6', 2], ['ht-five', 2], ['ht-five', 2]], 'mx-hotel'),
  T('MX', 1, '오피스 · 컨퍼런스 타워', ['mx-lobby', ['of-full-standard', 3], ['of-mix-x6', 3], ['of-five', 3], ['mx-control', 1]], 'mx-office'),
];
export const presetOf = (id) => PRESETS.find((p) => p.id === id) || null;
