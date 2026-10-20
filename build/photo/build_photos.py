import json, os
from PIL import Image, ImageOps, ImageEnhance
from photos import P
from photos2 import P2, GEN
from proc import load, autotrim
man={m['id']:m for m in json.load(open('build/photo/case_images.json'))}
web={m['id']:m for m in json.load(open('build/photo/web_images.json'))}
OUT=''
out={}
def save(name, im, meta):
    w,h=im.size
    k=min(1.0,1600/w,1000/h)
    if k<1: im=im.resize((round(w*k),round(h*k)),Image.LANCZOS)
    fn=f'img/ph/{name}.jpg'
    im.save(OUT+fn,quality=82,optimize=True,progressive=True)
    out['ph.'+name]=dict(file=fn, **meta, w=im.size[0], h=im.size[1], bytes=os.path.getsize(OUT+fn))
for name,(sid,crop,group,kind,model,desc) in {**P, **P2}.items():
    im=load(sid)
    if crop=='auto': im=im.crop(autotrim(im))
    elif crop: im=im.crop(crop)
    src=man.get(sid) or web.get(sid)
    save(name, im, dict(src=group, kind=kind, model=model, desc=desc, page=src['page'], orig=src['url']))
for name,(base,mode,desc) in GEN.items():
    b=out['ph.'+base]; im=Image.open(OUT+b['file']).convert('RGB')
    if mode=='gray':
        g=ImageOps.grayscale(im); g=ImageEnhance.Contrast(g).enhance(0.9); im=Image.merge('RGB',(g,g,g))
    elif mode=='night':
        im=ImageEnhance.Brightness(im).enhance(0.42); im=ImageEnhance.Color(im).enhance(0.6)
        r,g,bb=im.split(); bb=bb.point(lambda v:min(255,int(v*1.25)+6)); r=r.point(lambda v:int(v*0.88)); im=Image.merge('RGB',(r,g,bb))
    save(name, im, dict(src='gen', kind=b['kind'], model=b['model'], desc=desc, page=b['page'], orig=b['orig']))
json.dump(out,open('build/photo/ph_images.json','w'),ensure_ascii=False,indent=1)
print(len(out), sum(v['bytes'] for v in out.values())//1024,'KB')
