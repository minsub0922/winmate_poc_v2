"""Checkpoint scoring integrity; synthetic fixtures never enter production histories."""
from copy import deepcopy
from types import SimpleNamespace
import pytest
from app.api.poc import detailed_review, review_schema, knowledge, imports


def fixture():
    spec=review_schema.schema()['criteria'][0]
    page=SimpleNamespace(n=1,text='고객 자료: A 커피 본사 운영팀. 시범 10곳, 2026년 10월 기준. 확인은 운영 PM이 담당합니다.')
    proposal=SimpleNamespace(n=2,sheet=lambda n:page if n==1 else SimpleNamespace(n=2,text='다른 장의 서로 다른 본문'))
    points=[{'id':p['id'],'level':2,'basis':'assumption','reason':'구체적이나 고객 원자료는 가정입니다.','verification':'','evidence':[{'sheet':1,'quote':'A 커피 본사 운영팀'}]} for p in spec['checkpoints']]
    row={'id':spec['id'],'checks':points,'anchor':'실제 검증 근거가 부족합니다.','improve':'고객 확인 자료와 기준일을 첨부하세요.','confidence':'mid'}
    return {'scores':[row]},[spec['id']],{spec['id']:spec},proposal


def test_schema_has_96_independent_checkpoint_definitions():
    s=review_schema.schema()
    assert s['version']==5 and s['scoring']['id']=='checkpoints-4x4'
    points=[p for c in s['criteria'] for p in c['checkpoints']]
    assert len(points)==len({p['id'] for p in points})==96
    assert all(len(c['checkpoints'])==4 for c in s['criteria'])
    assert {p['kind'] for p in points}=={'fact','plan','document','visual'}
    assert [x['value'] for x in s['scoring']['levels']]==list(range(5))


def test_grounded_specific_assumptions_are_valid_but_do_not_get_full_credit():
    args=fixture();assert detailed_review.response_problem(*args)==''
    assert review_schema.schema()['scoring']['level_points']['2']==65


@pytest.mark.parametrize('value',[True,2.5,'3',-1,5,None])
def test_levels_require_exact_integers(value):
    args=fixture();args[0]['scores'][0]['checks'][0]['level']=value
    assert detailed_review.response_problem(*args)


@pytest.mark.parametrize('mutation',[
 lambda r:r['checks'].pop(),
 lambda r:r['checks'].__setitem__(1,deepcopy(r['checks'][0])),
 lambda r:r['checks'][0].update(level=4,basis='assumption',verification='그냥 높은 점수를 주었습니다.'),
 lambda r:r['checks'][0].update(level=4,basis='cross_checked',verification=''),
 lambda r:r['checks'][0]['evidence'][0].update(sheet=2),
 lambda r:r['checks'][0]['evidence'][0].update(quote='자료에 전혀 없는 허위 인용'),
 lambda r:r['checks'][0].update(evidence=[]),
 lambda r:r.update(improve=''),
])
def test_incomplete_or_unsupported_model_outputs_are_rejected(mutation):
    args=fixture();mutation(args[0]['scores'][0]);assert detailed_review.response_problem(*args)


def test_absence_is_zero_without_fabricated_citation():
    args=fixture()
    for point in args[0]['scores'][0]['checks']:point.update(level=0,basis='missing',evidence=[],reason='요소가 없습니다.')
    assert detailed_review.response_problem(*args)==''


def test_arithmetic_is_monotonic_and_not_a_distribution_or_downward_multiplier():
    imports.score();cs,_,_=knowledge.score_assets()
    def result(levels):
        points=review_schema.schema()['scoring']['level_points'];score=detailed_review.DetailedScore('CU1',sum(points[str(level)] for level in levels)/4,'',[],'','mid',[{'level':n} for n in levels])
        return detailed_review.aggregate(cs,[score],{'CU1':(True,'')},['CU1'])
    assert result([0]*4)['total']==0
    assert result([2]*4)['total']==65
    assert result([2,2,2,3])['total']==70
    assert result([4]*4)['total']==100
    assert result([2,2,2,3])['checkpoint_count']==4
    assert result([2,2,2,3])['dist']=={'0':0,'1':0,'2':3,'3':1,'4':0}


