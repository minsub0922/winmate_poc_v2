"""POST /api/spatial/command — 명령 문장 → 시뮬레이터 조작 목록 (LLM 경로 · Decision 경로)."""
import copy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.spatial import SpatialLibrary,build_router
try:
    from app.api.llm.decision import set_decision_override
except ImportError:  # Decision 모델 모듈이 없는 구성 — LLM 경로만 검사한다
    set_decision_override=None


class SpatialCommandLlmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.library=SpatialLibrary();app=FastAPI();app.state.spatial_library=cls.library;app.include_router(build_router());cls.client=TestClient(app)
        cls.scene=copy.deepcopy(cls.library.scenes['cowork-full-standard'])
        cls.oid=cls.scene['objects'][0]['id'];cls.room=cls.scene['rooms'][0]['id'];cls.other=cls.scene['rooms'][1]['id']
    def setUp(self):
        if set_decision_override:set_decision_override(None)  # these tests exercise the LLM branch only
        self.captured={}
    def tearDown(self):
        if set_decision_override:set_decision_override(clear=True)
    def call(self,plan,**overrides):
        def generate(**kwargs):
            self.captured.update(kwargs)
            return SimpleNamespace(data=plan,model='test-provider')
        with patch('app.api.poc.provider.get_provider',return_value=(SimpleNamespace(generate_json=generate),'')):
            return self.client.post('/api/spatial/command',json={'prompt':'선택한 것을 조작해줘','scene':self.scene,**overrides})
    def ops(self,*operations):
        return {'explanation':'요청한 대로 바꿨어요','operations':list(operations)}

    def test_without_the_decision_module_every_command_goes_to_the_llm(self):
        # Decision 모델 모듈은 선택 사항이다 — 없는 구성에서도 태그된 명령이 LLM으로 해석된다
        import sys,app.api.llm as package
        missing=object();loaded=getattr(package,'decision',missing)
        if loaded is not missing:delattr(package,'decision')
        op={'type':'move','objectId':self.oid,'direction':'right'}
        try:
            with patch.dict(sys.modules,{'app.api.llm.decision':None}):
                response=self.call(self.ops(op),prompt='@[소파] 오른쪽으로 옮겨',mentions=[{'kind':'object','id':self.oid,'label':'소파'}],roomId=self.room)
        finally:
            if loaded is not missing:setattr(package,'decision',loaded)
        self.assertEqual(response.status_code,200,response.text);self.assertEqual(response.json()['source'],'llm');self.assertEqual(response.json()['plan']['operations'],[op])

    def test_user_examples_pass_through_as_operations(self):
        cases=[
            ('@[거실] 에 @[사람] 2명 복사해',[{'kind':'room','id':self.other,'label':'거실'},{'kind':'object','id':self.oid,'label':'사람'}],{'type':'copy','objectId':self.oid,'quantity':2,'roomId':self.other}),
            ('@[소파] 오른쪽으로 옮겨',[{'kind':'object','id':self.oid,'label':'소파'}],{'type':'move','objectId':self.oid,'direction':'right'}),
            ('@[세탁기] 3개 추가해',[{'kind':'asset','id':'product:sg_g000183943','label':'세탁기'}],{'type':'add','assetId':'product:sg_g000183943','roomId':self.room,'quantity':3}),
        ]
        for prompt,mentions,op in cases:
            with self.subTest(prompt=prompt):
                response=self.call(self.ops(op),prompt=prompt,mentions=mentions,roomId=self.room,view='3d')
                self.assertEqual(response.status_code,200,response.text)
                body=response.json();self.assertEqual(body['plan']['operations'],[op]);self.assertEqual(body['source'],'llm');self.assertEqual(body['model'],'test-provider')

    def test_every_operation_kind_is_accepted(self):
        operations=[
            {'type':'move','objectId':self.oid,'direction':'back','distance':2.5},
            {'type':'move','objectId':self.oid,'roomId':self.other},
            {'type':'move','objectId':self.oid,'patch':{'x':3.2,'z':1.5}},
            {'type':'rotate','objectId':self.oid,'angle':-90},
            {'type':'rotate','objectId':self.oid,'rotation':180},
            {'type':'remove','objectId':self.oid},
            {'type':'style','style':'warm'},
            {'type':'room_add','kind':'meeting','name':'대회의실','ref':'new-1'},
            {'type':'add','assetId':'furniture:plant','roomId':'new-1','quantity':2},
            {'type':'room_update','roomId':self.room,'name':'로비','purpose':'방문 안내'},
            {'type':'room_remove','roomId':self.other},
        ]
        response=self.call(self.ops(*operations));self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['plan']['operations'],operations)

    def test_model_output_is_normalised(self):
        response=self.call(self.ops(
            {'type':'add','assetId':'furniture:plant','roomId':self.room},
            {'type':'copy','objectId':self.oid,'quantity':None,'roomId':None,'style':'warm'},
            {'type':'move','objectId':self.oid,'direction':'left','distance':None,'patch':{},'roomId':''},
            {'type':'rotate','objectId':self.oid,'angle':90,'rotation':None},
            {'type':'room_add','kind':'lounge','name':'  ','ref':''}))
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['plan']['operations'],[
            {'type':'add','assetId':'furniture:plant','roomId':self.room,'quantity':1},
            {'type':'copy','objectId':self.oid,'quantity':1},
            {'type':'move','objectId':self.oid,'direction':'left'},
            {'type':'rotate','objectId':self.oid,'angle':90},
            {'type':'room_add','kind':'lounge'}])

    def test_rejects_model_hallucinations(self):
        bad=[
            {'type':'copy','objectId':'missing','quantity':1},
            {'type':'copy','objectId':self.oid,'quantity':31},
            {'type':'copy','objectId':self.oid,'quantity':1,'roomId':'missing'},
            {'type':'move','objectId':self.oid},
            {'type':'move','objectId':self.oid,'direction':'up'},
            {'type':'move','objectId':self.oid,'direction':'right','distance':0},
            {'type':'move','objectId':self.oid,'direction':'right','distance':500},
            {'type':'move','objectId':self.oid,'patch':{'x':'20'}},
            {'type':'rotate','objectId':self.oid},
            {'type':'rotate','objectId':self.oid,'angle':0},
            {'type':'rotate','objectId':'missing','angle':90},
            {'type':'remove','objectId':'missing'},
            {'type':'style','style':'neon'},
            {'type':'add','assetId':'missing','roomId':self.room,'quantity':1},
            {'type':'add','assetId':'furniture:plant','roomId':'new-1','quantity':1},
            {'type':'add','assetId':'furniture:plant','roomId':self.room,'quantity':0},
            {'type':'room_add','kind':'dungeon'},
            {'type':'room_add','kind':'meeting','name':'가'*101},
            {'type':'room_remove','roomId':'missing'},
            {'type':'room_update','roomId':self.room},
            {'type':'teleport','objectId':self.oid},
            'not-an-object',
        ]
        for op in bad:
            with self.subTest(op=op):self.assertEqual(self.call(self.ops(op)).status_code,502)
        self.assertEqual(self.call({'operations':[]}).status_code,502)
        self.assertEqual(self.call(self.ops(*[{'type':'room_add','kind':'office'}]*25)).status_code,502)

    def test_validates_request_before_asking_the_model(self):
        for overrides in [
            {'mentions':[{'kind':'room','id':'missing','label':'없는 공간'}]},
            {'mentions':[{'kind':'space','id':'dungeon','label':'없는 용도'}]},
            {'mentions':[{'kind':'object','id':'missing','label':'없는 오브젝트'}]},
            {'mentions':[{'kind':'asset','id':'missing','label':'없는 제품'}]},
            {'mentions':[{'kind':'planet','id':self.room,'label':'?'}]},
            {'roomId':'missing'},{'prompt':'가'},{'view':'4d'},
        ]:
            with self.subTest(overrides=overrides):
                self.assertEqual(self.call(self.ops(),**overrides).status_code,422);self.assertEqual(self.captured,{})
        scene=copy.deepcopy(self.scene);scene['objects'][0]['x']=-100
        self.assertEqual(self.call(self.ops(),scene=scene).status_code,422)
        ok=self.call(self.ops(),mentions=[{'kind':'room','id':self.room,'label':'로비'},{'kind':'space','id':'meeting','label':'회의실'}])
        self.assertEqual(ok.status_code,200,ok.text)

    def test_blank_studio_can_only_start_with_a_room(self):
        blank={'scene':None,'industry':'OF'}
        first=self.call(self.ops({'type':'room_add','kind':'meeting','ref':'new-1'},{'type':'add','assetId':'furniture:plant','roomId':'new-1','quantity':1}),mentions=[{'kind':'space','id':'meeting','label':'회의실'}],**blank)
        self.assertEqual(first.status_code,200,first.text)
        self.assertEqual(self.call(self.ops({'type':'add','assetId':'furniture:plant','roomId':self.room,'quantity':1}),**blank).status_code,502)
        self.assertEqual(self.call(self.ops({'type':'style','style':'warm'}),**blank).status_code,502)
        self.assertEqual(self.call(self.ops(),mentions=[{'kind':'object','id':self.oid,'label':'없는 장면의 오브젝트'}],**blank).status_code,422)
        self.assertEqual(self.call(self.ops(),scene=None,industry='XX').status_code,422)

    def test_add_falls_back_to_the_viewed_room_and_the_tagged_asset(self):
        washer={'kind':'asset','id':'product:sg_g000183943','label':'세탁기'}
        # 공간을 빠뜨리거나 틀리게 답하면 지금 보고 있는 공간, 자산 id가 틀리면 하나뿐인 @ 자산
        response=self.call(self.ops({'type':'add','assetId':'product:sg_g000183943','quantity':3},{'type':'add','assetId':'세탁기','roomId':'세탁실','quantity':1}),mentions=[washer],roomId=self.other)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['plan']['operations'],[{'type':'add','assetId':washer['id'],'roomId':self.other,'quantity':3},{'type':'add','assetId':washer['id'],'roomId':self.other,'quantity':1}])
        # 보는 공간이 없으면 고쳐 쓰지 않는다 · 자산 태그가 둘이면 고르지 않는다 · 삭제 · 이동 대상은 절대 바꿔 끼우지 않는다
        asked=self.call(self.ops({'type':'move','objectId':self.oid,'direction':'right'},{'type':'add','assetId':washer['id'],'quantity':1}),mentions=[washer])
        self.assertEqual(asked.status_code,200,asked.text);self.assertEqual(asked.json()['plan']['operations'],[],'nothing is applied when one step cannot be placed')
        self.assertIn('공간',asked.json()['plan']['explanation'])
        self.assertEqual(self.call(self.ops({'type':'add','assetId':'세탁기','roomId':self.room,'quantity':1}),mentions=[washer,{'kind':'asset','id':'furniture:plant','label':'수목'}]).status_code,502)
        self.assertEqual(self.call(self.ops({'type':'remove','objectId':'소파'}),mentions=[{'kind':'object','id':self.oid,'label':'소파'}],roomId=self.room).status_code,502)

    def test_clarification_without_operations(self):
        response=self.call({'explanation':'어느 공간에 놓을까요?','operations':[]})
        self.assertEqual(response.status_code,200);self.assertEqual(response.json()['plan'],{'explanation':'어느 공간에 놓을까요?','operations':[]})

    def test_prompt_carries_scene_references_and_ranked_assets(self):
        mentions=[{'kind':'room','id':self.other,'label':'거실'},{'kind':'asset','id':'people:student-write','label':'학생'}]
        response=self.call(self.ops(),prompt='세탁기를 3개 추가해',mentions=mentions,roomId=self.room,view='3d')
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(self.captured['stage'],'spatial:command');self.assertFalse(self.captured['cache_allowed'])
        payload=json.loads(self.captured['user'])
        self.assertEqual(payload['request'],'세탁기를 3개 추가해');self.assertEqual(payload['references'],mentions);self.assertEqual(payload['focusedRoomId'],self.room)
        self.assertEqual(len(payload['spaceTypes']),16);self.assertEqual(len(payload['scene']['rooms']),len(self.scene['rooms']))
        self.assertEqual(len(payload['scene']['objects']),len(self.scene['objects']))
        first=payload['scene']['objects'][0]
        for key in ['id','assetId','name','roomId','x','z','rotation']:self.assertIn(key,first)
        ids=[a['id'] for a in payload['availableAssets']]
        self.assertLessEqual(len(ids),160);self.assertIn('people:student-write',ids)
        self.assertTrue(any('세탁기' in a['name'] for a in payload['availableAssets'][:12]),'particles are stripped when ranking assets')
        properties=self.captured['schema']['properties']['operations']['items']['properties']
        self.assertEqual(sorted(properties['type']['enum']),sorted(['add','copy','move','rotate','remove','style','room_add','room_remove','room_update']))
        self.assertEqual(properties['direction']['enum'],['left','right','forward','back'])
        for key in ['objectId','assetId','roomId']:self.assertEqual(properties[key],{'type':'STRING'})

    def test_frozen_asset_revision_is_used(self):
        frozen=copy.deepcopy(self.library.library);frozen['sourceHash']='deadbeef';self.library.revisions['deadbeef']=frozen
        scene=copy.deepcopy(self.scene);scene['assetRevision']='deadbeef'
        try:self.assertEqual(self.call(self.ops(),scene=scene).status_code,200)
        finally:self.library.revisions.pop('deadbeef',None)

    def test_provider_missing_or_failing(self):
        with patch('app.api.poc.provider.get_provider',return_value=(None,'no key')):
            self.assertEqual(self.client.post('/api/spatial/command',json={'prompt':'소파를 옮겨줘','scene':self.scene}).status_code,503)
        from app.api.poc.provider import ProviderError
        def fail(**kwargs):raise ProviderError('upstream_error','모델 오류')
        with patch('app.api.poc.provider.get_provider',return_value=(SimpleNamespace(generate_json=fail),'')):
            self.assertEqual(self.client.post('/api/spatial/command',json={'prompt':'소파를 옮겨줘','scene':self.scene}).status_code,502)


