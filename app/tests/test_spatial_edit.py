import copy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.spatial import SpatialLibrary,build_router

class SpatialEditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.library=SpatialLibrary();app=FastAPI();app.state.spatial_library=cls.library;app.include_router(build_router());cls.client=TestClient(app)
        cls.scene=copy.deepcopy(cls.library.scenes['cowork-full-standard'])
    def call(self,plan,**overrides):
        provider=SimpleNamespace(generate_json=lambda **kwargs:SimpleNamespace(data=plan,model='test-provider'))
        with patch('app.api.poc.provider.get_provider',return_value=(provider,'')):
            return self.client.post('/api/spatial/edit',json={'prompt':'선택한 제품을 이동해줘','scene':self.scene,**overrides})
    def test_accepts_exact_instance_and_new_catalog_asset(self):
        oid=self.scene['objects'][0]['id'];room=self.scene['rooms'][0]['id']
        plan={'explanation':'이동 후 새 제품 추가','operations':[{'type':'move','objectId':oid,'patch':{'rotation':90}},{'type':'add','assetId':'product:qm65c','roomId':room,'quantity':1}]}
        response=self.call(plan,mentions=[{'kind':'object','id':oid,'label':'선택한 가구'},{'kind':'asset','id':'product:qm65c','label':'새 제품'}])
        self.assertEqual(response.status_code,200,response.text);self.assertEqual(response.json()['plan'],plan)
    def test_omitted_add_quantity_means_one(self):
        response=self.call({'explanation':'한 대 추가','operations':[{'type':'add','assetId':'product:qm65c','roomId':self.scene['rooms'][0]['id']}]})
        self.assertEqual(response.status_code,200,response.text);self.assertEqual(response.json()['plan']['operations'][0]['quantity'],1)
    def test_validates_references_and_geometry_before_provider(self):
        response=self.call({},mentions=[{'kind':'object','id':'missing','label':'없는 제품'}]);self.assertEqual(response.status_code,422)
        scene=copy.deepcopy(self.scene);scene['objects'][0]['x']=-100
        self.assertEqual(self.call({},scene=scene).status_code,422)
        self.assertEqual(self.call({},roomId='missing').status_code,422)
    def test_rejects_model_hallucinations_and_bad_patches(self):
        for op in [{'type':'remove','objectId':'missing'},{'type':'move','objectId':self.scene['objects'][0]['id'],'patch':{'x':'20'}},{'type':'add','assetId':'missing','roomId':self.scene['rooms'][0]['id'],'quantity':1},{'type':'add','assetId':'product:qm65c','roomId':self.scene['rooms'][0]['id'],'quantity':True},{'type':'style','style':'missing'}]:
            with self.subTest(op=op):self.assertEqual(self.call({'explanation':'test','operations':[op]}).status_code,502)
    def test_unknown_products_can_request_clarification_without_mutation(self):
        self.assertEqual(self.call({'explanation':'모델명을 알려주세요','operations':[]}).status_code,200)
    def test_large_catalogue_ids_are_validated_without_provider_enum_explosion(self):
        captured={}
        def generate(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(data={'explanation':'확인','operations':[]},model='test-provider')
        with patch('app.api.poc.provider.get_provider',return_value=(SimpleNamespace(generate_json=generate),'')):
            response=self.client.post('/api/spatial/edit',json={'prompt':'현재 공간을 확인해줘','scene':self.scene})
        self.assertEqual(response.status_code,200,response.text)
        props=captured['schema']['properties']['operations']['items']['properties']
        for key in ['objectId','assetId','roomId']:self.assertEqual(props[key],{'type':'STRING'})
        prompt=json.loads(captured['user'])
        self.assertEqual(len(prompt['scene']['objects']),len(self.scene['objects']))
        self.assertGreater(len(prompt['availableAssets']),180)
    def test_frozen_asset_revision_is_used_in_prompt(self):
        frozen=copy.deepcopy(self.library.library);frozen['sourceHash']='deadbeef';self.library.revisions['deadbeef']=frozen
        scene=copy.deepcopy(self.scene);scene['assetRevision']='deadbeef'
        captured={}
        def generate(**kwargs):captured.update(json.loads(kwargs['user']));return SimpleNamespace(data={'explanation':'확인','operations':[]},model='test-provider')
        with patch('app.api.poc.provider.get_provider',return_value=(SimpleNamespace(generate_json=generate),'')):
            response=self.client.post('/api/spatial/edit',json={'prompt':'현재 공간을 확인해줘','scene':scene})
        self.assertEqual(response.status_code,200);self.assertEqual(captured['scene']['objects'][0]['id'],scene['objects'][0]['id'])
        self.library.revisions.pop('deadbeef',None)

if __name__=='__main__':unittest.main()
