import json, os, sys
from PIL import Image, ImageOps
import numpy as np
D='/home/claude/media/dl'
meta=json.load(open('/home/claude/media/dl_meta.json'))
out_p='/home/claude/media/hashes.json'
H=json.load(open(out_p)) if os.path.exists(out_p) else {}
def feats(path):
    im=Image.open(path); im.seek(0); im=im.convert('RGBA')
    bg=Image.new('RGBA', im.size, (255,255,255,255)); bg.alpha_composite(im); im=bg.convert('RGB')
    g=im.convert('L').resize((9,8)); a=np.asarray(g,dtype=np.int16)
    dh=''.join('1' if x else '0' for x in (a[:,1:]>a[:,:-1]).flatten())
    s=im.resize((64,64)); arr=np.asarray(s,dtype=np.float32)
    white=float(((arr>235).all(axis=2)).mean())
    sat=float((arr.max(axis=2)-arr.min(axis=2)).mean())
    std=float(arr.std())
    return {'dh':dh,'white':round(white,3),'sat':round(sat,1),'std':round(std,1)}
def run(items):
    for k,path in items:
        if k in H: continue
        try: H[k]=feats(path)
        except Exception as e: H[k]={'err':str(e)[:80]}
items=[(k,f'{D}/{k}') for k,v in meta.items() if v.get('ok')]
for root,_,fs in os.walk('/home/claude/media/pdfimg'):
    for f in fs: items.append(('pdf:'+os.path.relpath(os.path.join(root,f),'/home/claude/media/pdfimg'), os.path.join(root,f)))
run(items)
json.dump(H,open(out_p,'w'))
print(len(H), sum(1 for v in H.values() if 'err' in v))
