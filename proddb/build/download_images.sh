#!/bin/bash
# 상품 카드 이미지(카드당 앞 3장, 480px PNG 프리셋) → proddb/img_raw/<goodsId>_<k>.png  — pack_images.py 의 입력
cd "$(dirname "$0")/.." && mkdir -p img_raw
python3 -c "
import json
p=json.load(open('raw/wkb_products.json'))
for g in p['cardOrder']:
    for k,im in enumerate(p['products'][g]['images'][:3]):
        u=im['src']; u=('https:'+u) if u.startswith('//') else u
        print(u+('' if '?' in u else '?\$480_N_PNG\$')+'\t'+f'img_raw/{g}_{k}.png')
" | while IFS=$'\t' read -r u o; do [ -s "$o" ] || echo "$u"$'\t'"$o"; done | xargs -P 6 -d '\n' -n 1 bash -c 'IFS=$'"'"'\t'"'"' read -r u o <<< "$0"; curl -sS --max-time 40 -o "$o" "$u" || rm -f "$o"'