def test_backend_reasks_with_the_previous_response_and_actual_page_text():
    from app.api.poc.backends import make_score_backend,ModeTracker
    from app.api.poc.provider import GenerationResult
    good,ids,defs,proposal=fixture();bad=deepcopy(good);bad['scores'][0]['checks'][0]['evidence'][0]['quote']='창작한 잘못된 문구'
    seen=[]
    class Provider:
        available=True;name='synthetic-test-provider';model='fixture'
        def model_for(self,kind):return self.model
        def generate_json(self,**kwargs):
            seen.append(kwargs)
            data=bad if len(seen)==1 else good
            return GenerationResult(data=data,text=json.dumps(data,ensure_ascii=False),model=self.model)
    import json
    provider=Provider();tracker=ModeTracker(provider=provider);backend=make_score_backend(provider,tracker)
    result=backend.complete('score_detail','system','source',detailed_review.score_schema(ids,defs),meta={'tag':'test:detail','criteria_ids':ids,'proposal':proposal})
    assert result==good and len(seen)==2
    assert '정상 체크포인트의 판단은 유지' in seen[1]['user']
    assert proposal.sheet(1).text in seen[1]['user']
    assert tracker.rejected==1


def test_source_ids_resolve_only_to_real_page_and_original_text():
    args=fixture();registry=detailed_review.evidence_registry(args[3]);ref=next(iter(registry))
    for point in args[0]['scores'][0]['checks']:point['evidence']=[{'ref':ref}]
    assert detailed_review.response_problem(*args)==''
    actual=detailed_review.resolved_evidence([{'ref':ref}],registry)[0]
    assert actual['sheet']==1 and actual['quote'] in args[3].sheet(1).text


@pytest.mark.parametrize('ref',['does-not-exist',[],{},None,True])
def test_bad_source_ids_are_rejected_without_formatting_exceptions(ref):
    args=fixture();args[0]['scores'][0]['checks'][0]['evidence']=[{'ref':ref}]
    assert detailed_review.response_problem(*args)


def test_well_prepared_proposal_has_an_85_anchor_without_dataset_normalization():
    scoring=review_schema.schema()['scoring']
    assert scoring['level_points']=={'0':0,'1':40,'2':65,'3':85,'4':100}
    assert scoring['basis_caps']['assumption']==3
    assert scoring['basis_caps']['documented']==4
    assert scoring['benchmark']['reference_score']==85 and scoring['benchmark']['force_mean'] is False
    assert len(review_schema.schema()['criteria'])==24


@pytest.mark.parametrize('level,expected',[(0,0),(1,40),(2,65),(3,85),(4,100)])
def test_proposal_stage_conversion_is_used_in_real_scoring_path(level,expected):
    from app.api.poc.adapters.review import scenario_from_doc
    body={'kind':'txt','units':[{'n':1,'title':'고객 제안','text':'A 커피 본사 운영팀은 시범 10곳에서 통합 메뉴 운영을 검토합니다.'}]}
    scenario,_=scenario_from_doc(body,{'customer':'A 커피'})
    p=imports.score().proposal.from_scenario(scenario);spec=review_schema.schema();definition=next(c for c in spec['criteria'] if c['id']=='CU1')
    ref=next(iter(detailed_review.evidence_registry(p)))
    class FixtureBackend:
        def complete(self,*args,**kwargs):
            return {'scores':[{'id':'CU1','checks':[{'id':point['id'],'level':level,'basis':{0:'missing',1:'claim',2:'assumption',3:'assumption',4:'documented'}[level],'reason':'현재 제안 범위에서의 충분성을 확인했습니다.','verification':'제시 문구와 고객 맥락을 대조해 충족을 확인했습니다.' if level==4 else '', 'evidence':[{'ref':ref}] if level else []} for point in definition['checkpoints']], 'anchor':'제안 단계의 판단 결과입니다.','improve':'후속 단계에서 실행 조건을 협의하세요.','confidence':'high'}]}
    result=detailed_review.score_selected(p,SimpleNamespace(backend=FixtureBackend(),temperature=0),['CU1'],{},spec)[0]
    assert result.score==expected and all(point['points']==expected for point in result.checkpoints)
