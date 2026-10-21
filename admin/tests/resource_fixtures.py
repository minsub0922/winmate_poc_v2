"""Create explicit synthetic resource fixtures in the isolated browser-test store."""
from io import BytesIO
import json
from pathlib import Path
import sys
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from admin.config import RUNTIME
from admin.store import Store
from PIL import Image
import pymupdf


def prepare(home):
    home=Path(home).resolve()
    if home==RUNTIME: raise ValueError('실제 관리자 DB에는 테스트 자료를 만들 수 없습니다.')
    uploads=home/'uploads';uploads.mkdir(parents=True,exist_ok=True)
    output=BytesIO();Image.new('RGB',(320,220),'#177e71').save(output,'PNG');picture=output.getvalue()
    with pymupdf.open() as pdf:
        page=pdf.new_page();page.insert_image(pymupdf.Rect(20,20,400,280),stream=picture)
        pdf.new_page();pdf.embfile_add('metadata.json',json.dumps({'resource_probe':'pdf attachment'}).encode())
        (uploads/'resource-probe.pdf').write_bytes(pdf.tobytes())
    with zipfile.ZipFile(uploads/'resource-probe.pptx','w') as doc:
        doc.writestr('ppt/media/image1.png',picture)
        doc.writestr('ppt/embeddings/metadata.json',json.dumps({'resource_probe':'office attachment'}))
    store=Store(home)
    for ext in ['pdf','pptx']:
        store.upsert_assets([{'id':'document:resource-probe-'+ext,'external_id':'resource-probe-'+ext,
            'kind':'document','source_id':'uploads','title':'리소스 검증 '+ext.upper(),
            'payload':{'filename':'리소스 검증.'+ext,'file_ref':'uploads/resource-probe.'+ext,'scope':'synthetic-test-fixture'},
            'content':'리소스 검증 '+ext.upper()}])


if __name__=='__main__':
    prepare(sys.argv[1] if len(sys.argv)>1 else 'admin/runtime/resources-e2e')
    print('Isolated PDF/PPTX resource fixtures ready; no LLM analysis was invoked.')
