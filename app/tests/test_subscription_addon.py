"""요구사항에 따라 다른 목차 구성에 '구독 솔루션 제안'만 더하는 서버 규칙(app/api/poc/subscription_addon.py)과 목차 추천 job 연결."""
import json
import subprocess
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from app.api.poc import subscription_addon as sa  # noqa: E402

SEG = lambda text: [{'t': text}]  # noqa: E731 — 앱 요구 문장 조각


def proposal(free='', keymen=(), parts=()):
    return {'title': '제안서', 'customer': '고객', 'req': {'free': SEG(free), 'form': {'keymen': [{'name': n, 'weight': 50, 'reqs': [SEG(r) for r in rs]} for n, rs in keymen]}, 'files': []},
            'ctx': {}, 'parts': list(parts)}


class NeedTest(unittest.TestCase):
    def test_rules_come_from_the_registry(self):
        r = sa.rules()
        self.assertEqual(r['part']['type'], 'subscription')
        self.assertEqual(r['part']['name'], '구독 솔루션 제안')
        self.assertEqual(json.loads((ROOT / 'app/data/subscriptions.json').read_text())['addon'], r)

    def test_signals(self):
        cases = {
            '초기 투자 부담이 커서 렌탈이나 월 납부 방식을 검토하고 싶습니다': True,
            '리스로 도입하는 방안도 비교해 주세요': True,
            '운용리스 조건': True,
            '구독형으로 들이고 싶어요': True,
            '초기 비용과 관리 인력이 부담입니다': True,              # weak 둘
            '초기 비용이 걱정입니다': False,                          # weak 하나
            '리스크 관리와 리스트 정리, 프리스탠딩 식기세척기': False,  # 리스(크 · 트 · 탠딩) 아님
            '객실에서 OTT 구독 서비스와 유튜브 구독자 이벤트': False,   # 콘텐츠 구독 · 구독자
            '구독은 원하지 않습니다. 일시불 구매만 검토합니다': False,  # negative
            '': False,
        }
        for text, want in cases.items():
            with self.subTest(text=text):
                self.assertEqual(sa.need(text)['need'], want)

    def test_requirement_text_reads_free_text_keymen_files_and_summary(self):
        pr = proposal('신규 객실 TV', keymen=[('재무 담당', ['초기 비용 부담 없이 월 납부'])])
        pr['req']['files'] = [{'name': 'rfp.pdf', 'memo': '', 'text': '유지보수 포함'}]
        text = sa.requirement_text(pr, extra='요약: 렌탈 검토')
        for w in ('신규 객실 TV', '재무 담당', '월 납부', '유지보수 포함', '렌탈 검토'):
            self.assertIn(w, text)


class PlaceTest(unittest.TestCase):
    def test_after_cost_else_before_execution_case_why(self):
        cover = {'type': 'cover', 'deck': True}
        self.assertEqual(sa.index([cover, {'type': 'value'}, {'type': 'cost'}, {'type': 'execution'}, {'type': 'why'}]), 3)
        self.assertEqual(sa.index([cover, {'type': 'value'}, {'type': 'products'}, {'type': 'case'}, {'type': 'why'}]), 3)
        self.assertEqual(sa.index([cover, {'type': 'value'}, {'type': 'execution'}, {'type': 'closing'}]), 2)
        self.assertEqual(sa.index([cover, {'type': 'value'}, {'type': 'products'}]), 3)
        self.assertEqual(sa.index([]), 0)

    def test_add_only_when_needed_and_no_subscription_part(self):
        parts = [{'type': 'cover', 'deck': True, 'name': '표지'}, {'type': 'value', 'name': '가치'}, {'type': 'case', 'name': '사례'}, {'type': 'why', 'name': 'Why'}]
        pr = proposal('렌탈로 도입하고 싶어요')
        out, added = sa.add(parts, [], pr, src='bs_sub_std_ht_mid#5')
        self.assertEqual([p['type'] for p in out], ['cover', 'value', 'subscription', 'case', 'why'])
        p = out[2]
        self.assertEqual((p['name'], p['src']), ('구독 솔루션 제안', 'bs_sub_std_ht_mid#5'))
        self.assertTrue(p['items'][0].startswith('요구사항: ') and '렌탈' in p['items'][0])
        self.assertEqual(added['at'], 2)
        self.assertEqual(sa.add(out, [], pr)[1], None, '이미 구독 목차가 있으면 더하지 않음')
        self.assertEqual(sa.add(parts, [{'type': 'subscription', 'name': '구독'}], pr)[1], None, '보드에 구독 목차가 있으면 더하지 않음')
        self.assertEqual(sa.add(parts, [], proposal('신규 객실 TV 교체'))[1], None, '구독 요구가 없으면 그대로')

    def test_module_src_prefers_the_same_industry(self):
        lib = {'modules': [{'mid': 'bs_sub_std_ht_mid#5', 'name': '05 구독 솔루션 제안', 'ind': 'hotel'},
                           {'mid': 'bs_sub_std_md_clinic#5', 'name': '05 구독 솔루션 제안', 'ind': 'hospital'},
                           {'mid': 'bs_sub_ed_univ#2', 'name': '02 B2B 삼성 AI 구독', 'ind': 'education'}]}
        self.assertEqual(sa.module_src(lib, 'hospital'), 'bs_sub_std_md_clinic#5')
        self.assertEqual(sa.module_src(lib, 'retail'), 'bs_sub_std_ht_mid#5')
        self.assertIsNone(sa.module_src({'modules': []}, 'hotel'))

    def test_module_src_follows_the_package_of_the_industry(self):
        sa.rules()
        verts = json.loads((ROOT / 'app/data/subscriptions.json').read_text())['verticals']
        mods = [{'mid': f'bs_sub_std_{v}#5', 'name': '05 구독 솔루션 제안', 'ind': i} for v, i in (('ht_mid', 'HT'), ('md_clinic', 'MD'), ('of_sme', 'OF'), ('pb_agency', 'PB'))]
        cards = [{'id': 'bs_std_' + v, 'ind': v.split('_')[0].upper()} for v in verts]  # 업종 코드 = 업종 id 앞부분(rs_senior → RS)
        lib = {'modules': mods, 'scenarios': cards}
        self.assertEqual(sa.module_src(lib, 'PB'), 'bs_sub_std_pb_agency#5', '같은 업종')
        self.assertEqual(verts['rs_senior']['pkg'], 'sub_pkg_public')
        self.assertEqual(sa.module_src(lib, 'RS'), 'bs_sub_std_pb_agency#5', '시니어 · 오피스텔 = 공공 패키지 업종')
        office = next(v['pkg'] for v in verts.values() if v['match'] == 'fallback')
        no_pkg = next(i for i in {c['ind'] for c in cards} if not any(verts[c['id'][7:]]['pkg'] for c in cards if c['ind'] == i))
        self.assertEqual(sa.module_src(lib, no_pkg), 'bs_sub_std_of_sme#5', f'패키지 없는 업종({no_pkg}) = 기본 {office}')


