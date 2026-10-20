import numpy as np, os
from PIL import Image
def src_path(k): return 'raw/'+k if os.path.exists('raw/'+k) else 'rawweb/'+k
def load(k): return Image.open(src_path(k)).convert('RGB')
def bands(a, axis, thr=0.5, white=236):
    # fraction of non-white pixels per row(axis=1)/col(axis=0)
    nw=~(a>white).all(axis=2)
    frac=nw.mean(axis=axis)
    return frac
def segments(frac, thr=0.5, minlen=40):
    segs=[];s=None
    for i,v in enumerate(frac):
        if v>=thr and s is None: s=i
        if v<thr and s is not None:
            if i-s>=minlen: segs.append((s,i))
            s=None
    if s is not None and len(frac)-s>=minlen: segs.append((s,len(frac)))
    return segs
def autotrim(im):
    a=np.asarray(im).astype(int)
    rows=segments(bands(a,1),0.55,60); 
    if rows: 
        r=max(rows,key=lambda x:x[1]-x[0]); a2=a[r[0]:r[1]]
    else: r=(0,a.shape[0]); a2=a
    cols=segments(bands(a2,0),0.55,60)
    c=max(cols,key=lambda x:x[1]-x[0]) if cols else (0,a.shape[1])
    return (c[0],r[0],c[1],r[1])
if __name__=='__main__':
    import sys
    for k in sys.argv[1:]:
        im=load(k); a=np.asarray(im).astype(int)
        print(k, im.size, 'trim', autotrim(im), 'colsegs', segments(bands(a,0),0.55,60), 'rowsegs', segments(bands(a,1),0.55,60))
