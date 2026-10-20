// Authored logical units for flat/mixed layouts. Counts come from surviving DOM slots, never pc.
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const text = (title, from, to, images = []) => ({ title: String(title), textSlots: range(from, to), imageSlots: images.map(String) });

export const LAYOUT_REPEATS = {
  L_VC_32: [{ id: 'spaces', unit: 'card', label: '공간', items: [text(6,5,6,[0]),text(9,8,9,[1]),text(12,11,12,[2])].map((item, i) => ({ ...item, textSlots: [...item.textSlots, ...range(19 + i * 4, 22 + i * 4), ...range(34 + i * 3, 36 + i * 3)] })) }],
  L_VC_42: [{ id: 'spaces', unit: 'card', label: '공간', items: [text(6,5,16,[0]),text(19,18,29,[1]),text(32,31,42,[2]),text(45,43,55)] }],
  L_AIS_02: [{ id: 'chapters', unit: 'card', label: '사진 카드', items: Array.from({ length: 6 }, (_, i) => text(4 + i * 5, 3 + i * 5, 7 + i * 5, [i])) }],
  L_PH_CP_R: [{ id: 'cases', unit: 'card', label: '사례 카드', items: [text(12,11,23,[0]),text(25,24,36,[1]),text(38,37,49,[2])] }],
  L_PH_CH_I: [{ id: 'tasks', unit: 'card', label: '과제 행', items: [text(8,8,15,[0]),text(16,16,23,[1]),text(24,24,31,[2]),text(32,32,39,[3])] }],
  L_PH_SO_B: [{ id: 'scenarios', unit: 'card', label: '시나리오 행', items: [text(6,6,12,[0,1]),text(13,13,19,[2,3]),text(20,20,26,[4,5])] }],
  L_AIS_11: [{ id: 'spaces', unit: 'card', label: '공간', items: [text(4, 3, 4, [0]), text(6, 5, 6, [1]), text(8, 7, 8, [2]), text(10, 9, 10, [3]), text(12, 11, 12, [4]), text(14, 13, 14, [5])].map((item, i) => ({ ...item, textSlots: [...item.textSlots, ...[range(16,19),range(20,22),range(23,28),range(29,31),range(32,34),range(35,37)][i]] })) }],
  L_PH_AIS_25: [
    { id: 'data', unit: 'card', label: '데이터 카드', items: [text(12,11,13),text(15,14,19),text(21,20,26),text(28,27,33)] },
    { id: 'flow', unit: 'card', label: '처리 단계', items: [text(3,3,4,[0]),text(5,5,8),text(9,9,10,[1])] },
  ],
  L_AIS_27: [{ id: 'services', unit: 'card', label: '서비스 카드', items: [text(4,3,5),text(7,6,8),text(10,9,11),text(13,12,14)] }],
  L_AIS_33: [{ id: 'teams', unit: 'card', label: '조직 카드', items: [text(3,3,9,[0]),text(11,11,17,[1]),text(19,19,26,[2])] }],
  L_PH_AIS_35: [{ id: 'steps', unit: 'card', label: '단계', items: [text(3,3,8,[0]),text(9,9,16,[1]),text(17,17,22,[2]),text(23,23,28,[3])] }],
  L_SOL_07: [{ id: 'products', unit: 'product', label: '제품', items: [text(4,4,5),text(6,6,7),text(8,8,9,[2])] }],
  L_SOL_08: [{ id: 'products', unit: 'product', label: '제품', items: [text(3,3,4),text(5,5,6),text(7,7,8),text(9,9,10)] }],
  L_SOL_09: [{ id: 'products', unit: 'product', label: '제품', items: [text(4,4,5),text(6,6,7),text(8,8,9),text(10,10,11),text(12,12,13),text(14,14,15)] }],
};
