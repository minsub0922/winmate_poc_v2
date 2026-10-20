"""Second-pass read-only extraction; every output value must later pass source validation."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
import json

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'proddb/reviews/specs-20261020/catalog-review-batches'
PROMPT = '''입력은 삼성 공식 e-카탈로그에서 수집한 제품별 원문 페이지입니다.
각 제품을 하나씩 독립적으로 검토해, 해당 제품의 specs에 빠진 기술 사양/호환성/지원 기능/설치 조건/서비스 제공 범위를 추출하세요.
외부 지식, 추정 수치, 다른 제품의 값을 절대 넣지 마세요. 표에서 모델별 열 대응이 불명확하면 추출하지 마세요.
제품명, 모델명, 출처, 브랜드만을 기술 스펙으로 세지 마세요. 행 수를 채우기 위한 중복/쪼개기를 하지 마세요.
sourcePages의 해당 제품 문맥에서 입증되는 구체적인 내용만 쓰세요. value는 가능하면 원문 그대로인 짧은 문구로 쓰세요.
수치/단위/이상·이하/조건/예외를 보존하세요. 기술 사양이 전혀 없으면 rows:[]와 reason으로 한계를 명시하세요.
기존 rows도 원문에 없는 정보면 되풀이하지 마세요. 다른 제품의 내용이 같은 페이지에 섞여 있습니다.
도구를 쓰거나 파일을 수정하지 마세요. 설명/코드펜스 없이 다음 JSON 객체만 출력하세요.
{"reviews":[{"id":"입력 id 그대로","scope":"model 또는 family 또는 service","rows":[{"group":"기술 분류","name":"사양 항목","value":"확인된 값","dir":"권번호","page":1,"quote":"이 값을 뒷받침하는 입력 sourcePages의 연속된 원문 문장"}],"reason":"근거/자료 한계"}]}
입력의 모든 id를 한 번씩 반드시 반환하세요.'''


def run(file):
    output = file.with_suffix('.review.json')
    if output.exists():
        return file.name, 'cached'
    completed = subprocess.run(['claude', '-p', '--model', 'opus', PROMPT], input=file.read_text(), text=True, capture_output=True, timeout=480, cwd=ROOT)
    file.with_suffix('.review.stderr').write_text(completed.stderr)
    file.with_suffix('.review.txt').write_text(completed.stdout)
    if completed.returncode:
        return file.name, 'cli_error:' + str(completed.returncode)
    content = completed.stdout.strip()
    if content.startswith('```'):
        content = content.split('\n', 1)[1].rsplit('```', 1)[0]
    try:
        value = json.loads(content)
        expected = {p['id'] for p in json.loads(file.read_text())}
        actual = {r['id'] for r in value['reviews']}
        assert expected == actual
        output.write_text(json.dumps(value, ensure_ascii=False, indent=2))
        return file.name, 'reviewed:' + str(len(actual))
    except (ValueError, KeyError, AssertionError):
        return file.name, 'invalid_output'


if __name__ == '__main__':
    files = [p for p in DIRECTORY.glob('b[0-9][0-9].json')]
    with ThreadPoolExecutor(max_workers=2) as pool:
        for future in as_completed([pool.submit(run, p) for p in files]):
            print(*future.result(), flush=True)
