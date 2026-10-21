from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1]
HOME = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('WINMATE_ADMIN_DATA', HOME / 'runtime')).resolve()
RUNTIME.mkdir(parents=True, exist_ok=True)
ADMIN_WEB = Path(os.environ.get('WINMATE_ADMIN_WEB_DIST', HOME / 'web/dist')).resolve()
MAX_UPLOAD = 25 * 1024 * 1024
MAX_TEXT = 350_000

SOURCE_SEEDS = [
    ('samsung', 'Samsung Business', '삼성 B2B 제품 · 옵션 · 사양 · 특장점', 'https://www.samsung.com/sec/business/', 'samsung', 7),
    ('catalogs', 'e-Catalog', '삼성 전자 카탈로그 · 제품 가이드 · 업종 제안', 'https://samsung.aiibook.net/b2b/', 'catalogs', 14),
    ('media', '솔루션 & 도입사례', '공식 솔루션 · 고객 사례 · 업종별 자료', 'https://www.samsung.com/sec/business/insights/', 'media', 14),
    ('images', '이미지 라이브러리', '제품 사진 · 설치 장면 · 배경 · 이미지 묶음', '', 'local', 30),
    ('templates', '제안서 라이브러리', '레이아웃 · Best Scenario · 평가 기준 · 페르소나', '', 'local', 30),
    ('spatial', '공간 라이브러리', '3D 오브젝트 · 공간 배치 · 제품 치수', '', 'local', 30),
    ('uploads', '직접 추가한 자료', '문서 · 이미지 · URL에서 추가한 데이터', '', 'custom', 30),
]
