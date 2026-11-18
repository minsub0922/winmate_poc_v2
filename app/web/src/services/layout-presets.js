// 레이아웃 구성의 운영 값 — 관리자 「레이아웃 구성 관리」에서 바꾼 값(끄기 · 순서 · 기본 구성 · 이름 · 설명 · 맞는 상황 · 연결 샘플)을
// 앱이 시작할 때 받은 값(/api/bootstrap 의 layout_presets, app/api/layout_presets.py)으로 목차 템플릿 위에 덮는다.
// 이 모듈을 import 하면 한 번 적용된다 — 구성을 쓰는 화면(레이아웃 구성 · 목차 템플릿)이 구성을 읽기 전에 import 한다.
import { getBootstrap } from '../api/bootstrap.js';
import { applyTocPresets } from '../domain/templates/toc_templates.js';

let presets = null;
try { presets = getBootstrap().layout_presets || null; } catch { /* 앱 데이터 없이 도는 스크립트 — 코드 기본값 그대로 */ }
export const layoutPresets = applyTocPresets(presets); // { rev, fixed }
