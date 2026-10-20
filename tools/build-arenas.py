"""Converte a arte das arenas e dos ginásios (assets/originais/) para o jogo.

Uso: python tools/build-arenas.py [--debug pasta]

- Mapas: recorta cada imagem 3:4 para a proporção da arena (18 x 32 tiles), alinhando o rio e as
  pontes do desenho com as posições usadas pelo jogo (ARENA em js/data.js), e salva em WebP.
  Também gera miniaturas para as telas de menu.
- Ginásios: separa os 4 desenhos (lateral e Líder, azul e vermelho) e salva cada um recortado.
  No lateral azul, a boca do canhão vira a traseira (culatra), para ele apontar para o adversário.
- --gyms: refaz só os ginásios.
- --debug: salva os mapas com as linhas do jogo desenhadas por cima, para conferir o alinhamento.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'originais'
OUT_ARENAS = ROOT / 'assets' / 'arenas'
OUT_GYMS = ROOT / 'assets' / 'ginasios'

# Recorte (esquerda, topo, direita, base, em pixels do original) que leva cada desenho para a grade
# 18 x 32 do jogo, com a mesma escala na horizontal e na vertical (nada esticado): as pontes do desenho
# caem nas pistas do jogo e o meio do rio na linha 16.
CROP_GYMS = (154, 5, 924, 1375)  # mapas dos ginásios (originais 1086 x 1448)
CROPS = {
    'rota1': (150, 64, 874, 1351),  # original 1024 x 1536
    'liga': (150, 97, 874, 1384),  # original 1024 x 1536
}
GRID_W, GRID_H = 18, 32
OUT_SIZE = (720, 1280)
THUMB_SIZE = (180, 320)
FULL_WIDTH = 1000  # versão completa (com as bordas decorativas) para preencher a tela além da arena

MAPS = ['rota1', 'pewter', 'cerulean', 'vermilion', 'celadon', 'saffron', 'fuchsia', 'cinnabar', 'viridian', 'liga']

# Geometria do jogo (manter igual a ARENA e às torres em js/data.js / js/game.js)
BRIDGES = (2.35, 15.65)
BRIDGE_HALF = 1.15
RIVER = (14.7, 17.3)
TOWERS = [(2.35, 6.5, 1.4), (15.65, 6.5, 1.4), (9, 3, 1.9), (2.35, 25.5, 1.4), (15.65, 25.5, 1.4), (9, 29, 1.9)]


def build_maps(debug_dir=None):
    OUT_ARENAS.mkdir(parents=True, exist_ok=True)
    art = {}
    for name in MAPS:
        original = Image.open(SRC / f'{name}.png').convert('RGB')
        crop = CROPS.get(name, CROP_GYMS)
        # Mapa completo + onde a arena fica dentro dele (em frações, independente da resolução)
        ow, oh = original.size
        full = original.resize((FULL_WIDTH, round(oh * FULL_WIDTH / ow)), Image.LANCZOS)
        full.save(OUT_ARENAS / f'{name}-full.webp', 'WEBP', quality=80, method=6)
        art[name] = [round(crop[0] / ow, 5), round(crop[1] / oh, 5), round(crop[2] / ow, 5), round(crop[3] / oh, 5)]
        im = original.crop(crop)
        full = im.resize(OUT_SIZE, Image.LANCZOS)
        full.save(OUT_ARENAS / f'{name}.webp', 'WEBP', quality=82, method=6)
        im.resize(THUMB_SIZE, Image.LANCZOS).save(OUT_ARENAS / f'{name}-mini.webp', 'WEBP', quality=75, method=6)
        if debug_dir:
            draw_debug(full).save(Path(debug_dir) / f'{name}-debug.png')
        print(f'  {name}: {(OUT_ARENAS / f"{name}.webp").stat().st_size // 1024} KB · completo {(OUT_ARENAS / f"{name}-full.webp").stat().st_size // 1024} KB')
    nl = chr(10)
    body = (',' + nl).join(f"  {n}: [{', '.join(str(v) for v in c)}]" for n, c in art.items())
    header = ('// Gerado por tools/build-arenas.py. Onde a arena (18 x 32) fica dentro de cada mapa completo:' + nl
              + '// [esquerda, topo, direita, base] em frações da imagem assets/arenas/<mapa>-full.webp.' + nl + nl)
    (ROOT / 'js' / 'arena-art.js').write_text(header + 'const ARENA_ART = {' + nl + body + ',' + nl + '};' + nl, encoding='utf-8')


def draw_debug(img):
    img = img.copy()
    d = ImageDraw.Draw(img, 'RGBA')
    sx = img.width / GRID_W
    sy = img.height / GRID_H
    d.rectangle([0, RIVER[0] * sy, img.width, RIVER[1] * sy], outline=(0, 255, 255, 255), width=3)
    for b in BRIDGES:
        d.rectangle([(b - BRIDGE_HALF) * sx, RIVER[0] * sy - 10, (b + BRIDGE_HALF) * sx, RIVER[1] * sy + 10],
                    outline=(255, 0, 255, 255), width=3)
    for x, y, r in TOWERS:
        d.ellipse([(x - r) * sx, (y - r) * sy, (x + r) * sx, (y + r) * sy], outline=(255, 255, 0, 255), width=3)
    return img


def cannon_breech(sheet):
    """Canhão do lateral azul: no desenho original a boca aponta para quem olha a tela (certo para o
    vermelho, que fica em cima). Troca a boca pela culatra, com placa e pino, para o azul mirar para cima."""
    px = sheet.load()
    # Boca do canhão: mancha escura ligada ao centro dela na folha original
    stack, bore = [(336, 860)], set()
    while stack:
        x, y = stack.pop()
        if (x, y) in bore or not (300 < x < 376 and 830 < y < 892) or max(px[x, y][:3]) >= 80:
            continue
        bore.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    xs = [x for x, _ in bore]
    ys = [y for _, y in bore]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    R = (max(xs) - min(xs)) / 2
    # Disco de metal com luz de cima à esquerda, como no resto do canhão
    for (x, y) in bore:
        t = max(-1, min(1, ((x - cx) * 0.6 + (y - cy) * 0.8) / R))
        v = int(118 - 30 * t)
        px[x, y] = (v, v, v + 7, 255)
    # Emenda da placa e pino (cascabel), desenhados em 4x e reduzidos para ficarem suaves
    K = 4
    x0, y0 = int(cx - R - 4), int(cy - R - 4)
    size = int(2 * R + 9)
    ov = Image.new('RGBA', (size * K, size * K), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    def circle(ox, oy, r, **kw):
        d.ellipse([(ox - r + 0.5 - x0) * K, (oy - r + 0.5 - y0) * K, (ox + r + 0.5 - x0) * K, (oy + r + 0.5 - y0) * K], **kw)

    circle(cx, cy, R, outline=(55, 55, 62, 255), width=K)
    r = R * 0.42
    circle(cx, cy, r, fill=(96, 96, 104, 255), outline=(30, 30, 36, 255), width=int(K * 1.5))
    circle(cx - r * 0.15, cy - r * 0.15, r * 0.62, fill=(150, 150, 158, 255))
    circle(cx - r * 0.35, cy - r * 0.35, r * 0.25, fill=(215, 215, 222, 255))
    sheet.alpha_composite(ov.resize((size, size), Image.LANCZOS), (x0, y0))


def build_gyms():
    """Separa os 4 ginásios da folha pelos pedaços não transparentes de cada quadrante."""
    OUT_GYMS.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC / 'ginasios.png').convert('RGBA')
    cannon_breech(sheet)
    w, h = sheet.size
    # Quadrantes da folha: lateral à esquerda, Líder à direita; vermelho em cima, azul embaixo
    parts = {
        'lateral-vermelho': (0, 0, int(w * 0.45), h // 2),
        'lider-vermelho': (int(w * 0.45), 0, w, h // 2),
        'lateral-azul': (0, h // 2, int(w * 0.45), h),
        'lider-azul': (int(w * 0.45), h // 2, w, h),
    }
    for name, box in parts.items():
        piece = sheet.crop(box)
        # Limpa o "halo" quase transparente das bordas antes de recortar justo
        alpha = piece.getchannel('A').point(lambda a: 0 if a < 24 else a)
        piece.putalpha(alpha)
        piece = piece.crop(alpha.getbbox())
        piece.thumbnail((360, 360), Image.LANCZOS)
        piece.save(OUT_GYMS / f'{name}.webp', 'WEBP', quality=88, method=6)
        print(f'  {name}: {piece.size}, {(OUT_GYMS / f"{name}.webp").stat().st_size // 1024} KB')


if __name__ == '__main__':
    debug = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
    if '--gyms' not in sys.argv:
        print('Mapas:')
        build_maps(debug)
    print('Ginásios:')
    build_gyms()
