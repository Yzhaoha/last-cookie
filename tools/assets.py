# 把 art-ref/shop/ 里的商店美术压成游戏用的小图，放到 assets/（Pages 和平台包都从这里读）
# 用法：python3 tools/assets.py   （改了 art-ref/shop/ 里的图才需要重跑）
import os
from PIL import Image
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC, OUT = 'art-ref/shop', 'assets'
os.makedirs(OUT + '/chars', exist_ok=True); os.makedirs(OUT + '/ui', exist_ok=True)
total = 0
def save(src, dst, size):
    global total
    im = Image.open(src).convert('RGBA'); im.thumbnail((size, size), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=86, method=6); total += os.path.getsize(dst)
for f in sorted(os.listdir(SRC + '/characters')):
    if f.endswith('.png'): save(f'{SRC}/characters/{f}', f'{OUT}/chars/{f[:-4]}.webp', 256)
for f in sorted(os.listdir(SRC + '/ui')):
    if f.endswith('.png'): save(f'{SRC}/ui/{f}', f'{OUT}/ui/{f[:-4]}.webp', 128)
print('assets', total // 1024, 'KB')
