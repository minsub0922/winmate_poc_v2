// 만든 파일을 브라우저 다운로드로 저장한다.

/** 파일 이름에 못 쓰는 글자를 빼고 80자로 자른다. */
export const safeName = (s) => String(s || 'Winmate 레이아웃').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/** @returns {Promise<{ok: true} | {err: string}>} */
export async function saveBlob(blob, filename) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
  } catch (e) {
    return { err: '이 화면에서는 파일을 저장할 수 없어요.' };
  }
}

