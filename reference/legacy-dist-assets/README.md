# 구버전 배포 폴더의 고유 이미지

2026-10-20 루트 구버전 `dist/`를 정리할 때, 대응하는 원천 `img/` 및 기존 `reference/live/`, `reference/source-build/dist/`, `reference/source-build-latest/dist/` 파일과 SHA-256이 다른 이미지 168개(23,620,106 bytes)를 이곳으로 복사했다. 이미지의 원래 상대 경로와 바이트를 보존했다.

현재 앱은 이 폴더를 서비스하지 않는다. 수집·가공 이미지의 이전 변형을 참고할 때 사용한다. 원래 경로·새 경로·SHA-256은 `docs/migration/evidence/cleanup-20261020.json`의 `preserved_dist_assets`에 기록했다. 기존 참고 사본은 변경하지 않았다.
