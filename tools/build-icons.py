"""Gera os ícones da interface em pixel art (16 x 16) em assets/icones/*.png.

Uso: python tools/build-icons.py [--preview pasta]

Também gera o ícone do site (favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png e icon-512.png).

Substituem os emojis em todo o jogo (ver js/icons.js). Mesmo estilo das construções:
cores chapadas, brilho em cima/esquerda, sombra embaixo/direita e contorno escuro de 1 px,
desenhado sem suavizar (o navegador amplia "pixelado").
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'icones'
OUTLINE = (40, 30, 52, 255)

# Paleta
Y, YD, YL = (255, 210, 63, 255), (214, 150, 30, 255), (255, 246, 200, 255)
R, RD, RL = (232, 69, 60, 255), (160, 40, 42, 255), (255, 140, 120, 255)
G, GD, GL = (92, 192, 74, 255), (47, 122, 34, 255), (170, 236, 140, 255)
B, BD, BL = (79, 140, 255, 255), (47, 91, 200, 255), (160, 205, 255, 255)
W, WS = (250, 250, 250, 255), (200, 206, 220, 255)
S, SD = (184, 188, 200, 255), (122, 128, 144, 255)
N, ND, NL = (160, 112, 60, 255), (107, 74, 42, 255), (216, 176, 112, 255)
P, PD = (155, 107, 216, 255), (91, 61, 138, 255)
O = (240, 138, 36, 255)
C = (143, 227, 255, 255)
K = OUTLINE


def new():
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def px(d, pts, c):
    for x, y in pts:
        d.point((x, y), fill=c)


def outline(img):
    w, h = img.size
    p = img.load()
    solid = [[p[x, y][3] > 0 for y in range(h)] for x in range(w)]
    for x in range(w):
        for y in range(h):
            if solid[x][y]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and solid[nx][ny]:
                    p[x, y] = OUTLINE
                    break
    return img


def star_points(cx, cy, r1, r2, n=5, rot=-90):
    import math
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(rot + i * 180 / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# ---------- Ícones ----------

def trophy():
    img, d = new()
    d.rectangle([4, 2, 11, 7], fill=Y)
    d.polygon([(4, 7), (11, 7), (9, 9), (6, 9)], fill=Y)
    d.rectangle([7, 9, 8, 11], fill=YD)
    d.rectangle([5, 12, 10, 12], fill=YD)
    d.rectangle([4, 13, 11, 14], fill=N)
    px(d, [(2, 3), (2, 4), (2, 5), (3, 6), (13, 3), (13, 4), (13, 5), (12, 6)], Y)  # alças
    d.line([(5, 3), (5, 6)], fill=YL)
    d.line([(10, 3), (10, 7)], fill=YD)
    return outline(img)


def coin():  # Fichas do Game Corner
    img, d = new()
    d.ellipse([1, 1, 14, 14], fill=Y)
    d.ellipse([4, 4, 11, 11], fill=YD)
    d.ellipse([5, 5, 10, 10], fill=Y)
    px(d, [(4, 2), (5, 2), (3, 3), (2, 4), (2, 5)], YL)
    d.line([(7, 6), (7, 9)], fill=YD)
    d.line([(8, 6), (8, 9)], fill=YD)
    return outline(img)


def money():  # Pokédólares (saquinho)
    img, d = new()
    d.ellipse([2, 5, 13, 14], fill=NL)
    d.rectangle([6, 2, 9, 5], fill=NL)
    d.line([(5, 5), (10, 5)], fill=ND)
    px(d, [(5, 1), (10, 1)], NL)
    px(d, [(4, 7), (4, 8), (5, 6)], (240, 214, 160, 255))
    # $
    px(d, [(8, 7), (9, 7), (7, 8), (8, 9), (9, 10), (7, 11), (8, 11), (8, 12)], ND)
    px(d, [(8, 6)], ND)
    return outline(img)


def lock():
    img, d = new()
    d.rectangle([5, 1, 10, 7], outline=S, width=2)
    d.rectangle([3, 7, 12, 14], fill=Y)
    d.line([(3, 7), (12, 7)], fill=YL)
    d.line([(12, 8), (12, 14)], fill=YD)
    d.rectangle([7, 9, 8, 12], fill=K)
    return outline(img)


def swords():
    img, d = new()
    # Duas espadas cruzadas: lâmina clara, guarda dourada e cabo marrom
    d.line([(2, 2), (10, 10)], fill=W, width=2)
    d.line([(13, 2), (5, 10)], fill=WS, width=2)
    d.line([(8, 12), (12, 8)], fill=YD, width=1)
    d.line([(3, 8), (7, 12)], fill=YD, width=1)
    d.line([(11, 11), (13, 13)], fill=N, width=2)
    d.line([(4, 11), (2, 13)], fill=N, width=2)
    return outline(img)


def crown():
    img, d = new()
    d.polygon([(1, 5), (4, 9), (7, 3), (8, 3), (11, 9), (14, 5), (13, 13), (2, 13)], fill=Y)
    d.rectangle([2, 11, 13, 13], fill=YD)
    px(d, [(7, 9), (8, 9), (7, 10), (8, 10)], R)
    px(d, [(4, 11), (11, 11)], B)
    px(d, [(1, 4), (7, 2), (8, 2), (14, 4)], YL)
    return outline(img)


def target():
    img, d = new()
    d.ellipse([1, 1, 14, 14], fill=R)
    d.ellipse([3, 3, 12, 12], fill=W)
    d.ellipse([5, 5, 10, 10], fill=R)
    d.ellipse([7, 7, 8, 8], fill=W)
    return outline(img)


def globe():
    img, d = new()
    d.ellipse([1, 1, 14, 14], fill=B)
    d.polygon([(4, 3), (8, 3), (8, 6), (5, 8), (3, 6)], fill=G)
    d.polygon([(9, 8), (12, 7), (12, 11), (9, 12)], fill=G)
    px(d, [(4, 2), (3, 3), (2, 4)], BL)
    return outline(img)


def friends():
    img, d = new()
    d.ellipse([8, 2, 13, 7], fill=BL)
    d.pieslice([6, 8, 15, 18], 180, 360, fill=BL)
    d.ellipse([2, 3, 7, 8], fill=B)
    d.pieslice([0, 9, 9, 19], 180, 360, fill=B)
    return outline(img)


def hourglass():
    img, d = new()
    d.rectangle([2, 1, 13, 2], fill=N)
    d.rectangle([2, 13, 13, 14], fill=N)
    d.polygon([(3, 3), (12, 3), (8, 8), (7, 8)], fill=C)
    d.polygon([(7, 8), (8, 8), (12, 12), (3, 12)], fill=C)
    d.polygon([(5, 4), (10, 4), (8, 7), (7, 7)], fill=Y)
    d.polygon([(5, 12), (10, 12), (8, 10), (7, 10)], fill=YD)
    return outline(img)


def bolt():
    img, d = new()
    d.polygon([(9, 1), (3, 9), (7, 9), (5, 15), (12, 6), (8, 6), (10, 1)], fill=Y)
    px(d, [(8, 2), (7, 3), (6, 4)], YL)
    return outline(img)


def flag():
    img, d = new()
    d.line([(3, 1), (3, 14)], fill=N, width=2)
    d.polygon([(5, 2), (13, 2), (11, 5), (13, 8), (5, 8)], fill=W)
    d.line([(5, 7), (12, 7)], fill=WS)
    return outline(img)


def speaker(muted=False):
    img, d = new()
    d.rectangle([1, 5, 4, 10], fill=S)
    d.polygon([(4, 5), (8, 2), (8, 13), (4, 10)], fill=S)
    d.line([(5, 9), (7, 11)], fill=SD)
    if muted:
        d.line([(10, 5), (14, 10)], fill=R, width=2)
        d.line([(14, 5), (10, 10)], fill=R, width=2)
    else:
        px(d, [(10, 6), (10, 7), (10, 8), (10, 9)], W)
        px(d, [(12, 4), (13, 5), (13, 6), (13, 7), (13, 8), (13, 9), (13, 10), (12, 11)], W)
    return outline(img)


def door():
    img, d = new()
    d.rectangle([3, 1, 12, 14], fill=N)
    d.rectangle([5, 3, 10, 7], fill=ND)
    d.rectangle([5, 9, 10, 12], fill=ND)
    px(d, [(10, 8), (11, 8)], Y)
    d.line([(3, 1), (3, 14)], fill=NL)
    return outline(img)


def cart():
    img, d = new()
    d.line([(1, 2), (3, 2)], fill=S, width=1)
    d.polygon([(3, 3), (14, 4), (12, 10), (5, 10)], fill=S)
    d.line([(5, 6), (13, 6)], fill=SD)
    d.line([(8, 4), (8, 10)], fill=SD)
    d.ellipse([4, 11, 7, 14], fill=K)
    d.ellipse([10, 11, 13, 14], fill=K)
    return outline(img)


def medal(color=Y, dark=YD):
    img, d = new()
    d.polygon([(3, 0), (6, 0), (8, 6), (6, 7)], fill=R)
    d.polygon([(12, 0), (9, 0), (7, 6), (9, 7)], fill=B)
    d.ellipse([3, 5, 12, 14], fill=color)
    d.ellipse([5, 7, 10, 12], fill=dark)
    d.ellipse([6, 8, 9, 11], fill=color)
    return outline(img)


def castle():
    img, d = new()
    d.rectangle([2, 5, 13, 14], fill=S)
    for x in (2, 6, 10):
        d.rectangle([x, 2, x + 2, 5], fill=S)
    d.line([(13, 5), (13, 14)], fill=SD)
    d.rectangle([6, 9, 9, 14], fill=ND)
    d.pieslice([6, 7, 9, 11], 180, 360, fill=ND)
    px(d, [(4, 8), (11, 8)], K)
    return outline(img)


def boom():
    img, d = new()
    d.polygon(star_points(7.5, 7.5, 7.4, 3.6, 8), fill=O)
    d.polygon(star_points(7.5, 7.5, 4.5, 2.2, 8, -67), fill=Y)
    return outline(img)


def heart(color=R, light=RL, dark=RD):
    img, d = new()
    d.ellipse([1, 2, 8, 9], fill=color)
    d.ellipse([7, 2, 14, 9], fill=color)
    d.polygon([(1, 6), (14, 6), (8, 14), (7, 14)], fill=color)
    px(d, [(3, 4), (4, 3), (3, 5)], light)
    px(d, [(12, 7), (11, 9), (10, 10)], dark)
    return outline(img)


def dizzy():
    img, d = new()
    d.arc([1, 3, 14, 13], 200, 520, fill=Y, width=2)
    d.polygon(star_points(11, 4, 3.5, 1.5), fill=Y)
    return outline(img)


def chat():
    img, d = new()
    d.rounded_rectangle([1, 2, 14, 11], radius=3, fill=W)
    d.polygon([(4, 11), (8, 11), (3, 14)], fill=W)
    for x in (4, 7, 10):
        d.rectangle([x, 6, x + 1, 7], fill=SD)
    return outline(img)


def home():
    img, d = new()
    d.polygon([(1, 7), (7, 1), (8, 1), (14, 7)], fill=R)
    d.rectangle([3, 7, 12, 14], fill=(246, 238, 220, 255))
    d.rectangle([6, 9, 9, 14], fill=N)
    d.line([(12, 7), (12, 14)], fill=(222, 210, 186, 255))
    return outline(img)


def plus():
    img, d = new()
    d.rectangle([6, 2, 9, 13], fill=G)
    d.rectangle([2, 6, 13, 9], fill=G)
    px(d, [(6, 2), (6, 3), (2, 6), (3, 6)], GL)
    return outline(img)


def leaf():
    img, d = new()
    d.polygon([(2, 13), (3, 6), (8, 2), (14, 1), (13, 7), (9, 12)], fill=G)
    d.line([(3, 12), (12, 3)], fill=GD)
    px(d, [(4, 6), (5, 5)], GL)
    return outline(img)


def scroll():
    img, d = new()
    d.rectangle([3, 2, 12, 13], fill=(244, 226, 180, 255))
    d.rectangle([1, 1, 14, 2], fill=NL)
    d.rectangle([1, 13, 14, 14], fill=NL)
    for y in (5, 7, 9, 11):
        d.line([(5, y), (10, y)], fill=N)
    return outline(img)


def note():
    img, d = new()
    d.ellipse([2, 10, 6, 14], fill=P)
    d.ellipse([9, 8, 13, 12], fill=P)
    d.rectangle([5, 3, 6, 12], fill=P)
    d.rectangle([12, 1, 13, 10], fill=P)
    d.polygon([(5, 3), (13, 1), (13, 4), (5, 6)], fill=PD)
    return outline(img)


def dice():
    img, d = new()
    d.rounded_rectangle([1, 1, 14, 14], radius=2, fill=W)
    d.line([(14, 3), (14, 13)], fill=WS)
    d.line([(3, 14), (13, 14)], fill=WS)
    for x, y in ((4, 4), (10, 4), (7, 7), (4, 10), (10, 10)):
        d.rectangle([x, y, x + 1, y + 1], fill=R if (x, y) == (7, 7) else K)
    return outline(img)


def bat():
    img, d = new()
    d.polygon([(0, 4), (5, 6), (7, 4), (8, 4), (10, 6), (15, 4), (13, 10), (10, 9), (8, 12), (7, 12), (5, 9), (2, 10)], fill=P)
    px(d, [(6, 7), (9, 7)], W)
    return outline(img)


def shoe():
    img, d = new()
    d.polygon([(2, 4), (7, 4), (8, 8), (13, 9), (14, 12), (2, 12)], fill=R)
    d.rectangle([2, 12, 14, 13], fill=W)
    px(d, [(4, 6), (5, 7), (6, 6)], W)
    return outline(img)


def sparkles():
    img, d = new()
    d.polygon(star_points(6, 7, 6, 1.6, 4), fill=Y)
    d.polygon(star_points(12, 3, 3, 1, 4), fill=YL)
    d.polygon(star_points(12, 12, 2.6, 0.9, 4), fill=Y)
    return outline(img)


def robot():
    img, d = new()
    d.rectangle([2, 4, 13, 13], fill=S)
    d.line([(7, 1), (7, 4)], fill=SD)
    px(d, [(7, 0), (8, 1)], R)
    d.rectangle([4, 6, 6, 8], fill=C)
    d.rectangle([9, 6, 11, 8], fill=C)
    d.line([(5, 11), (10, 11)], fill=SD)
    d.line([(13, 4), (13, 13)], fill=SD)
    return outline(img)


def gift():
    img, d = new()
    d.rectangle([2, 6, 13, 14], fill=R)
    d.rectangle([1, 4, 14, 6], fill=RL)
    d.rectangle([7, 4, 8, 14], fill=Y)
    d.polygon([(7, 4), (3, 1), (3, 4)], fill=Y)
    d.polygon([(8, 4), (12, 1), (12, 4)], fill=Y)
    return outline(img)


def anger():
    img, d = new()
    for (x, y, dx, dy) in ((2, 2, 1, 1), (13, 2, -1, 1), (2, 13, 1, -1), (13, 13, -1, -1)):
        px(d, [(x + dx * 3, y), (x + dx * 3, y + dy), (x + dx * 3, y + dy * 2), (x, y + dy * 3), (x + dx, y + dy * 3), (x + dx * 2, y + dy * 3)], R)
        px(d, [(x + dx * 4, y), (x, y + dy * 4)], R)
    return outline(img)


def rock():
    img, d = new()
    d.polygon([(2, 12), (3, 6), (7, 3), (12, 4), (14, 9), (13, 13), (4, 14)], fill=S)
    d.polygon([(12, 4), (14, 9), (13, 13), (10, 13), (11, 7)], fill=SD)
    px(d, [(5, 6), (6, 5), (4, 7)], W)
    return outline(img)


def run():
    img, d = new()
    d.ellipse([8, 1, 11, 4], fill=NL)
    d.line([(9, 5), (7, 9)], fill=B, width=2)
    d.line([(7, 9), (4, 12)], fill=BD, width=2)
    d.line([(7, 9), (10, 11), (10, 14)], fill=BD, width=2)
    d.line([(9, 6), (12, 8)], fill=B)
    d.line([(8, 6), (5, 6)], fill=B)
    for y in (6, 9, 12):
        d.line([(0, y), (2, y)], fill=WS)
    return outline(img)


def tag():
    img, d = new()
    d.polygon([(1, 7), (7, 1), (14, 1), (14, 8), (8, 14)], fill=Y)
    d.ellipse([10, 3, 12, 5], fill=K)
    d.line([(3, 8), (8, 3)], fill=YL)
    return outline(img)


def party():
    img, d = new()
    d.polygon([(1, 14), (4, 5), (10, 11)], fill=Y)
    d.line([(3, 9), (6, 12)], fill=R)
    d.line([(4, 7), (8, 11)], fill=B)
    px(d, [(8, 2), (12, 4), (13, 8), (10, 6), (6, 3), (14, 2)], R)
    px(d, [(11, 2), (9, 4), (12, 7)], G)
    px(d, [(7, 5), (13, 5)], B)
    return outline(img)


def star():
    img, d = new()
    d.polygon(star_points(7.5, 8, 7.4, 3.1), fill=Y)
    px(d, [(7, 2), (7, 3), (6, 5)], YL)
    return outline(img)


def pokedex():  # Pokédex vermelha (aba Pokédex)
    img, d = new()
    d.rounded_rectangle([2, 1, 13, 14], radius=2, fill=R)
    d.line([(13, 3), (13, 13)], fill=RD)
    d.ellipse([3, 2, 7, 6], fill=W)
    d.ellipse([4, 3, 6, 5], fill=B)
    px(d, [(9, 3), (11, 3)], Y)
    px(d, [(10, 3)], G)
    d.rectangle([4, 8, 11, 12], fill=(200, 236, 200, 255))
    d.line([(5, 10), (9, 10)], fill=GD)
    return outline(img)


def back():  # voltar (↩): seta para a esquerda
    img, d = new()
    d.polygon([(1, 8), (7, 2), (7, 6), (14, 6), (14, 10), (7, 10), (7, 14)], fill=W)
    d.line([(8, 9), (14, 9)], fill=WS)
    return outline(img)


def berry():
    img, d = new()
    d.polygon([(2, 5), (13, 5), (8, 15), (7, 15)], fill=R)
    d.ellipse([2, 3, 13, 10], fill=R)
    d.polygon([(4, 3), (7, 0), (8, 3), (11, 1), (11, 4), (4, 5)], fill=G)
    px(d, [(5, 7), (8, 6), (10, 8), (6, 10), (9, 11), (7, 13)], YL)
    return outline(img)


def map_icon():  # mapa dobrado (aba Mapa)
    img, d = new()
    d.polygon([(1, 3), (5, 1), (10, 3), (14, 1), (14, 12), (10, 14), (5, 12), (1, 14)], fill=(236, 220, 170, 255))
    d.polygon([(5, 1), (10, 3), (10, 14), (5, 12)], fill=(214, 194, 140, 255))
    px(d, [(3, 6), (4, 7), (6, 8), (7, 9), (8, 9)], G)
    px(d, [(9, 5), (10, 6), (11, 7)], B)
    px(d, [(11, 9), (12, 10), (11, 10), (12, 9)], R)  # X do destino
    return outline(img)


def user():  # treinador de boné (aba Conta)
    img, d = new()
    d.rectangle([5, 4, 10, 8], fill=(250, 210, 170, 255))   # rosto
    px(d, [(6, 6), (9, 6)], K)                                # olhos
    d.rounded_rectangle([4, 0, 11, 4], radius=2, fill=R)     # boné
    d.rectangle([4, 3, 13, 4], fill=RD)                       # aba
    d.rectangle([6, 1, 8, 2], fill=W)                         # emblema
    d.rounded_rectangle([3, 10, 12, 15], radius=3, fill=B)    # jaqueta
    d.line([(7, 10), (7, 15)], fill=BD)
    px(d, [(4, 11), (5, 11)], BL)
    return outline(img)


def news():  # jornal (Novidades)
    img, d = new()
    d.rectangle([1, 2, 14, 14], fill=W)
    d.line([(14, 3), (14, 14)], fill=WS)
    d.rectangle([3, 4, 12, 5], fill=R)
    d.rectangle([3, 7, 7, 11], fill=S)
    for y in (7, 9, 11):
        d.line([(9, y), (12, y)], fill=SD)
    d.line([(3, 13), (12, 13)], fill=SD)
    return outline(img)


def wave():  # ondas (mapas de mar)
    img, d = new()
    for y0, c, crest in ((2, BL, W), (7, B, BL), (12, BD, B)):
        pts = [(0, y0 + 2), (2, y0), (5, y0), (7, y0 + 2), (10, y0 + 2), (12, y0), (15, y0)]
        d.line(pts, fill=c, width=3)
        px(d, [(2, y0), (3, y0), (12, y0), (13, y0)], crest)
    return outline(img)


def check():  # ✔
    img, d = new()
    d.line([(2, 8), (6, 12), (13, 3)], fill=G, width=3)
    px(d, [(2, 7), (12, 3)], GL)
    return outline(img)


def cross():  # ✖
    img, d = new()
    d.line([(3, 3), (12, 12)], fill=R, width=3)
    d.line([(12, 3), (3, 12)], fill=R, width=3)
    return outline(img)


ICONS = {
    'trophy': trophy, 'coin': coin, 'money': money, 'lock': lock, 'swords': swords, 'crown': crown,
    'target': target, 'globe': globe, 'friends': friends, 'hourglass': hourglass, 'bolt': bolt,
    'flag': flag, 'sound': lambda: speaker(False), 'mute': lambda: speaker(True), 'door': door,
    'cart': cart, 'medal': medal, 'castle': castle, 'boom': boom, 'heart': heart,
    'heal': lambda: heart(G, GL, GD), 'dizzy': dizzy, 'chat': chat, 'home': home, 'plus': plus,
    'leaf': leaf, 'scroll': scroll, 'note': note, 'dice': dice, 'bat': bat, 'shoe': shoe,
    'sparkles': sparkles, 'gold': lambda: medal(Y, YD), 'silver': lambda: medal(W, S),
    'bronze': lambda: medal((214, 140, 80, 255), (150, 90, 44, 255)), 'robot': robot, 'gift': gift,
    'anger': anger, 'pokedex': pokedex, 'back': back, 'rock': rock, 'run': run, 'tag': tag, 'party': party, 'star': star, 'berry': berry,
    'map': map_icon, 'user': user, 'news': news, 'wave': wave, 'check': check, 'cross': cross,
}

# ---------- Ícone do site (aba do navegador e atalho no celular) ----------

def site_icon():
    """Poké Ball com uma coroa dourada em cima (o "Royale"), em 32 x 32."""
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Bola pixel a pixel: metade de cima vermelha, de baixo branca, faixa escura; luz em cima/esquerda
    cx, cy, r = 15.5, 18.5, 11.6
    for y in range(32):
        for x in range(32):
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy > r * r:
                continue
            lit = (dx + 2.2) ** 2 + (dy + 2.2) ** 2 < (r * 0.92) ** 2  # fora disso, a borda de baixo/direita fica na sombra
            if 17 <= y <= 19:
                c = K
            elif y < 17:
                c = R if lit else RD
            else:
                c = W if lit else WS
            d.point((x, y), fill=c)
    px(d, [(9, 11), (10, 10), (11, 10), (8, 12), (8, 13), (9, 12)], RL)  # brilho
    d.ellipse([11, 14, 20, 23], fill=K)
    d.ellipse([13, 16, 18, 21], fill=W)
    px(d, [(17, 20), (18, 19)], WS)
    # Coroa por cima da bola
    d.polygon([(8, 9), (8, 3), (11, 6), (15.5, 1), (20, 6), (23, 3), (23, 9)], fill=Y)
    d.rectangle([8, 8, 23, 10], fill=YD)
    px(d, [(9, 4), (9, 5), (15, 2), (15, 3)], YL)
    px(d, [(15, 9), (16, 9)], R)  # pedra vermelha na base da coroa
    px(d, [(11, 9), (20, 9)], B)
    return outline(img)


def build_site_icons():
    """favicon.ico (16, 32 e 48), favicon-32.png e os ícones grandes (celular e atalho), ampliados sem suavizar."""
    icon = site_icon()
    icon.save(ROOT / 'favicon-32.png')
    sizes = [(16, 16), (32, 32), (48, 48)]
    icon.resize((48, 48), Image.NEAREST).save(ROOT / 'favicon.ico', sizes=sizes)
    for size, name in ((180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')):
        # Fundo escuro da interface com margem, para o ícone não encostar na borda no celular
        big = Image.new('RGBA', (size, size), (24, 30, 58, 255))
        inner = int(size * 0.78) // 32 * 32 or 32
        art = icon.resize((inner, inner), Image.NEAREST)
        big.alpha_composite(art, ((size - inner) // 2, (size - inner) // 2))
        big.save(ROOT / name)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in ICONS.items():
        fn().save(OUT / f'{name}.png')
    build_site_icons()
    print(f'{len(ICONS)} ícones em {OUT}')
    if '--preview' in sys.argv:
        folder = Path(sys.argv[sys.argv.index('--preview') + 1])
        cols = 11
        rows = (len(ICONS) + cols - 1) // cols
        scale = 5
        sheet = Image.new('RGBA', (cols * 18 * scale, rows * 18 * scale), (40, 52, 90, 255))
        for i, name in enumerate(ICONS):
            img = Image.open(OUT / f'{name}.png').resize((16 * scale, 16 * scale), Image.NEAREST)
            sheet.alpha_composite(img, ((i % cols) * 18 * scale + scale, (i // cols) * 18 * scale + scale))
        sheet.save(folder / 'icones-preview.png')
