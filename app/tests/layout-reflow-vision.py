# Independent real vision review of actual source/candidate screenshots.
# Run: app/.venv/bin/python app/tests/layout-reflow-vision.py L_PH_P3_A:2 ...
# Gate: exact visible count, acceptable, no critical defects, six concrete visual checks. Numeric scores are diagnostic.
import sys,json,base64,time,hashlib
from pathlib import Path
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root))
from app.api.poc.settings import get_settings
from app.api.poc.provider import GeminiProvider,ProviderError
folder=root/'app/tests/output/layout-refine'
p=GeminiProvider(get_settings())
cases=sys.argv[1:] or ['L_PH_P3_A:2']
failures=[]
for item in cases:
 f,n=item.split(':');stem=f+'-'+n; result=json.loads((folder/(stem+'.json')).read_text())
 if not result.get('ok'):
  failures.append(item);print('FAIL source generation',item,flush=True);continue
 raw=[(folder/(name+'.png')).read_bytes() for name in [f,stem]]
 images=['data:image/png;base64,'+base64.b64encode(data).decode() for data in raw]
 prompt=f'''당신은 독립적인 삼성 B2B PPT 시각 품질 검토자입니다. 첫 이미지는 원본 {f}, 두 번째는 제품 수를 {n}개로 바꾼 편집용 템플릿의 실제 픽셀입니다. 요청된 개수 변경, 행/열 재배치, 추가 제품을 정직한 빈 입력 칸으로 제공하는 것은 의도한 동작입니다. 개수가 늘어나면서 읽을 수 있는 범위에서 사진·문구가 작아진 사실 자체는 결함으로 분류하지 마세요. 하지만 읽기 어려운 글자, 중요한 피사체 손실, 겹침, 잘림, 원본 스타일을 무시한 프레임이나 비례, 사용하기 어려운 정도의 균형 저하는 엄격히 찾으세요. 화면을 본 근거로만 판단하세요.
다음 여섯 체크를 각각 pass와 구체적 reason으로 답하세요: legibility(원본 정보와 빈 입력 문구를 편하게 읽을 수 있는가), image_recognition(제품과 설치 장면의 핵심 피사체를 식별할 수 있는가), no_clipping(글·사진의 실수로 인한 잘림/겹침이 없는가), style(원본 색·폰트·제품 컷 위계/카드 계열을 이어가는가), alignment(행·열과 이미지·문구가 정돈되었는가), balance(요청된 개수에서 사진/문구와 여백이 실무용 제안서 수준으로 균형 잡혔는가).
acceptable은 여섯 체크를 모두 통과하고 전문적인 편집용 템플릿으로 품질이 유지될 때만 true입니다. 사소한 개선 가능성과 실제 품질 실패를 구분하세요. 원본과 결과의 점수도 참고용으로 0~10으로 주되 판정과 일관되게 작성하세요. 동일 픽셀의 점수가 호출마다 변동하는 문제 때문에 점수 차이만으로 합불을 정하지 않습니다. 실제 결함이 있다면 솔직히 실패로 판단하세요.
JSON만 답하세요: {{"before_score":0,"after_score":0,"visible_count":0,"acceptable":true,"checks":{{"legibility":{{"pass":true,"reason":""}},"image_recognition":{{"pass":true,"reason":""}},"no_clipping":{{"pass":true,"reason":""}},"style":{{"pass":true,"reason":""}},"alignment":{{"pass":true,"reason":""}},"balance":{{"pass":true,"reason":""}}}},"issues":[],"critical_issues":[],"rationale":"한국어 설명"}}. 예시 값은 실제 판단으로 대체하세요.'''

 try:
  r=p.generate_json(stage='layout-reflow:paired-vision',model=p.model_for('vision'),user=prompt,images=images,max_output_tokens=3072,max_attempts=3,cache_allowed=False)
  d=r.data; checks=d.get('checks',{})
  required=('legibility','image_recognition','no_clipping','style','alignment','balance')
  passed=bool(d.get('acceptable')) and d.get('visible_count')==int(n) and not d.get('critical_issues') and all(checks.get(k,{}).get('pass') is True for k in required)
  record={'case':item,'source_sha256':hashlib.sha256(raw[0]).hexdigest(),'candidate_sha256':hashlib.sha256(raw[1]).hexdigest(),'pass':passed,'model':r.model,'ms':r.ms,'usage':{'input':r.prompt_tokens,'output':r.output_tokens,'attempts':r.attempts},'result':d}
  (folder/(stem+'-vision.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2))
  print(json.dumps(record,ensure_ascii=False),flush=True)
  if not passed:failures.append(item)
 except ProviderError as e:
  print(json.dumps({'case':item,'error':e.code,'message':p.safe(e.message)},ensure_ascii=False),flush=True)
  failures.append(item)
  (folder/(stem+'-vision.json')).write_text(json.dumps({'case':item,'pass':False,'error':e.code,'message':p.safe(e.message)},ensure_ascii=False,indent=2))

if failures:
 print(json.dumps({"failed":failures},ensure_ascii=False),flush=True)
 raise SystemExit(1)
