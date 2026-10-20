import copy
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from app.api.spatial import SpatialLibrary,build_router
from app.api.spatial_descriptions import description_context,generate_description


class DescriptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lib=SpatialLibrary();cls.scene=copy.deepcopy(cls.lib.examples[0]['scene'])
        cls.assets={a['id']:a for a in cls.lib.revision(cls.scene.get('assetRevision'))['assets']}

    def provider(self,text='현재 공간의 제품 구성을 활용한 편리한 사용 환경을 제안합니다.'):
        return SimpleNamespace(generate_json=lambda **kwargs:SimpleNamespace(data={'description':text},model='test'))

    def test_room_lists_exact_quantities_and_empty_rooms(self):
        room=self.scene['rooms'][0];context=description_context(self.scene,self.assets,'room:'+room['id'])
        expected=[o for o in self.scene['objects'] if o['roomId']==room['id'] and self.assets[o['assetId']].get('productId')]
        self.assertEqual(sum(p['quantity'] for p in context['products']),len(expected))
        text=generate_description(context,self.provider())['text']
        for p in context['products']:self.assertIn(f"{p['quantity']}대",text);self.assertIn(p['name'],text)
        empty={**self.scene,'objects':[]};self.assertIn('배치된 삼성 제품 없음',generate_description(description_context(empty,self.assets,'room:'+room['id']),self.provider())['text'])

    def test_product_details_come_from_catalogue_not_model(self):
        obj=next(o for o in self.scene['objects'] if self.assets[o['assetId']].get('productId'))
        product_id=self.assets[obj['assetId']]['productId']
        repo=SimpleNamespace(get=lambda identifier:{'d':0,'spec':'등록된 주요 사양','cat':'디스플레이'},detail_pack=lambda pack:{'items':{product_id:{'specs':[['일반','밝기','500nit']],'feats':[{'h':'등록된 특징'}]}}})
        context=description_context(self.scene,self.assets,obj['id'],repo);text=generate_description(context,self.provider())['text']
        for expected in ['제품 상세','등록된 주요 사양','500nit','등록된 특징','오브젝트 크기']:self.assertIn(expected,text)
        self.assertEqual(context['room'],next(r['name'] for r in self.scene['rooms'] if r['id']==obj['roomId']))
        repo.detail_pack=lambda pack:{'items':{product_id:{'specScope':'family','specs':[['일반','밝기','9999nit']]}}}
        self.assertNotIn('9999nit',generate_description(description_context(self.scene,self.assets,obj['id'],repo),self.provider())['text'])

    def test_furniture_and_unknown_targets_are_rejected(self):
        furniture=next(o for o in self.scene['objects'] if not self.assets[o['assetId']].get('productId'))
        for target in [furniture['id'],'room:missing',None,{}]:
            with self.assertRaises(HTTPException) as err:description_context(self.scene,self.assets,target)
            self.assertEqual(err.exception.status_code,422)

    def test_endpoint_validates_source_and_does_not_fallback_on_bad_ai(self):
        app=FastAPI();app.state.spatial_library=self.lib;app.state.auth=SimpleNamespace(config=SimpleNamespace(enabled=False));app.include_router(build_router())
        with TestClient(app) as client,patch('app.api.poc.provider.get_provider',return_value=(self.provider(),'')):
            body={'scene':self.scene,'targetId':'room:'+self.scene['rooms'][0]['id']}
            response=client.post('/api/spatial/layout-description',json=body);self.assertEqual(response.status_code,200);self.assertEqual(response.json()['source'],'llm')
            self.assertEqual(client.post('/api/spatial/layout-description',json={**body,'scene':{}}).status_code,422)
            with patch('app.api.poc.provider.get_provider',return_value=(self.provider(''),'')):
                self.assertEqual(client.post('/api/spatial/layout-description',json=body).status_code,502)


if __name__=='__main__':unittest.main()
