"""Resource contracts, real file decoding, and authorization/path boundaries."""
from io import BytesIO
import base64
import gzip
import json
from pathlib import Path
import zipfile

from fastapi.testclient import TestClient
import pytest
from admin import server
from PIL import Image
from admin.resources import ResourceLibrary, resource_bytes, layout_preview, resources_for
from admin.service import Service
from admin.store import Store
from app.api.auth import Auth, AuthConfig


def write(root, path, value):
    target=root/path;target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(value,ensure_ascii=False));return target


def picture(color='green'):
    out=BytesIO();Image.new('RGB',(600,400),color).save(out,'PNG');return out.getvalue()


def asset(identifier='product:one',kind='product',payload=None,path=''):
    return {'id':identifier,'external_id':identifier.split(':',1)[1],'source_id':'samsung',
            'title':'테스트 자료','kind':kind,'payload':payload or {},'path':path,'content':'test'}


@pytest.fixture
def files(tmp_path):
    root=tmp_path/'repo';store=Store(tmp_path/'state')
    raw=picture();data='data:image/png;base64,'+base64.b64encode(raw).decode()
    write(root,'app/data/images.json',{'pids':{'test.front':{'file':'img/front.png','desc':'정면','w':600,'h':400}}})
    write(root,'app/data/static/img/prod/g00.json',{'images':[data,None,data]})
    (root/'app/data/static/img/front.png').write_bytes(raw)
    (root/'img').mkdir();(root/'img/front.png').write_bytes(picture('red'))
    write(root,'img/lib/index.json',{'images':[{'i':'im-one','a':'img/prod/g00.json#2','p':['one'],'d':'관련 장면'},
                                              {'i':'im-wrong','a':'img/must-not-match.png','p':['another'],'m':['SAME-MODEL']}]})
    write(root,'proddb/imglib/index.json',{'images':[]})
    return root,store,raw,data


def test_product_primary_gallery_exact_relations_and_mount_precedence(files):
    root,store,raw,_=files
    a=asset(payload={'img':'test.front','model':'SAME-MODEL','th':'img/prod/g00.json#0',
                     'gal':['img/prod/g00.json#0','img/prod/g00.json#2'],'galAlt':['앞면','설치']})
    manifest=ResourceLibrary(store,root).manifest(a)
    p=manifest.page()
    assert p['primary']['address']=='img/front.png'
    assert p['missing']==0
    assert not any('must-not-match' in i['address'] for i in manifest.items.values())
    item=next(i for i in manifest.items.values() if i['address']=='img/front.png')
    assert resource_bytes(item)[0]==raw
    assert item['_file']!=root/'img/front.png'
    assert len([i for i in manifest.items.values() if i['address']=='img/prod/g00.json#0'])==1
    assert p['kinds']['image']==3
    assert all(not any(k.startswith('_') for k in i) for i in p['items'])


def test_pack_slot_zero_null_pagination_and_individual_thumbnail(files):
    root,store,_,_=files
    a=asset('pack:app/data/static/img/prod/g00.json','pack',path='app/data/static/img/prod/g00.json')
    m=ResourceLibrary(store,root).manifest(a)
    p=m.page(kind='image',offset=1,limit=1)
    assert p['total']==3 and p['missing']==1
    assert p['items'][0]['label']=='이미지 2 · 슬롯 1' and not p['items'][0]['available']
    first=next(i for i in m.items.values() if i.get('_slot')==0)
    raw,mime=resource_bytes(first,thumb=True)
    assert mime=='image/webp'
    with Image.open(BytesIO(raw)) as image: assert image.width==360 and image.height==240
    assert 'bytes' not in first  # Must not present the whole pack size as image bytes.
    assert m.page(kind='image',q='슬롯 0')['total']==1


def test_registered_file_and_alias_are_deduplicated(files):
    root,store,_,_=files
    a=asset('image:app/test.front','image',{'file':'img/front.png'},path='app/data/static/img/front.png')
    m=ResourceLibrary(store,root).manifest(a)
    assert m.page()['kinds']['image']==1


def test_unsafe_paths_runtime_and_symlink_escape_are_not_exposed(files,tmp_path):
    root,store,_,_=files
    secret=tmp_path/'auth-secret.txt';secret.write_text('private')
    (root/'img/escape.txt').symlink_to(secret)
    lib=ResourceLibrary(store,root)
    for address in ['../auth-secret.txt','img/../../auth-secret.txt','img/%2e%2e/../../auth-secret.txt',
                    'app/data/runtime/auth/credentials.json','admin/runtime/operations.sqlite','img/escape.txt',
                    'app/data/runtime/kb/../../auth/credentials.json']:
        assert lib.local(address) is None,address
    a=asset(payload={'url':'file:///etc/passwd','gallery':['img/escape.txt','admin/runtime/operations.sqlite']})
    m=lib.manifest(a)
    assert not any(i['available'] for i in m.items.values() if i['address']=='img/escape.txt')
    assert not any(i['address'].startswith('file:') for i in m.items.values())


