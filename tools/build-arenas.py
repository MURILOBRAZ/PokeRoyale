"""Converte a arte das arenas e dos ginásios (assets/originais/) para o jogo.

Uso: python tools/build-arenas.py [--debug pasta]

- Mapas: recorta cada imagem 3:4 para a proporção da arena (18 x 32 tiles), alinhando o rio e as
  pontes do desenho com as posições usadas pelo jogo (ARENA em js/data.js), e salva em WebP.
  Também gera miniaturas para as telas de menu.
- Ginásios: separa os 4 desenhos (lateral e Líder, azul e vermelho) e salva cada um recortado.
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


def build_gyms():
    """Separa os 4 ginásios da folha pelos pedaços não transparentes de cada quadrante."""
    OUT_GYMS.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC / 'ginasios.png').convert('RGBA')
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
    print('Mapas:')
    build_maps(debug)
    print('Ginásios:')
    build_gyms()