class FakeDecision:
    """Answers typed questions from a table: {question id: choice key | yes-probability | (choice key, confidence)}."""
    model='fake-decision'
    def __init__(self,table=None,error=None):
        self.table=table or {};self.error=error;self.asked=[]
    def ask(self,*,stage,state,questions,cancel=None):
        self.asked.append({'stage':stage,'state':state,'questions':questions})
        if self.error:raise self.error
        answers={}
        for qid,q in questions.items():
            value=self.table.get(qid)
            if q['type']=='noul':answers[qid]={'type':'noul','noul':value if isinstance(value,(int,float)) else (0.97 if qid=='tagged' else 0.02)}  # 기본: 요청 하나 · 대상은 태그한 것
            else:
                key,confidence=value if isinstance(value,tuple) else (value if value is not None else 'none',0.93)
                if key not in q['criteria']:key=next((k for k in q['criteria'] if k=='none'),next(iter(q['criteria'])))
                answers[qid]={'type':'choice','choice':key,'confidence':confidence,'probabilities':{key:confidence}}
        return SimpleNamespace(answers=answers,model=self.model,ms=120,input_tokens=0,output_tokens=0,attempts=1)


@unittest.skipUnless(set_decision_override,'Decision 모델 모듈(app/api/llm/decision.py)이 없는 구성')
class SpatialCommandDecisionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.library=SpatialLibrary();app=FastAPI();app.state.spatial_library=cls.library;app.include_router(build_router());cls.client=TestClient(app)
        cls.scene=copy.deepcopy(cls.library.scenes['cowork-full-standard'])
        cls.oid=cls.scene['objects'][0]['id'];cls.second=cls.scene['objects'][5]['id'];cls.room=cls.scene['rooms'][0]['id'];cls.other=cls.scene['rooms'][1]['id']
        cls.home=next(o['roomId'] for o in cls.scene['objects'] if o['id']==cls.oid)
    def tearDown(self):
        set_decision_override(clear=True)
    def call(self,decision,**overrides):
        """Returns (response, llm call count). The LLM answers with a marker plan so its use is visible."""
        llm=[]
        def generate(**kwargs):
            llm.append(kwargs);return SimpleNamespace(data={'explanation':'LLM이 답했어요','operations':[]},model='test-llm')
        set_decision_override(decision,tasks=['spatial.command'])
        with patch('app.api.poc.provider.get_provider',return_value=(SimpleNamespace(generate_json=generate),'')):
            response=self.client.post('/api/spatial/command',json={'prompt':'선택한 것을 조작해줘','scene':self.scene,**overrides})
        return response,len(llm)
    def obj(self,oid=None,label='소파'):return {'kind':'object','id':oid or self.oid,'label':label}
    def roomkey(self,rid):return 'r'+str([r['id'] for r in self.scene['rooms']].index(rid))

    def test_tagged_single_requests_are_answered_without_the_llm(self):
        washer={'kind':'asset','id':'product:sg_g000183943','label':'세탁기'}
        target=self.other if self.other!=self.home else self.room
        cases=[
            ('@[거실] 에 @[사람] 2명 복사해',[{'kind':'room','id':target,'label':'거실'},self.obj(label='사람')],{'action':'copy','room':self.roomkey(target),'count':'2'},
             {'type':'copy','objectId':self.oid,'quantity':2,'roomId':target}),
            ('@[소파] 오른쪽으로 옮겨',[self.obj()],{'action':'move_direction','direction':'right'},{'type':'move','objectId':self.oid,'direction':'right'}),
            ('@[소파] 왼쪽으로 2m 옮겨',[self.obj()],{'action':'move_direction','direction':'left','distance':'2'},{'type':'move','objectId':self.oid,'direction':'left','distance':2}),
            ('@[세탁기] 3개 추가해',[washer],{'action':'add','count':'3'},{'type':'add','assetId':washer['id'],'roomId':self.room,'quantity':3}),
            ('@[소파] 를 @[거실] 로 옮겨',[self.obj(),{'kind':'room','id':target,'label':'거실'}],{'action':'move_room','room':self.roomkey(target)},{'type':'move','objectId':self.oid,'roomId':target}),
            ('@[소파] 돌려',[self.obj()],{'action':'rotate'},{'type':'rotate','objectId':self.oid,'angle':90}),
            ('@[소파] 왼쪽으로 45도 돌려',[self.obj()],{'action':'rotate','angle':'-45'},{'type':'rotate','objectId':self.oid,'angle':-45}),
            ('@[소파] 지워',[self.obj()],{'action':'remove'},{'type':'remove','objectId':self.oid}),
            ('@[사람] 2명 복사해',[{'kind':'asset','id':'people:student-write','label':'사람'}],{'action':'copy','count':'2'},{'type':'add','assetId':'people:student-write','roomId':self.room,'quantity':2}),
        ]
        for prompt,mentions,table,op in cases:
            with self.subTest(prompt=prompt):
                decision=FakeDecision(table);response,llm=self.call(decision,prompt=prompt,mentions=mentions,roomId=self.room)
                self.assertEqual(response.status_code,200,response.text);body=response.json()
                self.assertEqual(body['plan']['operations'],[op]);self.assertEqual(body['source'],'decision');self.assertEqual(body['model'],'fake-decision');self.assertEqual(llm,0)
                self.assertEqual(len(decision.asked),1);self.assertEqual(decision.asked[0]['stage'],'spatial.command')
                self.assertEqual(decision.asked[0]['state']['request'],prompt);self.assertNotIn('subject',decision.asked[0]['questions'])
                self.assertEqual(len(decision.asked[0]['questions']['count']['criteria']),30)

    def test_add_without_a_room_goes_to_the_best_fitting_room(self):
        washer={'kind':'asset','id':'product:sg_g000183943','label':'세탁기'}
        decision=FakeDecision({'action':'add','count':'3','fit':self.roomkey(self.other)})
        response,llm=self.call(decision,prompt='@[세탁기] 3개 추가해',mentions=[washer])
        self.assertEqual(response.status_code,200,response.text);self.assertEqual(llm,0)
        self.assertEqual(response.json()['plan']['operations'],[{'type':'add','assetId':washer['id'],'roomId':self.other,'quantity':3}])
        self.assertEqual(sorted(decision.asked[0]['questions']['fit']['criteria']),sorted('r'+str(i) for i in range(len(self.scene['rooms']))))
        # 보고 있는 공간이 있으면 그 공간이 먼저다
        focused,_=self.call(FakeDecision({'action':'add','count':'1','fit':self.roomkey(self.other)}),mentions=[washer],roomId=self.room)
        self.assertEqual(focused.json()['plan']['operations'][0]['roomId'],self.room)

    def test_copy_into_the_source_room_needs_no_room(self):
        decision=FakeDecision({'action':'copy','room':self.roomkey(self.home),'count':'1'})
        response,llm=self.call(decision,mentions=[self.obj()]);self.assertEqual(response.json()['plan']['operations'],[{'type':'copy','objectId':self.oid,'quantity':1}]);self.assertEqual(llm,0)

    def test_subject_is_asked_when_several_things_are_tagged(self):
        decision=FakeDecision({'action':'remove','subject':'s1'})
        response,llm=self.call(decision,mentions=[self.obj(),self.obj(self.second,'의자')])
        self.assertEqual(response.status_code,200,response.text);self.assertEqual(response.json()['plan']['operations'],[{'type':'remove','objectId':self.second}]);self.assertEqual(llm,0)
        self.assertEqual(sorted(decision.asked[0]['questions']['subject']['criteria']),['s0','s1'])

    def test_falls_back_to_the_llm(self):
        from app.api.poc.provider import ProviderError
        washer={'kind':'asset','id':'product:sg_g000183943','label':'세탁기'}
        cases={
            'several requests':(FakeDecision({'multi':0.9,'action':'remove'}),{'mentions':[self.obj()]}),
            'not a listed action':(FakeDecision({'action':'other'}),{'mentions':[self.obj()]}),
            'unsure about the action':(FakeDecision({'action':('remove',0.3)}),{'mentions':[self.obj()]}),
            'unsure about the subject':(FakeDecision({'action':'remove','subject':('s0',0.3)}),{'mentions':[self.obj(),self.obj(self.second,'의자')]}),
            'unsure about the count':(FakeDecision({'action':'copy','count':('2',0.2)}),{'mentions':[self.obj()]}),
            'direction not said':(FakeDecision({'action':'move_direction'}),{'mentions':[self.obj()]}),
            'distance not in the list':(FakeDecision({'action':'move_direction','direction':'right','distance':'other'}),{'mentions':[self.obj()]}),
            'angle not in the list':(FakeDecision({'action':'rotate','angle':'other'}),{'mentions':[self.obj()]}),
            'add with no room said, viewed or clearly fitting':(FakeDecision({'action':'add','count':'1','fit':('r2',0.3)}),{'mentions':[washer]}),
            'add of a placed object':(FakeDecision({'action':'add','count':'1'}),{'mentions':[self.obj()],'roomId':self.room}),
            'move of a catalogue asset':(FakeDecision({'action':'move_direction','direction':'right'}),{'mentions':[washer]}),
            'room move without a room':(FakeDecision({'action':'move_room'}),{'mentions':[self.obj()]}),
            'decision model error':(FakeDecision(error=ProviderError('upstream_error','Decision 모델 오류')),{'mentions':[self.obj()]}),
            'decision request cannot be built':(FakeDecision(error=ValueError('Decision 모델 state 가 질문당 컨텍스트 한도를 넘습니다.')),{'mentions':[self.obj()]}),
            'the target is something next to the tagged thing':(FakeDecision({'action':'remove','tagged':0.1}),{'prompt':'@[소파] 옆에 있는 의자 지워줘','mentions':[self.obj()]}),
            'a removal the model is only fairly sure about':(FakeDecision({'action':('remove',0.62)}),{'mentions':[self.obj()]}),
        }
        for name,(decision,overrides) in cases.items():
            with self.subTest(name=name):
                response,llm=self.call(decision,**overrides)
                self.assertEqual(response.status_code,200,response.text);self.assertEqual(response.json()['source'],'llm');self.assertEqual(llm,1);self.assertEqual(len(decision.asked),1)

    def test_decision_is_not_asked_when_the_request_cannot_fit(self):
        cases={
            'nothing tagged':{},
            'only a room tagged':{'mentions':[{'kind':'room','id':self.room,'label':'로비'}]},
            'a new space type tagged':{'mentions':[self.obj(),{'kind':'space','id':'meeting','label':'회의실'}]},
            'blank studio':{'scene':None,'industry':'OF','mentions':[{'kind':'asset','id':'furniture:plant','label':'화분'}]},
            'retry after a geometry failure':{'mentions':[self.obj()],'feedback':'라운지 소파: 가구·제품 또는 출입문과 겹칩니다.'},
        }
        for name,overrides in cases.items():
            with self.subTest(name=name):
                decision=FakeDecision({'action':'remove'});response,llm=self.call(decision,**overrides)
                self.assertEqual(response.status_code,200,response.text);self.assertEqual(decision.asked,[]);self.assertEqual(llm,1);self.assertEqual(response.json()['source'],'llm')

    def test_the_questions_ask_whether_the_tagged_thing_is_the_target(self):
        decision=FakeDecision({'action':'remove'});response,llm=self.call(decision,mentions=[self.obj()])
        self.assertEqual(response.json()['source'],'decision');questions=decision.asked[0]['questions']
        self.assertEqual(questions['tagged']['type'],'noul');self.assertIn('둘 이상의 대상',questions['multi']['instructions'])

    def test_task_is_registered_as_a_decision_task(self):
        from app.api.poc.settings import DECISION_TASKS
        self.assertIn('spatial.command',DECISION_TASKS)


if __name__=='__main__':unittest.main()
