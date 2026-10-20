// Hand-authored appendix mappings: retain every source sentence in distinct native layouts.
const splitCopy = (text, n) => {
  const words = String(text).split(/\s+/).filter(Boolean), chunks = Array(n).fill('');
  let at = 0;
  const target = Math.ceil(String(text).length / n);
  for (const word of words) {
    if (chunks[at].length >= target && at < n - 1) at++;
    chunks[at] += (chunks[at] ? ' ' : '') + word;
  }
  return chunks;
};
const IDS = ['L_PH_RQ_C', 'L_PH_IP_A', 'L_PH_OV_E', 'L_AX_D'];

export function reviewAppendixLayouts(proposal, sections) {
  const pool = [...new Map(proposal.parts.flatMap(s => s.layouts.flatMap(x => Object.values(x.ov?.img || {})))
    .filter(v => v?.src).map(v => [v.src, v])).values()];
  const images = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), structuredClone(pool[i % pool.length])]));
  return sections.map(([label, cards], section) => {
    const f = IDS[section], t = {};
    const common = (customer, footer, page) => {
      t[0] = '검토 예시 부록 · ' + label;
      t[1] = label;
      t[2] = '교육용 가정 · 실제 제출 전 검증 필요';
      t[customer] = proposal.customer;
      t[footer] = '가상 고객 · 작성 기준 2026.10.20 · 확정 견적·공식 실적이 아닙니다.';
      t[page] = '';
    };
    if (section === 0) {
      for (let i = 0; i < 42; i++) t[i] = '';
      common(39, 40, 41);
      Object.assign(t, { 3: '판단 주체', 4: '시범 운영에서 확인', 5: '관심·목표', 6: '판단 조건', 7: '확인할 내용' });
      cards.forEach(([heading, body], i) => {
        const base = [8, 15, 23, 31][i], [a, b, c] = splitCopy(body, 3);
        t[base] = String(i + 1).padStart(2, '0'); t[base + 1] = heading;
        const slots = [[11, 12, 13, 14], [19, 20, 21, 22], [27, 28, 29, 30], [35, 36, 37, 38]][i];
        [t[slots[0]], t[slots[1]], t[slots[2]], t[slots[3]]] = [a, b, c, '교육용 가정'];
      });
    } else if (section === 1) {
      for (let i = 0; i < 38; i++) t[i] = '';
      common(35, 36, 37);
      cards.forEach(([heading, body], i) => {
        const base = [7, 14, 21, 28][i], [a, b, c] = splitCopy(body, 3);
        t[3 + i] = ['계획', '준비', '대응', '인수'][i];
        t[base] = String(i + 1).padStart(2, '0'); t[base + 1] = heading; t[base + 2] = a;
        t[base + 3] = '범위·조건'; t[base + 4] = b; t[base + 5] = '확인 사항'; t[base + 6] = c;
      });
    } else if (section === 2) {
      for (let i = 0; i < 38; i++) t[i] = '';
      common(35, 36, 37); t[3] = '가정값 · 실사·견적 후 확정';
      cards.forEach(([heading, body], i) => {
        const base = [4, 12, 20, 28][i], [a, b] = splitCopy(body, 2);
        t[base] = String(i + 1); t[base + 1] = ['SCOPE', 'VALUE', 'PAYBACK', 'DECISION'][i];
        t[base + 2] = heading; t[base + 3] = a; t[base + 4] = b;
        t[base + 5] = '교육용 가정'; t[base + 6] = '실제 견적·실측 아님';
      });
    } else {
      for (let i = 0; i < 57; i++) t[i] = '';
      common(54, 55, 56);
      Object.assign(t, { 3: '고지·검증 항목', 4: '분류', 20: '고지·검증 항목', 21: '분류', 37: '고지·검증 항목', 38: '분류' });
      const rows = [5, 8, 11, 14, 17, 22, 25, 28, 31, 34, 39, 42];
      cards.forEach(([heading, body], i) => {
        const copy = splitCopy(body, 3);
        for (let j = 0; j < 3; j++) {
          const base = rows[i * 3 + j];
          t[base] = heading + ' ' + (j + 1) + '/3';
          t[base + 1] = ['가상 자료', '참고 자료', '목표·검증', '계약 시 확정'][i];
          t[base + 2] = copy[j];
        }
      });
    }
    return { f, status: 'done', ov: { t, img: section === 3 ? {} : images(4) } };
  });
}
