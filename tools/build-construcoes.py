"""Gera a pixel art das construções (v0.8) em assets/construcoes/*.png.

Uso: python tools/build-construcoes.py [--preview pasta]

Estilo dos sprites do jogo (SpriteCollab): pouca resolução, contorno escuro de 1 px,
luz vindo de cima/esquerda e sombra embaixo/direita. O jogo desenha sem suavizar (pixelado),
na mesma escala dos Pokémon (16 px por tile). Os Pokémon que aparecem nas construções
(Chansey, Gastly, Zubat, Mewtwo) são os sprites animados, desenhados por cima em render.js.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'construcoes'
OUTLINE = (40, 30, 52, 255)


def canvas(w, h):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def outline(img, color=OUTLINE):
    """Contorno de 1 px em volta de tudo que não é transparente."""
    w, h = img.size
    px = img.load()
    solid = [[px[x, y][3] > 0 for y in range(h)] for x in range(w)]
    for x in range(w):
        for y in range(h):
            if solid[x][y]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and solid[nx][ny]:
                    px[x, y] = color
                    break
    return img


def rect(d, x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1, y1], fill=c)


# ---------- Centro Pokémon ----------
def pokecenter():
    img, d = canvas(52, 46)
    # Paredes (creme), sombra à direita e embaixo
    rect(d, 6, 20, 45, 41, (246, 238, 220, 255))
    rect(d, 40, 20, 45, 41, (222, 210, 186, 255))
    rect(d, 6, 39, 45, 41, (205, 192, 166, 255))
    # Faixa vermelha no meio da parede
    rect(d, 6, 22, 45, 23, (214, 64, 58, 255))
    # Telhado vermelho (trapézio), com brilho em cima e beirada escura
    d.polygon([(3, 21), (48, 21), (43, 9), (8, 9)], fill=(226, 72, 62, 255))
    d.polygon([(8, 9), (43, 9), (44, 11), (7, 11)], fill=(255, 128, 110, 255))
    rect(d, 3, 19, 48, 21, (160, 40, 38, 255))
    # Placa Poké Ball no telhado
    d.ellipse([20, 7, 31, 18], fill=(250, 250, 250, 255))
    d.pieslice([20, 7, 31, 18], 180, 360, fill=(232, 60, 56, 255))
    rect(d, 20, 12, 31, 13, OUTLINE)
    d.ellipse([23, 10, 28, 15], fill=(250, 250, 250, 255), outline=OUTLINE)
    # Porta de vidro (azul) com moldura
    rect(d, 20, 27, 31, 41, (150, 160, 176, 255))
    rect(d, 21, 28, 30, 41, (132, 214, 246, 255))
    rect(d, 21, 28, 22, 41, (196, 238, 255, 255))
    rect(d, 25, 28, 26, 41, (150, 160, 176, 255))
    # Janelas
    for x in (9, 35):
        rect(d, x, 27, x + 7, 33, (150, 160, 176, 255))
        rect(d, x + 1, 28, x + 6, 32, (132, 214, 246, 255))
        rect(d, x + 1, 28, x + 2, 29, (220, 246, 255, 255))
    # Degrau
    rect(d, 17, 42, 34, 43, (176, 176, 190, 255))
    return outline(img)


# ---------- Torre Pokémon (Lavender) ----------
def pokemontower():
    img, d = canvas(40, 64)
    stone = (150, 134, 178, 255)
    stone_dark = (112, 98, 140, 255)
    stone_light = (186, 172, 212, 255)
    roof = (84, 64, 120, 255)
    roof_light = (124, 100, 166, 255)
    # Três andares, cada um um pouco mais estreito
    floors = [(7, 44, 32, 61), (9, 28, 30, 42), (11, 14, 28, 26)]
    for x0, y0, x1, y1 in floors:
        rect(d, x0, y0, x1, y1, stone)
        rect(d, x1 - 3, y0, x1, y1, stone_dark)
        rect(d, x0, y0, x0 + 1, y1, stone_light)
        # Telhadinho de cada andar
        d.polygon([(x0 - 3, y0 + 1), (x1 + 3, y0 + 1), (x1, y0 - 3), (x0, y0 - 3)], fill=roof)
        rect(d, x0, y0 - 3, x1, y0 - 3, roof_light)
        # Janela acesa (amarela)
        cx = (x0 + x1) // 2
        rect(d, cx - 2, y0 + 4, cx + 1, y0 + 8, (255, 214, 96, 255))
        rect(d, cx - 2, y0 + 4, cx - 1, y0 + 5, (255, 246, 190, 255))
    # Ponta do telhado
    d.polygon([(10, 12), (29, 12), (19, 2)], fill=roof)
    d.polygon([(19, 2), (14, 9), (19, 9)], fill=roof_light)
    rect(d, 19, 0, 20, 2, (220, 200, 120, 255))
    # Porta em arco
    d.pieslice([15, 52, 24, 61], 180, 360, fill=(46, 32, 62, 255))
    rect(d, 15, 56, 24, 61, (46, 32, 62, 255))
    # Rachaduras
    d.line([(26, 47), (28, 50), (27, 53)], fill=stone_dark)
    d.line([(12, 33), (13, 36)], fill=stone_dark)
    return outline(img)


# ---------- Caverna Zubat ----------
def zubatcave():
    img, d = canvas(56, 40)
    rock = (150, 138, 118, 255)
    rock_dark = (110, 100, 86, 255)
    rock_light = (190, 178, 156, 255)
    # Morro de pedra
    d.polygon([(2, 37), (6, 22), (14, 12), (26, 6), (38, 9), (48, 18), (53, 37)], fill=rock)
    d.polygon([(38, 9), (48, 18), (53, 37), (42, 37), (44, 22)], fill=rock_dark)
    d.polygon([(14, 12), (26, 6), (30, 8), (18, 15), (9, 22)], fill=rock_light)
    # Pedras soltas e musgo
    d.ellipse([3, 31, 11, 38], fill=rock_dark)
    d.ellipse([45, 30, 54, 38], fill=rock_light)
    for x, y in ((20, 9), (33, 8), (8, 24)):
        rect(d, x, y, x + 3, y + 1, (104, 158, 74, 255))
    # Boca da caverna (escura, com degradê)
    d.pieslice([16, 16, 40, 44], 180, 360, fill=(58, 46, 60, 255))
    d.pieslice([19, 20, 37, 44], 180, 360, fill=(30, 22, 36, 255))
    d.pieslice([22, 24, 34, 44], 180, 360, fill=(14, 10, 18, 255))
    rect(d, 16, 30, 40, 37, (14, 10, 18, 255))
    rect(d, 16, 30, 18, 37, (58, 46, 60, 255))
    rect(d, 38, 30, 40, 37, (58, 46, 60, 255))
    # Olhinhos brilhando lá dentro
    rect(d, 25, 28, 25, 28, (255, 236, 120, 255))
    rect(d, 30, 30, 30, 30, (255, 236, 120, 255))
    return outline(img)


# ---------- Laboratório do Mewtwo ----------
def mewtwolab():
    img, d = canvas(56, 60)
    wall = (214, 220, 232, 255)
    wall_dark = (168, 176, 194, 255)
    # Prédio
    rect(d, 4, 36, 51, 57, wall)
    rect(d, 44, 36, 51, 57, wall_dark)
    rect(d, 4, 55, 51, 57, (150, 158, 176, 255))
    rect(d, 4, 41, 51, 43, (72, 110, 196, 255))  # faixa azul
    # Tubos e luzes
    rect(d, 8, 30, 10, 36, (120, 128, 148, 255))
    rect(d, 45, 30, 47, 36, (120, 128, 148, 255))
    rect(d, 7, 28, 11, 30, (255, 92, 168, 255))
    rect(d, 44, 28, 48, 30, (255, 92, 168, 255))
    for i, c in enumerate(((95, 224, 212, 255), (255, 213, 74, 255), (95, 224, 212, 255))):
        rect(d, 11 + i * 4, 47, 12 + i * 4, 48, c)
    # Porta
    rect(d, 24, 46, 31, 57, (96, 104, 124, 255))
    rect(d, 27, 46, 28, 57, (72, 80, 100, 255))
    # Base da cápsula, em cima do prédio
    rect(d, 16, 31, 39, 36, (120, 128, 148, 255))
    rect(d, 16, 31, 39, 32, (160, 168, 188, 255))
    # Cápsula de vidro (o Mewtwo é desenhado dentro, no jogo)
    d.rounded_rectangle([18, 2, 37, 30], radius=9, fill=(150, 220, 255, 90))
    rect(d, 21, 7, 22, 20, (235, 250, 255, 170))  # reflexo
    rect(d, 17, 29, 38, 30, (120, 128, 148, 255))
    return outline(img)


BUILD = {
    'pokecenter': pokecenter,
    'pokemontower': pokemontower,
    'zubatcave': zubatcave,
    'mewtwolab': mewtwolab,
}

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    for name, fn in BUILD.items():
        img = fn()
        img.save(OUT / f'{name}.png')
        print(f'  {name}: {img.size}')
        if preview:
            big = img.resize((img.width * 6, img.height * 6), Image.NEAREST)
            bg = Image.new('RGBA', big.size, (110, 170, 90, 255))
            bg.alpha_composite(big)
            bg.save(Path(preview) / f'{name}-preview.png')
