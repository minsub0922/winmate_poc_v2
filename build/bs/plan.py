# Best Scenario 사진 중심 전환 계획 — 장마다 (원래 레이아웃 → 바꿀 레이아웃)
# 기본: 라이브러리에서 이미 사진 버전으로 대체한 장(RETIRED)은 그 사진 버전으로. 그 밖은 아래 MANUAL.
# None = 바꾸지 않음(표 · 도면 · 구성도처럼 글 · 그림이 본질이거나 이미 사진이 충분한 장)
import json, sys
A = json.load(open('build/bs/audit0.json'))
NEW = {'L_PH_SD_G', 'L_PH_QA_A', 'L_PH_AIS_08', 'L_PH_AIS_25', 'L_PH_AIS_26', 'L_PH_AIS_35'}  # 이번에 새로 만드는 레이아웃
MANUAL = {
  # (시나리오, 장 번호): 새 레이아웃
  ('bs01', 13): 'L_PH_PL_B',
  ('bs02', 1): 'L_C10', ('bs02', 13): 'L_PH_IP_B',
  ('bs03', 11): 'L_PH_IP_C', ('bs03', 12): 'L_PH_TO_A',
  ('bs04', 7): 'L_PH_P_R',
  ('bs05', 10): 'L_PH_SD_G',
  ('bs06', 11): 'L_PH_IP_C',
  ('bs07', 10): 'L_PH_IP_C',
  ('bs08', 0): 'L_C01', ('bs08', 11): 'L_PH_MT_B',
  ('bs09', 10): 'L_PH_IP_C',
  ('bs10', 0): 'L_C02', ('bs10', 4): 'L_PH_CP_G', ('bs10', 6): 'L_PH_CP_W', ('bs10', 7): 'L_PH_CP_T', ('bs10', 8): 'L_PH_CP_C',
  ('bs11', 0): 'L_C01', ('bs11', 1): 'L_C10', ('bs11', 3): 'L_PH_RQ_B', ('bs11', 4): 'L_PH_RQ_A', ('bs11', 8): 'L_PH_SE_A', ('bs11', 9): 'L_PH_OG_A',
  ('bs11', 11): 'L_PH_TO_A', ('bs11', 12): 'L_PH_MT_A', ('bs11', 13): 'L_PH_QA_A', ('bs11', 14): 'L_PH_C13',
  ('bs12', 5): 'L_PH_P_K', ('bs12', 6): 'L_PH_SD_G', ('bs12', 7): 'L_PH_CP_X',
  ('bs13', 0): 'L_C08', ('bs13', 11): 'L_PH_CO_A', ('bs13', 12): 'L_PH_PL_B',
  ('bs14', 8): 'L_PH_US_H', ('bs14', 10): 'L_PH_IG_B', ('bs14', 13): 'L_PH_PL_B',
  ('bs15', 0): 'L_C02', ('bs15', 9): 'L_PH_MT_A',
  ('bs16', 0): 'L_C08', ('bs16', 9): 'L_PH_CO_A', ('bs16', 10): 'L_PH_CO_B', ('bs16', 11): 'L_PH_TO_B',
  ('bs17', 7): 'L_PH_SE_A', ('bs17', 8): 'L_PH_SE_C', ('bs17', 10): 'L_PH_CB_E', ('bs17', 11): 'L_PH_TO_B',
  ('bs18', 7): 'L_PH_CU_A', ('bs18', 8): 'L_PH_SE_C', ('bs18', 9): 'L_PH_CU_B',
  ('bs19', 0): 'L_C02',
  ('bs20', 6): 'L_PH_SD_G', ('bs20', 10): 'L_PH_EF_P', ('bs20', 11): 'L_PH_CO_A',
  ('bs21', 7): 'L_PH_AIS_08', ('bs21', 24): 'L_PH_AIS_25', ('bs21', 34): 'L_PH_AIS_35',
}
# 텍스트 장이 아니어도 사진 비율이 낮고 업종 사진 버전이 있는 장 — 사진 버전으로
TWIN_SWAP = {'L_VP_U_HT': 'L_PH_VP_U', 'L_VP_U_MD': 'L_PH_VP_U'}
for ind in ['OF', 'ED', 'RS', 'RT', 'HT', 'MD', 'PB', 'FB', 'SV', 'MF']: TWIN_SWAP[f'L_SS_{ind}_B'] = f'L_PH_SS_{ind}_B'
KEEP = {  # 바꾸지 않는 장과 이유
  'L_BIT_D': '구성도 — 설비 · 게이트웨이 · 화면 연결이 본질', 'L_MGI_D': '구성도', 'L_VXT_D': '구성도',
  'L_SD_F': '매립 치수 도면 · 표', 'L_SD_E': '단말 사양표(제품 컷 있음)', 'L_SE_B': '인증 · 규격 매트릭스(제품 컷 있음)', 'L_SC_B': 'RFP 요구사항 대응표',
  'L_AIS_04': 'Device · Solution · Service 도식(제품 컷 있음)', 'L_AIS_36': '브랜드 가치 수치 · 막대',
}
plan = {}
for a in A:
    sid, k, f = a['id'], a['k'], a['f']
    nf = MANUAL.get((sid, k)) or TWIN_SWAP.get(f) or a['retired']
    why = 'manual' if (sid, k) in MANUAL else 'twin' if f in TWIN_SWAP else 'retired' if a['retired'] else ''
    plan.setdefault(sid, []).append({'k': k, 'f': f, 'to': nf, 'why': why, 'role': a['role'], 'pf': a['pfReal'], 'keep': KEEP.get(f, '')})
json.dump(plan, open('build/bs/plan.json', 'w'), ensure_ascii=False, indent=1)
if __name__ == '__main__':
    n = sum(1 for v in plan.values() for x in v if x['to'])
    print('slides', sum(len(v) for v in plan.values()), 'to change', n)
    for sid, v in plan.items():
        for x in v:
            if x['to'] or (x['pf'] < 0.15 and not x['to']):
                print(sid, x['k'], x['f'], '→', x['to'] or 'KEEP', '|', x['role'][:50], '|', x['keep'])
