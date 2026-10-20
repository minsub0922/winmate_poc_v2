# side-by-side sheets → one contact sheet: python3 grid.py out.png a.png b.png …  (each 2580×720 → 1290×360)
import sys
from PIL import Image
out, fs = sys.argv[1], sys.argv[2:]
W, H = 1290, 360
g = Image.new('RGB', (W, H * len(fs)), '#222')
for i, f in enumerate(fs):
    g.paste(Image.open(f).resize((W, H)), (0, i * H))
g.save(out)
