"""Verify final real-provider artifacts and their independently reviewed PNG hashes."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'app/tests/output/layout-refine'
CASES = [("L_PH_P3_A", n) for n in (1, 2, 4, 5, 6, 7, 8)] + [("L_PH_P5_A", n) for n in (2, 4, 6)] + [("L_PH_P2_C", 3), ("L_P3B", 2)]
CHECKS = ('legibility', 'image_recognition', 'no_clipping', 'style', 'alignment', 'balance')
read = lambda name: json.loads((OUT / name).read_text())
sha = lambda name: hashlib.sha256((OUT / name).read_bytes()).hexdigest()
reports = [(p.name, json.loads(p.read_text())) for p in sorted(OUT.glob('live-report-*.json'))]
rows, failures = [], []
for f, count in CASES:
    stem = f'{f}-{count}'
    result, vision = read(stem + '.json'), read(stem + '-vision.json')
    primary = vision
    observed = primary.get('result', {})
    visual = primary.get('pass') is True and all(observed.get('checks', {}).get(k, {}).get('pass') is True for k in CHECKS)
    acceptance = 'primary_vision'
    second_file = OUT / (stem + '-second-opinion.json')
    if not visual and second_file.exists():
        second = json.loads(second_file.read_text())
        decision = second.get('adjudication', {})
        evidence = decision.get('measured_card_boxes', [])
        pictures = decision.get('measured_images', [])
        verified = len(evidence) == count and all(abs(b['w']-evidence[0]['w']) < .01 and abs(b['h']-evidence[0]['h']) < .01 for b in evidence) and pictures and all(im['fit'] == ('contain' if im['kind'] == 'cut' else 'cover') and im['nativeWidth'] > 0 and im['nativeHeight'] > 0 for im in pictures)
        independent = second.get('result', {})
        if decision.get('approved') and decision.get('incorrect_primary_claims') and verified and independent.get('acceptable') and not independent.get('critical_issues') and all(independent.get('checks', {}).get(k, {}).get('pass') is True for k in CHECKS):
            vision, observed, visual, acceptance = second, independent, True, 'independent_cross_review_after_measured_primary_contradiction'
    same_pixels = vision.get('candidate_sha256') == sha(stem + '.png') and vision.get('source_sha256') == sha(f + '.png')
    local = result.get('ok') is True and result['quality']['pass'] and result['quality']['count'] == count and result['quality']['occupancy'] >= .72
    for field in result.get('quality', {}).get('textSizes', []):
        local = local and (field['role'] != 'title' or field['size'] >= 18) and (field['role'] != 'body' or field['size'] >= 13)
    matching = [(name, report) for name, report in reports if any(c.get('ok') and c.get('f') == f and c.get('count') == count and c.get('ms') == result.get('ms') for c in report.get('cases', []))]
    real_report = matching[-1][0] if matching else None
    actual_models = sorted({c.get('model') for c in matching[-1][1].get('calls', []) if c.get('case') == f'{f}:{count}' and c.get('status') == 200 and c.get('model')}) if matching else []
    passed = bool(local and visual and same_pixels and real_report and actual_models)
    if not passed:
        failures.append({'case': stem, 'geometry': local, 'vision': visual, 'same_pixels': same_pixels, 'real_report': real_report})
    rows.append({'case': stem, 'source_count': result['analysis']['count'], 'target_count': count, 'pass': passed,
                 'occupancy': result['quality']['occupancy'], 'design_attempts': result['stats']['designs'],
                 'composition_score': result['review']['score'], 'visual_before': observed.get('before_score'), 'visual_after': observed.get('after_score'),
                 'acceptance': acceptance, 'primary_vision_pass': primary.get('pass'), 'primary_score': primary.get('result', {}).get('after_score'),
                 'visual_checks': {k: observed.get('checks', {}).get(k, {}).get('pass') for k in CHECKS},
                 'generation_models': actual_models, 'generation_report': real_report, 'vision_model': vision.get('model'),
                 'png_sha256': sha(stem + '.png'), 'source_png_sha256': sha(f + '.png'), 'png': stem + '.png'})
saved, copy, deck = read('ui-saved.json'), read('ui-recopy.json'), read('pptx-roundtrip.json')
ui = saved['meta']['pc'] == 4 and copy['meta']['pc'] == 2 and saved['meta']['f'] != copy['meta']['f'] and not saved['keep'] and not copy['keep'] and saved['originalUnchanged'] and copy['prior'] == saved['html'] and copy['myCount'] == 2
pptx = deck['count'] == len(CASES) and deck['textCount'] >= len(CASES) * 8 and deck['pictureCount'] >= len(CASES)
stress = read('long-text.json')
long_ok = stress.get('preservedLongText') and stress.get('originalUnchanged') and stress.get('quality', {}).get('pass') and stress.get('count') == 4
summary = {'at': datetime.now(timezone.utc).isoformat(), 'real_provider': True, 'pass': not failures and ui and pptx and long_ok,
           'sources': len({f for f, _ in CASES}), 'cases': len(rows), 'passed': sum(row['pass'] for row in rows),
           'occupancy_range': [min(r['occupancy'] for r in rows), max(r['occupancy'] for r in rows)],
           'visual_score_range': [min(r['visual_after'] or 0 for r in rows), max(r['visual_after'] or 0 for r in rows)],
           'long_korean_text_preserved': long_ok, 'long_text_occupancy': stress['quality']['occupancy'],
           'ui_and_distinct_my_copy': ui, 'editable_pptx_roundtrip': pptx,
           'pptx': {'slides': deck['count'], 'native_texts': deck['textCount'], 'native_pictures': deck['pictureCount'], 'file': 'count-reflow-editable.pptx', 'sha256': sha('count-reflow-editable.pptx')},
           'rows': rows, 'failures': failures,
           'notes': ['All positive generation evidence uses real provider responses; no success mocks.', 'Image reviews use the exact final PNG hashes and six concrete criteria; numerical scores are diagnostic.', 'Earlier genuine provider/quality failures remain in timestamped reports and iterations.', 'Current renderer preserves source text and image identity; recorded real-model geometry/style is reused for asset-frame fixes.']}
(OUT / 'final-evaluation.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps({k: v for k, v in summary.items() if k not in ('rows', 'notes')}, ensure_ascii=False, indent=2))
raise SystemExit(0 if summary['pass'] else 1)
