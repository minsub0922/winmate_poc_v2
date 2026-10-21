import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from app.api.spatial import SpatialLibrary, SpatialStore


class SpatialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.library=SpatialLibrary()

    def test_every_prebuilt_scene_validates(self):
        for identifier,scene in self.library.scenes.items():
            with self.subTest(identifier=identifier):self.library.validate(scene)
        self.assertEqual(len(self.library.scenes),self.library.library['counts']['templates'])

    def test_all_catalog_products_and_industries_covered(self):
        data=Path(__file__).resolve().parents[1]/'data'
        cat=json.loads((data/'catalog.json').read_text());db=json.loads((data/'products_db.json').read_text())
        actual={a['productId'] for a in self.library.assets.values() if a.get('productId')}
        self.assertEqual(actual,{p['id'] for p in cat['products']+db['products']})
        for ind in cat['industries']:
            for scope in ('single','full'):
                for variant in ('compact','standard','spacious'):
                    self.assertTrue(any(t['industry']==ind['code'] and t['scope']==scope and t['variant']==variant for t in self.library.templates.values()))

    def test_admin_seed_is_account_scoped_and_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library)
            self.assertEqual(len(store.list('admin')),10);self.assertEqual(store.list('other'),[])
            identifier=store.list('admin')[0]['id'];store.delete('admin',identifier);store.seed_admin()
            self.assertEqual(len(store.list('admin')),9)
            with self.assertRaises(HTTPException) as raised:store.get('other',store.list('admin')[0]['id'])
            self.assertEqual(raised.exception.status_code,404)

    def test_save_reopen_revision_and_cross_account_protection(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library);scene=copy.deepcopy(self.library.examples[0]['scene'])
            result=store.save('designer',{'scene':scene,'view':'3d'})
            self.assertEqual(store.get('designer',result['id'])['scene'],scene)
            scene['title']='수정한 공간';updated=store.save('designer',{'scene':scene,'view':'2d','revision':1},result['id']);self.assertEqual(updated['revision'],2)
            with self.assertRaises(HTTPException) as raised:store.save('designer',{'scene':scene,'revision':1},result['id'])
            self.assertEqual(raised.exception.status_code,409)
            with self.assertRaises(HTTPException) as raised:store.delete('other',result['id'])
            self.assertEqual(raised.exception.status_code,404)

    def test_blank_studio_draft_and_incomplete_form_survive_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library)
            draft=store.create_draft('designer',{})
            self.assertTrue(draft['id'].startswith('sp-'));self.assertIsNone(draft['scene']);self.assertEqual(draft['status'],'draft');self.assertEqual(draft['form']['rooms'],[]);self.assertEqual(draft['form']['industry'],'')
            form=copy.deepcopy(draft['form']);form['industry']='OF';form['rooms']=[{'id':'room-1','name':'','kind':'meeting','width':'','depth':'','capacity':'','products':[{'productId':'flip','quantity':1}]}]
            updated=store.save_form('designer',draft['id'],{'form':form,'revision':draft['revision'],'view':'2d'})
            reopened=store.get('designer',draft['id']);self.assertEqual(reopened['form'],form);self.assertIsNone(reopened['scene']);self.assertEqual(reopened['id'],draft['id']);self.assertEqual(reopened['revision'],2)
            with self.assertRaises(HTTPException) as raised:store.save_form('designer',draft['id'],{'form':form,'revision':1})
            self.assertEqual(raised.exception.status_code,409)
            with self.assertRaises(HTTPException) as raised:store.get('other',draft['id'])
            self.assertEqual(raised.exception.status_code,404)

    def test_draft_generation_keeps_id_and_subsequent_input_edits_keep_scene(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library);draft=store.create_draft('designer',{})
            scene=copy.deepcopy(self.library.examples[0]['scene']);form=draft['form'];form['title']='입력한 조감도';form['industry']='OF'
            result=store.save('designer',{'scene':scene,'form':form,'view':'3d','revision':draft['revision']},draft['id'])
            self.assertEqual(result['id'],draft['id']);self.assertEqual(result['status'],'ready');self.assertEqual(result['scene'],scene)
            form['title']='입력만 수정';updated=store.save_form('designer',draft['id'],{'form':form,'revision':result['revision'],'sceneFormKey':'01234567'})
            self.assertEqual(updated['scene'],scene);self.assertEqual(updated['generatedFormKey'],'01234567');self.assertEqual(updated['form']['title'],'입력만 수정')

    def test_template_draft_has_its_existing_scene_and_ready_preview(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library)
            form={'version':1,'title':'공유오피스 검토','industry':'OF','style':'modern','templateId':'cowork-full-standard','rooms':[]}
            document=store.create_draft('designer',{'form':form,'view':'2d'})
            expected=self.library.scenes['cowork-full-standard']
            self.assertEqual(document['status'],'ready');self.assertEqual(document['scene'],expected);self.assertEqual(document['form'],form)
            listed=store.list('designer')[0];self.assertEqual(listed['status'],'ready');self.assertEqual(listed['preview'],expected)
            self.assertEqual(listed['rooms'],len(expected['rooms']));self.assertGreater(listed['products'],0)
            form['templateId']='removed-template';missing=store.create_draft('designer',{'form':form})
            self.assertIsNone(missing['scene']);self.assertEqual(missing['status'],'draft')

    def test_explicit_furniture_selection_survives_draft_and_form_save(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library)
            form={'version':1,'title':'선택한 가구','industry':'OF','style':'modern','rooms':[{'id':'room-1','name':'업무실','kind':'office','products':[{'productId':'qm65c','quantity':1}],'furniture':[{'assetId':'furniture:cafe-bentwood','quantity':1}]}]}
            document=store.create_draft('designer',{'form':form});self.assertEqual(document['form'],form)
            form['rooms'][0]['furniture'][0]['quantity']=2;updated=store.save_form('designer',document['id'],{'form':form,'revision':document['revision']});self.assertEqual(updated['form'],form)
            for item in [{'assetId':'product:qm65c','quantity':1},{'assetId':'missing','quantity':1},{'assetId':'furniture:cafe-bentwood','quantity':31}]:
                invalid=copy.deepcopy(form);invalid['rooms'][0]['furniture']=[item]
                with self.assertRaises(ValueError):self.library.validate_form(invalid)

    def test_legacy_template_history_recovers_without_losing_inputs_or_revision(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library)
            form={'version':1,'title':'사용자가 수정한 이름','industry':'OF','style':'warm','templateId':'cowork-full-standard','rooms':[{'id':'new-room','name':'추가할 공간','kind':'meeting','products':[]}]}
            document=store.create_draft('designer',{'form':form,'view':'3d'})
            with store.connect() as db:db.execute("UPDATE scenes SET scene='null',status='draft' WHERE owner='designer' AND id=?",(document['id'],))
            self.assertEqual(store.list('other'),[])
            with store.connect() as db:self.assertEqual(db.execute('SELECT scene FROM scenes WHERE id=?',(document['id'],)).fetchone()['scene'],'null')
            listed=store.list('designer')[0];reopened=store.get('designer',document['id']);expected=self.library.scenes['cowork-full-standard']
            self.assertEqual(listed['status'],'ready');self.assertEqual(listed['preview'],expected);self.assertEqual(reopened['scene'],expected);self.assertEqual(reopened['form'],form)
            for key in ('id','revision','created_at','updated_at'):self.assertEqual(reopened[key],document[key])
            changed=copy.deepcopy(expected);changed['camera']['zoom']=2
            with patch.dict(self.library.scenes,{'cowork-full-standard':changed}):self.assertEqual(store.get('designer',document['id'])['scene'],expected)

    def test_existing_history_scene_is_preserved_even_with_stale_draft_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library);scene=copy.deepcopy(self.library.examples[0]['scene']);scene['camera']['zoom']=1.4
            document=store.save('designer',{'scene':scene,'view':'3d'})
            with store.connect() as db:db.execute("UPDATE scenes SET status='draft' WHERE owner='designer' AND id=?",(document['id'],))
            self.assertEqual(store.list('designer')[0]['status'],'ready');self.assertEqual(store.list('designer')[0]['preview'],scene)
            self.assertEqual(store.get('designer',document['id'])['scene'],scene)

    def test_rejects_invalid_geometry_and_references(self):
        original=self.library.examples[0]['scene']
        for mutate in [lambda s:s.update(width=float('nan')),lambda s:s['objects'][0].update(assetId='product:missing'),
                       lambda s:s['objects'][0].update(x=-4),lambda s:s['objects'][0].update(elevation=999),
                       lambda s:s['objects'][0].update(rotation='90'),lambda s:s['rooms'][0].update(x=-1)]:
            scene=copy.deepcopy(original);mutate(scene)
            with self.assertRaises(ValueError):self.library.validate(scene)

    def test_rejects_obstructed_door_and_colliding_objects(self):
        scene=copy.deepcopy(self.library.examples[0]['scene']);room=scene['rooms'][0]
        scene['objects'].append({'id':'obstruction','assetId':'furniture:chair','roomId':room['id'],'x':room['x']+room['width']/2,'z':room['z']+room['depth']-.5,'elevation':0,'rotation':0})
        with self.assertRaisesRegex(ValueError,'출입문'):self.library.validate(scene)
        scene=copy.deepcopy(self.library.examples[0]['scene']);o=next(o for o in scene['objects'] if o['assetId']=='furniture:plant')
        scene['objects'].append({**o,'id':'overlap'})
        with self.assertRaisesRegex(ValueError,'겹칩니다'):self.library.validate(scene)

    def test_saved_asset_revision_survives_catalog_dimension_changes(self):
        frozen=copy.deepcopy(self.library.library);frozen['sourceHash']='deadbeef';self.library.revisions['deadbeef']=frozen
        scene=copy.deepcopy(self.library.examples[0]['scene']);scene['assetRevision']='deadbeef'
        placed=next(o['assetId'] for o in scene['objects'] if o['assetId'].startswith('product:'))
        asset=next(a for a in self.library.library['assets'] if a['id']==placed);size=asset['size']
        try:
            asset['size']=[100,100,100]
            self.library.validate(scene)
            current=copy.deepcopy(scene);current['assetRevision']=self.library.library['sourceHash']
            with self.assertRaises(ValueError):self.library.validate(current)
        finally:
            asset['size']=size;self.library.revisions.pop('deadbeef',None)


    def test_custom_room_purpose_is_saved_and_validated(self):
        form={'version':1,'title':'직접 입력','industry':'OF','style':'modern','rooms':[{'id':'custom-room','name':'준비실','kind':'lounge','customPurpose':'크리에이터 촬영 준비 공간','products':[]}]}
        with tempfile.TemporaryDirectory() as tmp:
            store=SpatialStore(Path(tmp)/'history.sqlite',self.library)
            draft=store.create_draft('designer',{'form':form})
            self.assertEqual(store.get('designer',draft['id'])['form']['rooms'][0]['customPurpose'],'크리에이터 촬영 준비 공간')
        for purpose in [123,'a'*101]:
            invalid=copy.deepcopy(form);invalid['rooms'][0]['customPurpose']=purpose
            with self.assertRaises(ValueError):self.library.validate_form(invalid)


if __name__=='__main__':unittest.main()
