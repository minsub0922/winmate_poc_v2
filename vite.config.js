import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 빌드 결과(dist/)를 어느 경로에 올려도 동작하도록 상대 경로로 만든다.
  // 레이아웃 HTML의 이미지도 "img/…" 상대 경로라 public/img가 dist/img로 그대로 복사된다.
  base: './',
  // src/data/layouts/*.html 은 페이지가 아니라 ?raw 로 읽는 데이터 — 의존성 스캔은 index.html만 본다.
  optimizeDeps: { entries: ['index.html'] },
  server: { port: 5173, open: false },
  build: {
    // 레이아웃 HTML 446장(약 9MB)은 별도 청크 하나로 묶여 첫 화면에서 한 번 받는다.
    chunkSizeWarningLimit: 12000,
  },
});