def test_upload_and_embedded_office_images_and_attachments(files):
    root,store,_,_=files
    uploads=store.home/'uploads';uploads.mkdir()
    path=uploads/'sample.pptx'
    with zipfile.ZipFile(path,'w') as archive:
        archive.writestr('ppt/media/image1.png',picture())
        archive.writestr('ppt/media/image2.svg','<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
        archive.writestr('ppt/embeddings/book.xlsx',b'embedded-workbook')
        archive.writestr('private.txt','not a resource')
    a=asset('document:office','document',{'file_ref':'uploads/sample.pptx','filename':'발표.pptx'})
    m=ResourceLibrary(store,root).manifest(a)
    assert m.page()['missing']==0
    embedded=[i for i in m.items.values() if 'embedded' in i['groups']]
    assert len(embedded)==3
    assert resource_bytes(next(i for i in embedded if i['kind']=='document'))[0]==b'embedded-workbook'
    assert m.page(group='embedded')['total']==3
    assert not any('private.txt' in i['address'] for i in embedded)


def test_pdf_pages_images_and_attachments_are_actual_decodable_resources(files):
    import pymupdf
    root,store,_,_=files
    uploads=store.home/'uploads';uploads.mkdir();path=uploads/'sample.pdf'
    with pymupdf.open() as doc:
        p=doc.new_page();p.insert_image(pymupdf.Rect(20,20,220,180),stream=picture())
        doc.new_page();doc.embfile_add('data.txt',b'actual attachment');doc.save(path)
    m=ResourceLibrary(store,root).manifest(asset('document:pdf','document',{'file_ref':'uploads/sample.pdf','filename':'원본.pdf'}))
    assert m.page()['missing']==0
    pages=[i for i in m.items.values() if '_pdf_page' in i]
    assert len(pages)==2 and len([i for i in m.items.values() if '_pdf_image' in i])==1
    raw,mime=resource_bytes(pages[0],thumb=True)
    assert mime=='image/webp' and len(raw)>0
    attachment=next(i for i in m.items.values() if '_pdf_attachment' in i)
    assert resource_bytes(attachment)[0]==b'actual attachment'


def test_layout_uses_fill_instead_of_placeholder_and_preview_is_sandboxable(files):
    root,store,_,_=files
    target=root/'app/data/runtime/kb/layout_html.json.gz';target.parent.mkdir(parents=True)
    html='<div><img onerror="alert(1)" src="data:image/gif;base64,R0lGODlhAQABAIAAA" data-fill="img/prod/g00.json#0" alt="실제 사진"><script>alert(1)</script><iframe src="https://example.com"></iframe></div>'
    target.write_bytes(gzip.compress(json.dumps({'L_TEST':html}).encode()))
    m=ResourceLibrary(store,root).manifest(asset('layout:L_TEST','layout',{'f':'L_TEST'}))
    assert m.page()['kinds']['image']==1
    assert not any(i['address']=='[문서 내 이미지]' for i in m.items.values())
    preview=layout_preview(html,m)
    assert 'data-fill=' in preview and 'src="/admin/api/asset-resources/' in preview
    assert 'onerror=' not in preview and '<script>' not in preview and '<iframe' not in preview
    assert "script-src 'none'" in preview
    assert 'alert(1)' not in preview


def test_layout_css_background_queries_and_hidden_parent_directory(files,tmp_path):
    root,store,_,_=files
    hidden=tmp_path/'.worktrees';hidden.mkdir();relocated=hidden/'repo';root.rename(relocated)
    target=relocated/'app/data/runtime/kb/layout_html.json.gz';target.parent.mkdir(parents=True)
    html='<style>.photo{background-image:url(img/prod/g00.json#0)}</style><div style="background:url(\'img/front.png?v=2\')"></div>'
    target.write_bytes(gzip.compress(json.dumps({'L_TEST':html}).encode()))
    lib=ResourceLibrary(store,relocated)
    assert lib.local('img/front.png?v=2').is_file()
    m=lib.manifest(asset('layout:L_TEST','layout',{'f':'L_TEST'}))
    assert m.page()['missing']==0
    preview=layout_preview(html,m)
    assert 'background-image:url("/admin/api/asset-resources/' in preview
    assert 'background:url(&quot;/admin/api/asset-resources/' in preview


def test_uploaded_json_pack_and_nonbase64_svg_are_visible(files):
    root,store,_,data=files
    uploads=store.home/'uploads';uploads.mkdir()
    write(uploads,'images.json',{'images':[data,'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3C/svg%3E']})
    m=ResourceLibrary(store,root).manifest(asset('document:json','document',{'filename':'images.json','file_ref':'uploads/images.json'}))
    assert m.page()['missing']==0 and m.page(kind='image')['total']==2
    svg=next(i for i in m.items.values() if i.get('_slot')==1)
    raw,mime=resource_bytes(svg)
    assert mime=='image/svg+xml' and raw.startswith(b'<svg')


def test_tiff_preview_is_browser_readable_but_original_is_preserved(files):
    root,store,_,_=files
    path=root/'img/legacy.tiff';Image.new('RGB',(400,200),'purple').save(path,'TIFF')
    m=ResourceLibrary(store,root).manifest(asset('file:img/legacy.tiff','file',path='img/legacy.tiff'))
    item=next(i for i in m.items.values() if i['kind']=='image')
    assert resource_bytes(item)[1]=='image/webp'
    assert resource_bytes(item,original=True)[0]==path.read_bytes()


def test_media_integer_codes_and_original_dictionary_are_resolved(files):
    root,store,_,_=files
    write(root,'app/data/media.json',{'P':['img/prod/g00.json'],'D':['~/path/'],
        'sol':{'test':{'th':0,'pages':['https://www.samsung.com/sec/business/'],
                       'g':[[2,'s','현장',600,400,'^0|original.jpg',0]]}}})
    m=ResourceLibrary(store,root).manifest(asset('solution:test','solution',{'id':'test'}))
    assert m.page()['primary']['address']=='img/prod/g00.json#0'
    assert any(i['address']=='https://images.samsung.com/path/original.jpg' for i in m.items.values())
    assert m.page(kind='image')['total']==3


def test_manifest_cache_tracks_local_removal_and_replacement(files):
    root,store,_,_=files
    a=asset('image:app/test.front','image')
    first=resources_for(store,a,root)
    assert first.page()['missing']==0
    (root/'app/data/static/img/front.png').unlink()
    (root/'img/front.png').unlink()
    second=resources_for(store,a,root)
    assert second is not first and second.page()['missing']==1


@pytest.fixture
def client(files,tmp_path,monkeypatch):
    root,store,_,_=files
    svc=Service(store.home)
    auth=Auth(AuthConfig(auth_dir=tmp_path/'auth'));auth.set_credentials('admin','isolated-resource-password')
    monkeypatch.setattr(server,'store',store);monkeypatch.setattr(server,'service',svc)
    monkeypatch.setattr(server.winmate.state,'auth',auth)
    monkeypatch.setattr(server,'resources_for',lambda s,a:resources_for(s,a,root))
    token,_=auth.issue_token()
    with TestClient(server.api) as c:
        c.cookies.set(auth.config.cookie_name,token)
        yield c,store
    svc.close()


def test_resource_routes_require_asset_membership_and_authorization(client):
    c,store=client
    store.upsert_assets([asset(payload={'gal':['img/prod/g00.json#0']}),asset('product:two')])
    response=c.get('/api/assets/product:one/resources');assert response.status_code==200
    item=next(i for i in response.json()['items'] if i['kind']=='image')
    url=item['url'].replace('/admin','',1)
    assert c.get(url).headers['content-type']=='image/png'
    downloaded=c.get(url+'&download=1')
    assert downloaded.status_code==200 and downloaded.headers['content-disposition'].startswith('attachment;')
    assert c.get(url.replace('product%3Aone','product%3Atwo')).status_code==404
    assert c.get('/api/asset-resources/arbitrary?asset=product:one&path=/etc/passwd').status_code==404
    c.cookies.clear();assert c.get(url).status_code==401


def test_api_missing_slot_data_preview_and_svg_cannot_execute(client,files):
    c,store=client;root=files[0]
    store.upsert_assets([asset('pack:app/data/static/img/prod/g00.json','pack',path='app/data/static/img/prod/g00.json')])
    rows=c.get('/api/assets/pack:app%2Fdata%2Fstatic%2Fimg%2Fprod%2Fg00.json/resources').json()['items']
    missing=next(i for i in rows if not i['available'])
    assert c.get(missing['url'].replace('/admin','',1)).status_code==404
    data=next(i for i in rows if i['label']=='에셋 데이터.json')
    assert c.get(data['preview_url'].replace('/admin','',1)).json()['text']=='{}'
    path=root/'img/active.svg';path.write_text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    store.upsert_assets([asset('file:img/active.svg','file',path='img/active.svg')])
    item=c.get('/api/assets/file:img%2Factive.svg/resources').json()['primary']
    r=c.get(item['url'].replace('/admin','',1))
    assert r.headers['content-security-policy']=="default-src 'none'; sandbox"
    assert r.headers['x-content-type-options']=='nosniff'
