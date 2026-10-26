// 건물 조감도 탭 진입점 — 앱 번들의 경로 'building'이 이 모듈을 붙인다
// viewer = 「HTML 추출」로 내보낸 파일이 여는 보기 전용 화면
import { mount } from './ui.js';
import { data, ready } from './data.js';
import { thumbnail } from './render.js';
import { viewer } from './viewer.js';
import { FACADES } from './facade.js';
import { PRESETS } from './presets.js';

export { mount, data, ready, thumbnail, viewer, FACADES, PRESETS };
