"""Explicit authoring utility: real model reviews of synthetic, native-layout examples."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from app.api.poc.adapters.review import prepare
from app.api.poc.settings import get_settings
from app.api.poc.jobs import Job
from app.api.poc.review_schema import schema
inputs=json.loads(Path(sys.argv[1]).read_text());output=Path(sys.argv[2]);settings=get_settings()
def evaluate(e):
    implementation=hashlib.sha256(b''.join((ROOT / f).read_bytes() for f in ['app/api/poc/detailed_review.py','app/api/poc/backends.py','app/api/poc/provider.py'])).hexdigest()
    digest=hashlib.sha256(json.dumps({'body':e['body'],'schema':schema(),'implementation':implementation},sort_keys=True).encode()).hexdigest();cache=output.with_name(e['sid']+'-model-result.json')
    if cache.exists():
        saved=json.loads(cache.read_text())
        if saved['source_sha256']==digest:return saved['result']
    plan=prepare(e['body'],settings);job=Job('review','Linked example '+e['sid'],{},200)
    try:
        result=plan.fn(job)
    except Exception as exc:
        tracker=job.ctx.get('tracker')
        detail={'error':exc.public() if hasattr(exc,'public') else str(exc),'llm':tracker.summary(status='error') if tracker else None}
        output.with_name(e['sid']+'-failure.json').write_text(json.dumps(detail,ensure_ascii=False,indent=2))
        print('Actual review failed:',e['sid'],getattr(exc,'detail',str(exc)),flush=True)
        raise
    ev=result['evaluation'];assert ev['criteria_version']==schema()['version'] and ev['scores'] and all(s['mode']=='llm' for s in ev['scores'])
    assert {s['id'] for s in ev['scores']}=={c['id'] for c in schema()['criteria']}
    assert result['llm']['effective']=='llm' and not result['llm'].get('fallbacks')
    cache.write_text(json.dumps({'source_sha256':digest,'result':result},ensure_ascii=False));print('Actual review complete:',e['sid'],len(ev['scores']),'criteria',flush=True)
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(evaluate,inputs))
output.write_text(json.dumps(results,ensure_ascii=False));print('All linked examples evaluated with real models.',flush=True)
