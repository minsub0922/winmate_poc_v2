"""Reviewed model corrections refresh the UI cache without touching source data."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile


def test_reviewed_model_change_invalidates_projection_and_updates_runtime_ledger():
    script=Path(__file__).resolve().parents[1]/'scripts/prepare_data.py'
    spec=importlib.util.spec_from_file_location('projection_refresh_fixture',script)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp);data=root/'app/data';source=root/'proddb/winmate_products.sqlite'
        (data/'static/img/prod').mkdir(parents=True);(data/'product-details').mkdir();source.parent.mkdir()
        products=[{'id':f'p{i}','name':f'Product {i}','model':f'M{i}','d':0} for i in range(1068)]
        (data/'catalog.json').write_text(json.dumps({'products':products[:40]}))
        (data/'products_db.json').write_text(json.dumps({'curated':{},'products':products[40:]}))
        (data/'layouts.b64').write_text('fixture');(data/'static/index.html').write_text('fixture')
        before={'specProductId':'p0','specModel':'75-inch','specReviewedAt':'2026-10-19','specs':[['Size','W × H × D','1774.8 × 1053.4 × 130 mm']]}
        after={**before,'specModel':'55-inch','specReviewedAt':'2026-10-20','specs':[['Size','W × H × D','1260.6 × 731.4 × 85 mm']]}
        (data/'static/img/prod/d00.json').write_text(json.dumps({'items':{'p0':before}}))
        with sqlite3.connect(source) as db:
            db.executescript('CREATE TABLE product_family(id TEXT,goods_id TEXT); CREATE TABLE product_spec_review(id TEXT PRIMARY KEY,model TEXT NOT NULL,reviewed_at TEXT NOT NULL,detail_json TEXT NOT NULL);')
            db.execute('INSERT INTO product_spec_review VALUES (?,?,?,?)',('p0','75-inch','2026-10-19',json.dumps(before)))
        module.ROOT=root;module.DATA=data;module.DATABASE=data/'runtime/winmate_products.sqlite'
        database=module.prepare();stamp=database.stat().st_mtime_ns
        assert module.prepare().stat().st_mtime_ns==stamp,'unchanged inputs should retain the existing projection'
        (data/'product-details/d00.json').write_text(json.dumps({'items':{'p0':after}}))
        module.prepare()
        with sqlite3.connect(database) as db:
            assert json.loads(db.execute('SELECT payload FROM wm_ui_detail WHERE id="p0"').fetchone()[0])==after
            row=db.execute('SELECT model,detail_json FROM product_spec_review WHERE id="p0"').fetchone()
            assert row[0]=='55-inch' and json.loads(row[1])==after
        with sqlite3.connect(source) as db:
            assert json.loads(db.execute('SELECT detail_json FROM product_spec_review WHERE id="p0"').fetchone()[0])==before