class ComposeJobTest(unittest.TestCase):
    """목차 추천 job(kind compose · step parts): 뼈대에 구독 목차가 없고 요구에 구독 요구가 있으면 '구독 솔루션 제안'을 더한다."""

    def run_parts(self, free):
        from app.api.poc.adapters import compose
        backbone = [{'type': 'cover', 'name': '표지', 'items': ['표지'], 'src': 'bs03#0', 'deck': True},
                    {'type': 'value', 'name': '가치', 'items': ['a'], 'src': 'bs03#1'}, {'type': 'cost', 'name': '비용', 'items': ['b'], 'src': 'bs03#2'},
                    {'type': 'execution', 'name': '실행', 'items': ['c'], 'src': 'bs03#3'}, {'type': 'why', 'name': 'Why', 'items': ['d'], 'src': 'bs03#4'}]

        class LLM:
            model = 'fake'

            def __init__(self, provider, cancel=None, on_call=None):
                self.on_call = on_call

        def recommend(inp, llm):
            llm.on_call('storyline')
            return {'analysis': {'industry': 'hotel'}, 'storyline': {'base': 'bs03', 'reason': ''}, 'thesis': 't', 'parts': [dict(p) for p in backbone]}

        lib = types.SimpleNamespace(load=lambda: {'modules': [{'mid': 'bs_sub_std_ht_mid#5', 'name': '05 구독 솔루션 제안', 'ind': 'hotel'}]})
        fake = (types.SimpleNamespace(from_app_proposal=lambda pr: pr), lib, types.SimpleNamespace(AppProviderLLM=LLM), types.SimpleNamespace(recommend=recommend))
        job = types.SimpleNamespace(logs=[], log=lambda m: job.logs.append(m), check_cancel=lambda: None)
        old = compose._composer
        compose._composer = lambda: fake
        try:
            out = compose.run(job, proposal(free), 'parts', None, [], None, '', types.SimpleNamespace(provider=None))
        finally:
            compose._composer = old
        return out, job.logs

    def test_adds_the_subscription_solution_after_cost(self):
        out, logs = self.run_parts('초기 비용 부담 없이 월 납부로 들이고 싶다')
        self.assertEqual([p['type'] for p in out['parts']], ['cover', 'value', 'cost', 'subscription', 'execution', 'why'])
        self.assertEqual(out['parts'][3]['src'], 'bs_sub_std_ht_mid#5')
        self.assertEqual(out['addons'][0]['id'], 'sub')
        self.assertTrue(any('구독 솔루션 제안' in m for m in logs))

    def test_keeps_the_backbone_without_a_subscription_need(self):
        out, _ = self.run_parts('객실 TV 교체와 로비 사이니지')
        self.assertEqual([p['type'] for p in out['parts']], ['cover', 'value', 'cost', 'execution', 'why'])
        self.assertEqual(out['addons'], [])


class ParityTest(unittest.TestCase):
    """앱(addons.js)과 서버가 같은 문장에서 같은 판정을 내린다."""

    def test_same_decision_as_the_app(self):
        texts = ['렌탈 희망', '초기 비용과 관리 인력 부담', '리스크 관리', 'OTT 구독 제공', '구독은 원하지 않음', '월 사용료 방식', '초기 비용 걱정']
        js = ("import('" + (ROOT / 'app/web/src/domain/proposals/addons.js').as_uri() + "').then((m) => { const fs = require('fs');"
              " const R = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).addon; const T = JSON.parse(process.argv[2]);"
              " console.log(JSON.stringify(T.map((t) => m.subscriptionNeed(t, R).need))); })")
        out = subprocess.run(['node', '-e', js, str(ROOT / 'app/data/subscriptions.json'), json.dumps(texts, ensure_ascii=False)],
                             capture_output=True, text=True, timeout=60, check=True).stdout
        self.assertEqual(json.loads(out), [sa.need(t)['need'] for t in texts])


if __name__ == '__main__':
    unittest.main()
