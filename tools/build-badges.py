"""Baixa as 8 insígnias de Kanto (sprites da PokéAPI) e limpa o recorte para o jogo (assets/insignias/).

Uso: python tools/build-badges.py

Os sprites originais foram recortados de um fundo branco: sobram pontinhos claros por fora do contorno
preto, que aparecem como uma borda pontilhada sobre o fundo escuro do jogo. Aqui tudo o que fica do lado de
fora do contorno (alcançável a partir da beira da imagem sem cruzar um pixel escuro) vira transparente.
"""

import io
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'insignias'
URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/{}.png'


def is_outline(c):
    r, g, b, a = c
    return a > 0 and r + g + b < 3 * 90  # contorno preto (e as sombras escuras coladas nele)


def clean(im):
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    outside = set()
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for x in (0, w - 1) for y in range(h)]
    while stack:
        x, y = stack.pop()
        if (x, y) in outside or not (0 <= x < w and 0 <= y < h) or is_outline(px[x, y]):
            continue
        outside.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    for x, y in outside:
        px[x, y] = (0, 0, 0, 0)
    return im.crop(im.getbbox())


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for n in range(1, 9):
        with urllib.request.urlopen(URL.format(n)) as r:
            im = clean(Image.open(io.BytesIO(r.read())))
        im.save(OUT / f'{n}.png', optimize=True)
        print(f'  insígnia {n}: {im.size}, {(OUT / f"{n}.png").stat().st_size} bytes')
