// Curate existing bundled photographs into a standalone background collection.
// Originals stay untouched; source paths and known original/page URLs remain in the manifest.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'app/web/package.json'));
const sharp = require('sharp');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'app/data/catalog.json'), 'utf8'));
const images = Object.values(JSON.parse(await fs.readFile(path.join(root, 'app/data/images.json'), 'utf8')).pids);
const choices = {
  FB: ['fb-cafe-bright', 'fb-lounge-ac', '카페 커피 메뉴보드 매장 외식 좌석 주문'],
  RT: ['rt-showroom-led', 'rt-fashion-store', '쇼룸 리테일 패션 브랜드 매장 고객 경험'],
  SV: ['sv-studycafe', 'sv-cu-store', '편의점 무인 매장 스터디 카페 학습 운영'],
  HT: ['ht-lobby', 'ht-room-tv', '호텔 리조트 로비 객실 투숙 숙박'],
  TP: ['tp-panda', 'tp-skywall', '테마파크 관광 전시 체험 몰입 전망대'],
  VN: ['vn-stadium-wide', 'vn-auditorium', '공연 경기장 영화관 관객 야구 스포츠 강당'],
  AD: ['ad-building-led', 'ad-subway', '옥외 광고 미디어 LED 도시 건물 지하철'],
  OF: ['of-meeting', 'of-lounge-wall', '오피스 사무 회의 업무 협업 빌딩 라운지'],
  RS: ['rs-living', 'rs-kitchen-dining', '주거 주택 아파트 분양 거실 주방 스마트홈'],
  ID: ['id-showroom-island', 'id-gallery-kitchen', '인테리어 가구 빌트인 키친 주방 전시장 디자인'],
  ED: ['ed-smart-lobby', 'ed-lecture-led', '교육 학교 대학 캠퍼스 강의실 도서관 학습'],
  PB: ['pb-control', 'pb-traffic-room', '공공 교통 인프라 관제 상황실 안전 모니터링'],
  MD: ['md-consent', 'md-care-room', '의료 병원 요양 케어 환자 병동 진료'],
  MF: ['mf-farm', 'mf-greenhouse', '제조 공장 물류 창고 현장 산업 온실 스마트팜'],
  FN: ['fn-branch', 'fn-counter', '금융 은행 지점 영업점 창구 상담 보안'],
  OE: ['oe-phone-user', 'oe-team-tabs', '파트너 전용 단말 에디션 모바일 스마트폰 태블릿 협업'],
};
const output = path.join(root, 'app/data/backgrounds');
await fs.mkdir(output, { recursive: true });
const result = [];
async function prepare(id, source, record) {
  const input = path.join(root, 'app/data/static', source);
  const file = id + '.webp', thumb = id + '-thumb.webp';
  const info = await sharp(input).rotate().resize({ width: 1600, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(output, file));
  await sharp(input).rotate().resize(320, 180, { fit: 'cover' }).webp({ quality: 76 }).toFile(path.join(output, thumb));
  result.push({ id, src: '/img/backgrounds/' + file, thumb: '/img/backgrounds/' + thumb,
    w: info.width, h: info.height, bytes: info.size, ...record, source: { file: source, ...record.source } });
}
for (const industry of catalog.industries) {
  const code = industry.code, plan = choices[code];
  if (!plan) throw new Error('Missing industry: ' + code);
  await prepare(code.toLowerCase() + '-overview', 'img/cover/' + code + '.jpg', {
    industry: code, title: industry.name + ' · 대표 공간', tags: plan[2].split(' '),
    parts: ['cover', 'closing', 'overview', 'value', 'customer'], source: { kind: 'existing-cover', note: '앱에 포함된 업종 표지 원본. 삼성 공식 사진으로 표기하지 않음.' },
  });
  for (const name of plan.slice(0, 2)) {
    const source = 'img/ph/' + name + '.jpg';
    const original = images.find(x => x.file === source);
    if (!original?.page || !original.orig) throw new Error('Missing source metadata: ' + source);
    await prepare(name, source, { industry: code, title: original.desc, tags: [...plan[2].split(' '), ...name.split('-').slice(1)],
      parts: ['scenario', 'case', 'customer', 'user', 'solution', 'challenge'],
      source: { kind: 'samsung', page: original.page, original: original.orig, note: '앱의 삼성 공식 이미지 원본 재사용' },
    });
  }
}
await prepare('general-overview', 'img/cover/GEN.jpg', { industry: null, title: '비즈니스 · 공통 배경', tags: ['비즈니스', '제안', '전략', '요약', '협업'], parts: ['cover', 'overview', 'closing', 'effect', 'execution'], source: { kind: 'existing-cover', note: '앱에 포함된 공통 표지 원본' } });
const manifest = { version: 1, industries: catalog.industries.map(({ code, name }) => ({ code, name })), images: result };
await fs.writeFile(path.join(root, 'app/web/src/domain/templates/backgrounds.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(output, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ images: result.length, industries: manifest.industries.length, counts: Object.fromEntries(manifest.industries.map(x => [x.code, result.filter(im => im.industry === x.code).length])), bytes: result.reduce((n, im) => n + im.bytes, 0) }, null, 2));
