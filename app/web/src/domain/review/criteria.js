// Review criteria for Samsung B2B product / solution proposals.
// Each criterion: what to check (shown to the reviewer and to Claude), how important (w 1–3),
// and when it applies to a given proposal (x = profile from analyze.js).

export const CATS = [
  { id: 'CU', name: '고객 이해 · 맞춤', short: '고객', w: 18, hue: 'blue', icon: 'building', desc: '이 고객을 위한 제안서인가' },
  { id: 'MK', name: '시장 · 근거', short: '시장', w: 13, hue: 'violet', icon: 'chart', desc: '숫자와 시장 이야기를 믿을 수 있나' },
  { id: 'PR', name: '제품 · 솔루션', short: '제품', w: 18, hue: 'teal', icon: 'monitor', desc: '맞는 제품을 맞게 설명했나' },
  { id: 'VS', name: '가치 · 스토리', short: '가치', w: 19, hue: 'amber', icon: 'gem', desc: '왜 사야 하는지 흐름이 서나' },
  { id: 'DS', name: '디자인 · 가독성', short: '디자인', w: 16, hue: 'green', icon: 'eye', desc: '한눈에 읽히고 어색한 곳이 없나' },
  { id: 'WR', name: '표기 · 컴플라이언스', short: '표기', w: 10, hue: 'slate', icon: 'shield', desc: '내보내도 문제없는 표현인가' },
  { id: 'SB', name: '제출 준비', short: '제출', w: 6, hue: 'slate', icon: 'flag', desc: '파일 그대로 보내도 되나' },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

const always = () => [true, '모든 제안서'];
const slidesOnly = (x) => (x.slides ? [true, '장표형 문서'] : [false, '장표형 문서가 아니에요']);
const geom = (x) => (x.kind === 'pptx' || x.visual ? [true, x.visual ? '장표 화면을 함께 봐요' : '도형 위치 · 크기 정보로 점검'] : [false, '장표 화면 · 도형 정보가 없어요 (DOCX · TXT)']);
const hasProd = (x) => (x.products.length || x.models.length ? [true, `제품 ${x.products.length + x.unknownModels.length}종 언급`] : [false, '제품 · 모델명 언급이 없어요']);
const hasFig = (min) => (x) => (x.figures >= min ? [true, `수치 ${x.figures}개`] : [false, `수치가 ${x.figures}개뿐이에요`]);

export const CRITERIA = [
  // ---------------- 고객 이해 · 맞춤
  { id: 'CU1', cat: 'CU', name: '고객사 정보 정합성', w: 3, when: always,
    desc: '고객사명 · 업종 · 매장/객실/사업장 수 · 담당 조직이 장표 전체에서 일치하는지, 다른 고객사명이나 템플릿 예시 고객명이 섞여 있지 않은지',
    check: '고객사명 표기 변형, 이전 제안서에서 온 다른 고객명, 같은 고객 정보(규모 · 지점 수 등)가 장마다 다른 값인지 확인' },
  { id: 'CU2', cat: 'CU', name: '고객 요구사항 반영도', w: 3, when: (x) => (x.linkedReq ? [true, '비교할 고객 요구사항이 연결됨'] : x.rfpLike ? [true, '본문에 요구사항 · RFP 언급'] : [false, '비교할 고객 요구사항이 없어요 (다시 평가에서 제안서를 연결하면 적용)']),
    desc: 'RFP · 키맨 요구사항 하나하나가 어느 장에서 어떻게 대응되는지 추적되는지',
    check: '제공된 고객 요구사항 목록 각각에 대응하는 장이 있는지, 빠진 요구가 무엇인지 구체적으로' },
  { id: 'CU3', cat: 'CU', name: '의사결정자 관점', w: 2, when: always,
    desc: '대표 · 본부장 · 구매 · 시설 등 결정권자가 신경 쓰는 성과 · 리스크 · 예산 언어로 말하는지',
    check: '경영 지표(매출 · 비용 · 리스크)와 실무 지표가 구분돼 있는지, 결정권자에게 필요한 요약이 있는지' },
  { id: 'CU4', cat: 'CU', name: '고객 과제 구체성', w: 2, when: always,
    desc: '고객이 지금 겪는 문제를 현장 언어와 수치로 구체화했는지, 업계 일반론에 머물지 않는지',
    check: '문제 · 원인 · 영향(비용 · 시간)이 이 고객 기준으로 쓰였는지' },
  { id: 'CU5', cat: 'CU', name: '고객 맞춤화 수준', w: 2, when: always,
    desc: '고객사명만 바꾼 범용 장표가 아닌지 — 고객 고유의 공간 · 운영 · 브랜드 · 일정이 반영됐는지',
    check: '고객 고유 정보가 들어간 장의 비율, 다른 고객에게 그대로 써도 되는 장이 얼마나 되는지' },
  { id: 'CU6', cat: 'CU', name: '업종 이해도', w: 2, when: (x) => (x.ind ? [true, '업종: ' + x.indName] : [false, '업종을 특정하지 못했어요']),
    desc: '업종 특유의 운영 방식 · 규제 · 피크 시간 · 고객 동선을 이해하고 반영했는지',
    check: '업종 용어와 운영 맥락이 정확한지, 업종과 맞지 않는 사례 · 제품이 섞여 있지 않은지' },

  // ---------------- 시장 · 근거
  { id: 'MK1', cat: 'MK', name: '시장 조사 정합성', w: 3, when: (x) => (x.marketUnits || x.figures >= 4 ? [true, x.marketUnits ? `시장 관련 ${x.marketUnits}장` : `수치 ${x.figures}개`] : [false, '시장 분석 내용이 없어요']),
    desc: '시장 규모 · 성장률 · 점유율이 서로 모순 없고 계산이 맞는지, 고객의 업종 · 지역 시장과 맞는지',
    check: '합계 · 비율 · CAGR 계산 검산, 글로벌 수치를 국내 시장처럼 쓰지 않았는지, 시장 정의가 고객 사업과 맞는지' },
  { id: 'MK2', cat: 'MK', name: '데이터 최신성', w: 2, when: (x) => (x.years.length ? [true, `연도 언급 ${x.years.length}개`] : x.figures >= 4 ? [true, '수치는 있으나 기준 연도가 없어요'] : [false, '인용 데이터가 없어요']),
    desc: '인용한 통계 · 조사의 기준 연도가 최근 2년 이내인지, 기준 연도가 빠져 있지 않은지',
    check: '오래된 연도 데이터, 기준 연도 없는 수치, 이미 지난 예측치를 미래처럼 쓴 곳' },
  { id: 'MK3', cat: 'MK', name: '출처 표기', w: 2, when: hasFig(3),
    desc: '시장 수치 · 인용 · 성과 수치마다 기관과 연도가 붙어 있는지',
    check: '출처 없는 수치가 있는 장, "[조사 기관, 연도]" 같은 자리표시가 남은 출처' },
  { id: 'MK4', cat: 'MK', name: '수치 일관성', w: 2, when: hasFig(3),
    desc: '같은 지표(매장 수 · 절감률 · 수량 등)가 장표마다 다른 값으로 나오지 않는지',
    check: '같은 대상의 수치가 장마다 다른지, 요약과 본문의 숫자가 맞는지' },
  { id: 'MK5', cat: 'MK', name: '경쟁 비교 공정성', w: 1, when: (x) => (x.competitors.length || x.compUnits ? [true, x.competitors.length ? '경쟁사 언급: ' + x.competitors.slice(0, 3).join(', ') : '경쟁 비교 장 있음'] : [false, '경쟁 비교 내용이 없어요']),
    desc: '경쟁사 비교가 공개 근거와 명시된 기준으로 되어 있고 비방 · 추측이 없는지',
    check: '확인 안 된 경쟁사 사양 · 가격, 비교 기준 누락, 공격적 표현' },
  { id: 'MK6', cat: 'MK', name: '분석 → 시사점 연결', w: 1, when: (x) => (x.marketUnits ? [true, '시장 · 분석 장 있음'] : [false, '분석 장이 없어요']),
    desc: '시장 · 고객 분석이 "그래서 이 고객에게 무엇을 제안하는가"로 이어지는지',
    check: '분석 장 뒤에 시사점 · 제안 방향이 있는지, 분석이 제안과 따로 노는지' },

  // ---------------- 제품 · 솔루션
  { id: 'PR1', cat: 'PR', name: '제품 최신성', w: 3, when: hasProd,
    desc: '현재 판매 라인업 기준인지 — 구형 · 단종 모델, 이전 세대 명칭, 지난 연식 표기가 남아 있지 않은지',
    check: '모델명 연식 코드, 카탈로그에 없는 모델, 신제품이 있는데 이전 세대를 제안한 곳. 확실하지 않으면 "확인 필요"로' },
  { id: 'PR2', cat: 'PR', name: '제품 사양 정확성', w: 3, when: hasProd,
    desc: '크기 · 밝기 · 해상도 · 운영 시간 · 방수등급 · 인증 같은 사양이 공식 사양과 맞는지',
    check: '참고 카탈로그 사양과 다른 수치, 한 제안서 안에서 같은 모델의 사양이 다른 곳' },
  { id: 'PR3', cat: 'PR', name: '공간 · 용도 적합성', w: 2, when: hasProd,
    desc: '제품이 놓일 공간 · 환경(옥외 직사광, 24시간 운영, 위생 · 방진, 터치 필요 등)에 맞는지',
    check: '옥외에 실내형, 24/7 환경에 16/7 제품, 공간 크기에 비해 과하거나 부족한 구성' },
  { id: 'PR4', cat: 'PR', name: '솔루션 · 서비스 연계', w: 2, when: (x) => (x.products.length || x.solutions.length ? [true, x.solutions.length ? '솔루션: ' + x.solutions.slice(0, 3).join(', ') : '제품만 있음'] : [false, '제품 · 솔루션 언급이 없어요']),
    desc: '하드웨어가 운영 솔루션(MagicINFO · VXT · SmartThings Pro · Knox · b.IoT 등)과 서비스로 이어져 실제 운영 장면까지 그려지는지',
    check: '하드웨어만 나열하고 운영 · 관리 방식이 비어 있는지, 솔루션 이름만 있고 역할이 없는지' },
  { id: 'PR5', cat: 'PR', name: '제품명 · 모델명 표기 일관성', w: 1, when: hasProd,
    desc: '같은 제품을 다른 이름 · 모델 표기로 섞어 쓰지 않는지',
    check: 'QM55C / QM-55C / 55" QMC 같은 혼용, 마케팅명과 모델명 혼동' },
  { id: 'PR6', cat: 'PR', name: '구성 · 수량 명확성', w: 2, when: hasProd,
    desc: '공간별 모델 · 수량 · 설치 방식이 명확하고 합계가 맞는지',
    check: '수량 누락, 공간별 합과 총계 불일치, 옵션 · 액세서리(브래킷 · 플레이어 · 라이선스) 누락' },
  { id: 'PR7', cat: 'PR', name: '설치 · 운영 조건', w: 1, when: hasProd,
    desc: '전원 · 네트워크 · 시공 · 유지보수 · 보증 조건 같은 도입 전제를 밝혔는지',
    check: '설치 환경 전제, 고객이 준비할 것, 유지보수 · 보증 범위' },

  // ---------------- 가치 · 스토리
  { id: 'VS1', cat: 'VS', name: '가치 제안 명확성', w: 3, when: always,
    desc: '고객이 얻는 가치가 2~4개로 선명한지 — 제품 기능 나열이 아니라 고객 언어의 결과인지',
    check: '가치 문장이 기능 설명인지 결과인지, 가치와 그것을 만드는 제품 · 솔루션이 연결되는지' },
  { id: 'VS2', cat: 'VS', name: '기대효과 정량화', w: 3, when: always,
    desc: '절감액 · 시간 · 매출 · KPI 전후 등 정량 효과와 그 산정 근거 · 전제가 있는지',
    check: '정량 효과 유무, 산정 전제, 근거 없는 큰 숫자' },
  { id: 'VS3', cat: 'VS', name: '스토리 흐름', w: 2, when: (x) => (x.units >= 5 ? [true, `${x.units}${x.unitLabel} 흐름`] : [false, '분량이 짧아 흐름 평가 제외']),
    desc: '현황 이해 → 과제 → 가치 → 해결(공간 · 제품) → 증명(사례) → 실행 순서가 자연스러운지',
    check: '파트 순서가 뒤엉킨 곳, 근거보다 결론이 먼저 와서 설득이 약한 곳, 갑자기 끊기는 전환' },
  { id: 'VS4', cat: 'VS', name: 'Why Samsung 차별성', w: 2, when: always,
    desc: '삼성만의 강점(라인업 폭 · 통합 솔루션 · Knox 보안 · 전국 서비스망 · 레퍼런스)을 근거와 함께 말하는지',
    check: '차별점이 "최고 품질" 같은 일반론인지, 고객 과제와 연결된 강점인지' },
  { id: 'VS5', cat: 'VS', name: '도입 사례 근거', w: 2, when: always,
    desc: '같거나 비슷한 업종의 도입 사례와 성과 수치로 증명하는지',
    check: '사례 유무, 업종 적합성, 성과 수치, 사례 고객 공개 가능 여부' },
  { id: 'VS6', cat: 'VS', name: '실행 계획 구체성', w: 2, when: always,
    desc: '일정 · 단계(파일럿 → 확산) · 추진 체계 · 교육 · 유지보수가 구체적인지',
    check: '날짜 · 기간, 단계별 범위, 역할 분담, 운영 이관' },
  { id: 'VS7', cat: 'VS', name: '비용 · TCO 투명성', w: 1, when: (x) => (x.costUnits || x.units >= 8 ? [true, x.costUnits ? '비용 관련 장 있음' : '본 제안 분량'] : [false, '짧은 소개 자료']),
    desc: '구매 방식 · 총소유비용 · 투자 회수를 이해할 수 있게 보여주는지 (가격 공개 범위는 영업 판단)',
    check: '비용 구조 설명, TCO · 회수 기간, 숨은 비용(콘텐츠 · 라이선스 · 유지보수)' },
  { id: 'VS8', cat: 'VS', name: '리스크 · 대응 방안', w: 1, when: (x) => (x.units >= 8 ? [true, '본 제안 분량'] : [false, '짧은 소개 자료']),
    desc: '공사 중 영업 · 호환성 · 일정 지연 · 운영 인력 같은 도입 리스크와 대응을 다루는지',
    check: '고객이 걱정할 리스크를 먼저 짚었는지' },
  { id: 'VS9', cat: 'VS', name: '핵심 메시지 일관성', w: 2, when: always,
    desc: '표지 · 요약 · 결론이 같은 핵심 메시지를 말하고, 장마다 다른 약속을 하지 않는지',
    check: '제안 핵심 한 줄이 처음과 끝에서 같은지, 중간에 다른 메시지가 끼어드는지' },
  { id: 'VS10', cat: 'VS', name: '결정 요청 · 다음 단계', w: 1, when: always,
    desc: '마지막에 고객이 할 결정과 다음 단계(일정 · 담당자)가 분명한지',
    check: '마무리 장의 결정 요청, 다음 미팅 · 파일럿 · 견적 일정' },

  // ---------------- 디자인 · 가독성
  { id: 'DS1', cat: 'DS', name: '레이아웃 어색함', w: 3, when: geom, visual: true,
    desc: '요소 겹침 · 장표 밖으로 나간 요소 · 글자 넘침 · 자동 축소 · 어긋난 정렬 · 장마다 다른 제목 위치',
    check: '자동 점검의 겹침 · 넘침 · 정렬 신호와 화면에서 보이는 어색한 배치' },
  { id: 'DS2', cat: 'DS', name: '직시성', w: 3, when: (x) => (x.slides ? [true, '장표형 문서'] : [true, '문서형 — 소제목 · 요약 기준으로 평가']), visual: true,
    desc: '한 장 한 메시지, 3초 안에 핵심이 보이는지 — 헤드라인 · 강조 · 시선 흐름',
    check: '장마다 핵심이 한눈에 들어오는지, 강조가 너무 많거나 없는지, 시선 흐름이 꼬이는 곳' },
  { id: 'DS3', cat: 'DS', name: '텍스트 밀도', w: 2, when: always,
    desc: '한 장에 글이 너무 많지 않은지 — 문단형 장표, 개조식이 길게 이어지는 장',
    check: '어절 수가 많은 장, 발표 자료로 읽히지 않는 장' },
  { id: 'DS4', cat: 'DS', name: '글자 크기 가독성', w: 2, when: (x) => (x.kind === 'pptx' || x.kind === 'pdf' ? [true, '글자 크기 정보 있음'] : [false, '글자 크기 정보가 없어요']),
    desc: '본문이 12pt 미만이거나 표 · 각주가 읽기 어렵게 작은 곳이 없는지',
    check: '작은 글자가 몰린 장, 화면 · 인쇄로 읽기 어려운 크기' },
  { id: 'DS5', cat: 'DS', name: '폰트 · 스타일 일관성', w: 1, when: (x) => (x.fontCount ? [true, `폰트 ${x.fontCount}종`] : [false, '폰트 정보가 없어요']),
    desc: '폰트 종류가 2~3개 이내이고 크기 · 굵기 체계가 장마다 같은지',
    check: '불필요한 폰트 혼용, 장마다 다른 제목 크기' },
  { id: 'DS6', cat: 'DS', name: '시각 자료 활용', w: 2, when: slidesOnly, visual: true,
    desc: '도식 · 사진 · 차트로 보여줄 내용을 글로만 쓰지 않았는지, 이미지가 내용과 맞는지',
    check: '텍스트만 있는 장의 비율, 제품 · 공간 장에 실제 이미지가 있는지, 의미 없는 장식 이미지' },
  { id: 'DS7', cat: 'DS', name: '헤드라인 메시지화', w: 2, when: slidesOnly,
    desc: '제목이 "시장 현황" 같은 라벨이 아니라 결론을 말하는 문장인지',
    check: '라벨형 제목 비율, 제목만 읽어도 스토리가 이어지는지' },
  { id: 'DS8', cat: 'DS', name: '차트 · 표 정확성', w: 1, when: (x) => (x.charts || x.tables || x.figures >= 8 ? [true, `차트 ${x.charts} · 표 ${x.tables}`] : [false, '차트 · 표가 거의 없어요']), visual: true,
    desc: '축 · 단위 · 범례 · 합계가 맞고 표가 읽기 쉬운지',
    check: '단위 누락, 축 왜곡, 합계 불일치, 지나치게 빽빽한 표' },
  { id: 'DS9', cat: 'DS', name: '분량 적정성', w: 1, when: always,
    desc: '장표 수가 제안 범위와 발표 시간에 맞는지 — 너무 얇거나 부록 없이 지나치게 긴지',
    check: '본문 · 부록 구분, 중복 장표' },
  { id: 'DS10', cat: 'DS', name: '디자인 톤 일관성', w: 1, when: (x) => (x.visual ? [true, '장표 화면을 함께 봐요'] : x.kind === 'pptx' ? [true, '색 · 폰트 정보로 점검'] : [false, '장표 화면이 없어요']), visual: true,
    desc: '색 · 아이콘 · 로고 위치 · 여백이 장표 전체에서 통일되고 삼성 B2B 톤과 맞는지',
    check: '색 수, 다른 템플릿에서 가져온 장, 로고 · 페이지 요소 위치' },

  // ---------------- 표기 · 컴플라이언스
  { id: 'WR1', cat: 'WR', name: '템플릿 잔여물 · 자리표시', w: 3, when: always,
    desc: '[00] · OOO · XX · "텍스트를 입력하세요" · 예시 고객명 · 이전 고객명이 남아 있지 않은지',
    check: '자동 점검에서 찾은 자리표시를 확인하고, 문맥상 템플릿 문구로 보이는 것' },
  { id: 'WR2', cat: 'WR', name: '맞춤법 · 띄어쓰기', w: 1, when: always,
    desc: '오탈자 · 띄어쓰기 · 문장 부호 · 외래어 표기',
    check: '틀린 곳을 장 번호와 함께 몇 개만 예시로' },
  { id: 'WR3', cat: 'WR', name: '브랜드 · 상표 표기', w: 2, when: (x) => (x.brandTerms.length ? [true, '브랜드 표기 ' + x.brandTerms.slice(0, 3).join(', ')] : [false, '삼성 브랜드 · 솔루션 표기가 없어요']),
    desc: 'MagicINFO · SmartThings · The Wall · Samsung VXT · Knox · Galaxy 등 공식 표기와 "삼성전자" 표기 통일',
    check: '대소문자 · 띄어쓰기 틀린 브랜드명, 혼용' },
  { id: 'WR4', cat: 'WR', name: '단위 · 숫자 표기', w: 1, when: hasFig(3),
    desc: '인치(″) · nit · ㎡ · 원/억 · 천 단위 구분 · 소수점 자리 표기가 일관된지',
    check: '같은 단위의 다른 표기, 단위 누락' },
  { id: 'WR5', cat: 'WR', name: '과장 · 보증성 표현', w: 2, when: always,
    desc: '"최초 · 최고 · 유일 · 100% 보장 · 무조건" 같은 근거 없는 절대 표현이 없는지',
    check: '절대 표현마다 근거 · 출처가 있는지, 성과를 보증하는 문장' },
  { id: 'WR6', cat: 'WR', name: '기밀 · 내부 정보 노출', w: 3, when: always,
    desc: '원가 · 마진 · 내부 할인율 · 사내 코드명 · 다른 고객 정보 · 개인정보가 고객용 문서에 남아 있지 않은지',
    check: '내부용 표현, 다른 고객의 비공개 정보, 담당자 개인정보' },
  { id: 'WR7', cat: 'WR', name: '법적 고지 · 전제 조건', w: 1, when: (x) => (x.products.length || x.figures >= 3 || x.pics ? [true, '사양 · 효과 수치 · 이미지 있음'] : [false, '고지할 내용이 없어요']),
    desc: '"이미지는 연출된 화면" · "사양은 변경될 수 있음" · 효과 수치의 전제 조건이 있는지',
    check: '연출 이미지 · 예상 효과에 고지가 있는지' },
  { id: 'WR8', cat: 'WR', name: '약어 · 용어 정의', w: 1, when: (x) => (x.abbrs.length >= 3 ? [true, '약어 ' + x.abbrs.slice(0, 4).join(', ')] : [false, '약어가 적어요']),
    desc: 'TCO · DID · LFD · BEMS 같은 약어를 처음 쓸 때 풀어 썼는지',
    check: '고객이 모를 수 있는 약어 · 사내 용어' },
  { id: 'WR9', cat: 'WR', name: '문체 · 톤 일관성', w: 1, when: always,
    desc: '경어체 · 개조식 · 명사형 종결이 섞이지 않고 고객 존중 톤인지',
    check: '문체 혼용, 고객을 가르치는 듯한 표현' },

  // ---------------- 제출 준비
  { id: 'SB1', cat: 'SB', name: '표지 · 목차 · 마무리', w: 1, when: slidesOnly,
    desc: '표지(고객사 · 제안명 · 날짜 · 제안사), 목차, 마무리(연락처 · 다음 단계)가 있는지',
    check: '빠진 구성 요소' },
  { id: 'SB2', cat: 'SB', name: '쪽번호 · 푸터', w: 1, when: (x) => (x.slides && x.units >= 5 ? [true, '5장 이상 장표'] : [false, '짧은 문서']),
    desc: '쪽번호 · 제안명 푸터 · 기밀 표기가 모든 장에 일관되게 있는지',
    check: '쪽번호 누락 장, 푸터에 다른 프로젝트명' },
  { id: 'SB3', cat: 'SB', name: '노트 · 숨김 장표 · 댓글 정리', w: 2, when: (x) => (x.kind === 'pptx' || x.kind === 'docx' ? [true, '원본 파일'] : [false, 'PDF는 노트 · 댓글 정보가 없어요']),
    desc: '발표자 노트의 내부 메모, 숨김 슬라이드, 남은 검토 댓글을 정리했는지',
    check: '노트에 내부 메모 · 가격 · 다른 고객 정보, 숨김 장, 댓글 수' },
  { id: 'SB4', cat: 'SB', name: '파일 속성 정리', w: 1, when: (x) => (x.metaAvail ? [true, '파일 속성 있음'] : [false, '파일 속성이 없어요']),
    desc: '문서 제목 · 작성자 · 템플릿 이름에 이전 고객명이나 내부 정보가 남지 않았는지',
    check: '파일 속성 값 확인' },
  { id: 'SB5', cat: 'SB', name: '날짜 · 버전 표기', w: 1, when: always,
    desc: '제출일 · 버전이 최신이고 표지와 본문 일정이 서로 맞는지',
    check: '지난 날짜, 표지와 일정표의 날짜 불일치' },
  { id: 'SB6', cat: 'SB', name: 'RFP 형식 준수', w: 2, when: (x) => (x.rfpFormat ? [true, 'RFP 형식 요구 있음'] : [false, 'RFP 형식 요구가 연결되지 않았어요']),
    desc: 'RFP가 요구한 목차 · 분량 · 필수 항목 · 제출 형식을 지켰는지',
    check: '요구 목차와 실제 목차 대조, 필수 항목 누락' },
];
export const CR = Object.fromEntries(CRITERIA.map((c) => [c.id, c]));

export function band(s) {
  if (s == null) return { k: 'na', label: '제외' };
  if (s >= 85) return { k: 'ok', label: '우수' };
  if (s >= 70) return { k: 'good', label: '양호' };
  if (s >= 50) return { k: 'warn', label: '보완' };
  return { k: 'bad', label: '미흡' };
}
export function verdictOf(s) {
  if (s >= 85) return '제출 가능';
  if (s >= 70) return '소폭 보완 후 제출';
  if (s >= 50) return '보완 필요';
  return '재작성 권장';
}
