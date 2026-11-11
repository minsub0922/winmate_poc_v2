// 생성 파일 — 표준 건물 조감도(샘플 버티컬 시나리오 · 업종별 표준 제안서 03 공간별 제안 첫 장의 건물).
// 공간이 6개를 넘는 업종 8개의 공간을 층마다 나눠 모두 한 번씩 채운 건물(공간 중복 없음 · 층당 2~5공간 · 공간마다 8×6.8m 한 칸).
// 건물 템플릿(빈 층)과 달리 층마다 공간 · 층 이름이 들어 있다. 층 = bake-standard.js의 std-* 층, 아래층부터.
// 직접 고치지 않는다 — app/scripts/vertical_standard/README.md.
const S = (vid, ind, fv, title, floors) => ({ id: `std-${vid}`, vid, ind, fv, title, std: true, floors: floors.map(([tpl, name]) => ({ tpl, fv, name })) });
export const STD_PRESETS = [
  S('rt_mall', 'RT', 2, '백화점·쇼핑몰 표준 건물', [['std-rt_mall-1f', '아트리움 · 안내'], ['std-rt_mall-2f', '매장 · 푸드코트'], ['std-rt_mall-3f', '관제 · 기계실']]),
  S('rt_hyper', 'RT', 1, '대형마트·SSM 표준 건물', [['std-rt_hyper-1f', '신선식품 · 계산대'], ['std-rt_hyper-2f', '진열 · 가전'], ['std-rt_hyper-3f', '창고 · 기계실']]),
  S('ht_large', 'HT', 2, '대형 호텔·리조트 표준 건물', [['std-ht_large-1f', '로비 · 레스토랑'], ['std-ht_large-2f', '연회장 · 백오피스'], ['std-ht_large-3f', '피트니스 · 관제'], ['std-ht_large-4f', '객실 · 라운지']]),
  S('of_hq', 'OF', 0, '대기업 사옥 표준 건물', [['std-of_hq-1f', '로비 · 구내식당'], ['std-of_hq-2f', '업무 · 라운지'], ['std-of_hq-3f', '강당 · 대회의실'], ['std-of_hq-4f', '임원실 · 기계실']]),
  S('rs_apt', 'RS', 0, '아파트 표준 건물', [['std-rs_apt-1f', '로비 · 커뮤니티'], ['std-rs_apt-2f', '세대']]),
  S('ed_univ', 'ED', 0, '대학 캠퍼스 표준 건물', [['std-ed_univ-1f', '광장 · 학생식당'], ['std-ed_univ-2f', '강의실 · 강당'], ['std-ed_univ-3f', '도서관 · 기숙사']]),
  S('pb_agency', 'PB', 1, '공공기관 청사 표준 건물', [['std-pb_agency-1f', '민원실 · 구내식당'], ['std-pb_agency-2f', '사무실 · 회의실'], ['std-pb_agency-3f', '상황실 · 대강당']]),
  S('md_tertiary', 'MD', 0, '상급종합병원 표준 건물', [['std-md_tertiary-1f', '외래 · 진료'], ['std-md_tertiary-2f', '수술실 · 세미나실'], ['std-md_tertiary-3f', '입원 병동'], ['std-md_tertiary-4f', '식당 · 기계실']]),
];
export const stdPresetOf = (id) => STD_PRESETS.find((p) => p.id === id) || null;
