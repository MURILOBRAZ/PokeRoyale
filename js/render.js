// Desenha o estado do jogo no <canvas>. viewSide define de que lado a arena é vista
// (o jogador de cima no multiplayer vê tudo invertido, com a própria base embaixo).

const TEAM = { me: '#3b82f6', enemy: '#ef4444' };

// Escala dos sprites do SpriteCollab: pixels da folha por tile da arena.
// Pokémon gigantes (Onix, Gyarados...) são reduzidos para não cobrir a arena.
const PMD_PIXELS_PER_TILE = 16;
const PMD_MAX_WALK_HEIGHT = 64;
// Octante da direção (0 = leste, sentido horário na tela) -> linha da folha do SpriteCollab
const PMD_DIR_ROWS = [2, 1, 0, 7, 6, 5, 4, 3];
const animLength = (anim) => anim.d.reduce((a, b) => a + b, 0);

// Partículas que passam pela arena, pelo tipo do ginásio (vy < 0 sobe; spin: gira; glow: brilha)
const AMBIENT = {
  normal: { colors: ['#9fd36b', '#6fb847', '#d9ef9a'], shape: 'leaf', vx: 0.5, vy: 0.35, size: 0.16, n: 9 },
  rock: { colors: ['#d8c8a0', '#b9a77c'], shape: 'dust', vx: 0.6, vy: 0.1, size: 0.12, n: 10 },
  water: { colors: ['#dff4ff', '#a8dcff'], shape: 'bubble', vx: 0.1, vy: -0.45, size: 0.13, n: 10 },
  electric: { colors: ['#fff59d', '#ffe14d'], shape: 'spark', vx: 0.3, vy: -0.2, size: 0.12, n: 8, glow: true },
  grass: { colors: ['#ffb7d5', '#ff8fbf', '#ffe0ee'], shape: 'leaf', vx: 0.45, vy: 0.3, size: 0.15, n: 11 },
  poison: { colors: ['#c58ae0', '#9a5fc0'], shape: 'bubble', vx: 0.15, vy: -0.3, size: 0.15, n: 9 },
  psychic: { colors: ['#ffc2e0', '#e7b0ff'], shape: 'spark', vx: 0.1, vy: -0.25, size: 0.13, n: 10, glow: true },
  fire: { colors: ['#ffb347', '#ff7a1a', '#ffe08a'], shape: 'ember', vx: 0.2, vy: -0.6, size: 0.09, n: 12, glow: true },
  ground: { colors: ['#d2b48c', '#b89870'], shape: 'dust', vx: 0.7, vy: 0.05, size: 0.13, n: 10 },
  ice: { colors: ['#ffffff', '#cdeeff'], shape: 'snow', vx: 0.25, vy: 0.4, size: 0.1, n: 14 },
};

const imageCache = {};
function getImage(url) {
  let entry = imageCache[url];
  if (!entry) {
    const img = new Image();
    entry = imageCache[url] = { img, ok: false, failed: false };
    img.onload = () => (entry.ok = true);
    img.onerror = () => (entry.failed = true);
    img.src = url;
  }
  return entry.ok ? entry.img : null;
}

class Renderer {
  constructor(canvas, viewSide = 0) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewSide = viewSide;
    this.setArena(0);
    this.resize();
  }

  // Visual de cada arena: mapa desenhado (assets/arenas); enquanto carrega, o gramado nas cores do ginásio
  setArena(id) {
    const arena = ARENAS[id] || ARENAS[0];
    this.ground = arena.ground;
    this.ambient = AMBIENT[arena.types[0]] || AMBIENT.normal;
    this.river = arena.river;
    this.mapUrl = arena.map ? arenaMapUrl(arena) : null;
    // Mapa completo (com as bordas decorativas) para preencher a tela além da arena
    this.mapArt = arena.map && typeof ARENA_ART !== 'undefined' ? ARENA_ART[arena.map] : null;
    this.mapFullUrl = this.mapArt ? `assets/arenas/${arena.map}-full.webp` : null;
    if (this.mapUrl) getImage(this.mapUrl); // começa a carregar já
    if (this.mapFullUrl) getImage(this.mapFullUrl);
  }

  // Vida na arena por cima do mapa: brilhos correndo no rio e partículas do tema do ginásio passando
  _drawAmbient() {
    const ctx = this.ctx;
    const s = this.scale;
    const now = performance.now() / 1000;
    const hash = (n) => {
      const v = Math.sin(n * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    ctx.save();
    // Rio: na água, reflexos que aparecem, correm um pouco e somem; na lava e no veneno, bolhas
    // estourando (nunca por cima das pontes). Abismos, cristais e cânions ficam como no desenho.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, s * 0.06);
    const bubbles = this.river === 'lava' || this.river === 'poison';
    for (let i = 0; i < (this.river ? 16 : 0); i++) {
      const cycle = 2.5 + hash(i) * 2;
      const k = ((now + hash(i + 1) * cycle) % cycle) / cycle;
      const round = Math.floor((now + hash(i + 1) * cycle) / cycle);
      const wx = (hash(i * 7 + round) * ARENA.W + k * 1.2) % ARENA.W;
      if (ARENA.BRIDGES.some((b) => Math.abs(wx - b) < ARENA.BRIDGE_HALF + 0.3)) continue;
      const wy = ARENA.RIVER_TOP + 0.4 + hash(i * 3 + round) * (ARENA.RIVER_BOTTOM - ARENA.RIVER_TOP - 0.8);
      const [x, y] = this.w2s(wx, wy);
      if (bubbles) {
        // Bolha cresce e estoura
        ctx.globalAlpha = 0.6 * (k < 0.85 ? 1 : (1 - k) / 0.15);
        ctx.strokeStyle = this.river === 'lava' ? '#ffb13b' : '#d58ae8';
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, s * (0.08 + k * 0.18), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = 0.45 * Math.sin(k * Math.PI);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.3, y);
      ctx.lineTo(x + s * 0.3, y);
      ctx.stroke();
      if (i % 4 === 0) {
        ctx.fillStyle = '#ffffff';
        this._star(x, y - s * 0.1, s * 0.12 * Math.sin(k * Math.PI));
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // Partículas do tema atravessando a arena devagar
    const amb = this.ambient;
    if (amb) {
      for (let i = 0; i < amb.n; i++) {
        const speed = 0.6 + hash(i + 40) * 0.6;
        const px = (((hash(i + 10) * ARENA.W + now * amb.vx * speed) % ARENA.W) + ARENA.W) % ARENA.W;
        const py = (((hash(i + 20) * ARENA.H + now * amb.vy * speed * 2) % ARENA.H) + ARENA.H) % ARENA.H;
        const [x, y] = this.w2s(px + Math.sin(now * 0.8 + i) * 0.4, py);
        const r = s * amb.size * (0.7 + hash(i + 30) * 0.6);
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now * 2 + i);
        ctx.fillStyle = amb.colors[i % amb.colors.length];
        if (amb.glow) ctx.globalCompositeOperation = 'lighter';
        switch (amb.shape) {
          case 'leaf':
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(now * (1 + hash(i) * 2) + i);
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.4, r * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            break;
          case 'bubble':
            ctx.strokeStyle = amb.colors[i % amb.colors.length];
            ctx.lineWidth = Math.max(1, s * 0.03);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'spark':
            this._star(x, y, r * (1 + 0.5 * Math.sin(now * 5 + i)));
            break;
          default:
            // dust, ember, snow: bolinha
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }

  // Retângulo do mundo -> tela (cuida da arena invertida do jogador de cima)
  _rect(x1, y1, x2, y2) {
    const [ax, ay] = this.w2s(x1, y1);
    const [bx, by] = this.w2s(x2, y2);
    return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
  }

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    // O campo ocupa a tela inteira (sem bordas): escala horizontal e vertical independentes,
    // com diferença limitada entre elas (MAX_STRETCH). Sprites usam a menor (this.scale).
    // Celular com barras do navegador deixa a área mais "alta" que o campo: até 30% de esticada
    // (só o mapa estica; os sprites usam a menor escala e não deformam)
    const MAX_STRETCH = 1.3;
    let sx = w / ARENA.W;
    let sy = h / ARENA.H;
    if (sx > sy * MAX_STRETCH) sx = sy * MAX_STRETCH;
    if (sy > sx * MAX_STRETCH) sy = sx * MAX_STRETCH;
    this.sx = sx;
    this.sy = sy;
    this.scale = Math.min(sx, sy);
    this.ox = (w - sx * ARENA.W) / 2;
    this.oy = (h - sy * ARENA.H) / 2;
  }

  w2s(x, y) {
    if (this.viewSide === 1) {
      x = ARENA.W - x;
      y = ARENA.H - y;
    }
    return [this.ox + x * this.sx, this.oy + y * this.sy];
  }

  // Coordenadas CSS relativas ao canvas -> mundo
  s2w(px, py) {
    let x = (px - this.ox) / this.sx;
    let y = (py - this.oy) / this.sy;
    if (this.viewSide === 1) {
      x = ARENA.W - x;
      y = ARENA.H - y;
    }
    return [x, y];
  }

  teamColor(side) {
    return side === this.viewSide ? TEAM.me : TEAM.enemy;
  }

  draw(game, ui) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const [shx, shy] = this._shakeOffset(game);
    if (shx || shy) {
      ctx.fillStyle = '#0d1324';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.translate(shx, shy);
    }
    this._drawGround();
    this._drawAmbient();
    if (ui.selected) this._drawDeployZone(game, ui);

    for (const s of game.spells) this._drawPendingSpell(s);

    const drawables = [...game.towers, ...game.units].sort((a, b) => this.w2s(a.x, a.y)[1] - this.w2s(b.x, b.y)[1]);
    for (const d of drawables) {
      if (d.isTower) this._drawTower(d, game);
      else this._drawUnit(d, game);
    }
    for (const p of game.projectiles) this._drawProjectile(p);
    for (const e of game.effects) this._drawEffect(e);
    this._drawSparkles(game);
    if (ui.bubbles) this._drawBubbles(game, ui.bubbles);
    if (ui.selected && ui.hover) this._drawGhost(game, ui);
  }

  _drawGround() {
    const ctx = this.ctx;
    const s = this.scale;
    const map = this.mapUrl && getImage(this.mapUrl);
    const full = this.mapFullUrl && getImage(this.mapFullUrl);
    if (map || full) {
      // O mapa já tem rio, pontes e pistas alinhados à grade (tools/build-arenas.py).
      // O completo preenche também as laterais da tela com a decoração do desenho, sem bordas vazias.
      const w = ARENA.W * this.sx;
      const h = ARENA.H * this.sy;
      const cw = this.canvas.width / this.dpr;
      const ch = this.canvas.height / this.dpr;
      ctx.fillStyle = '#0d1324';
      ctx.fillRect(0, 0, cw, ch);
      // Telas mais largas que o desenho (PC, tablet): o próprio mapa, ampliado e desfocado, cobre o que sobrar
      const bg = full || map;
      if (bg) {
        const k = Math.max(cw / bg.width, ch / bg.height) * 1.08;
        ctx.save();
        ctx.filter = 'blur(10px) brightness(0.55) saturate(1.1)';
        ctx.drawImage(bg, (cw - bg.width * k) / 2, (ch - bg.height * k) / 2, bg.width * k, bg.height * k);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(this.ox + w / 2, this.oy + h / 2);
      if (this.viewSide === 1) ctx.rotate(Math.PI);
      if (full) {
        const [x0, y0, x1, y1] = this.mapArt;
        const fw = w / (x1 - x0);
        const fh = h / (y1 - y0);
        ctx.drawImage(full, -w / 2 - x0 * fw, -h / 2 - y0 * fh, fw, fh);
      } else {
        ctx.drawImage(map, -w / 2, -h / 2, w, h);
      }
      ctx.restore();
      return;
    }
    for (let ty = 0; ty < ARENA.H; ty++) {
      for (let tx = 0; tx < ARENA.W; tx++) {
        const [x, y] = this.w2s(tx + (this.viewSide ? 1 : 0), ty + (this.viewSide ? 1 : 0));
        ctx.fillStyle = this.ground[(tx + ty) % 2];
        ctx.fillRect(x, y, this.sx + 0.5, this.sy + 0.5);
      }
    }
    // Reserva enquanto o mapa carrega: pistas e plataformas no mesmo molde dos mapas
    ctx.fillStyle = 'rgba(245, 228, 190, 0.38)';
    for (const b of ARENA.BRIDGES) {
      ctx.fillRect(...this._rect(b - ARENA.BRIDGE_HALF * 0.9, 5, b + ARENA.BRIDGE_HALF * 0.9, 27));
    }
    ctx.fillRect(...this._rect(6.4, 0.6, 11.6, 5.3));
    ctx.fillRect(...this._rect(6.4, 26.7, 11.6, 31.4));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = Math.max(2, s * 0.12);
    const [cx, cy] = this.w2s(9, 9.5);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 2.2, 0, Math.PI * 2);
    ctx.stroke();
    // Rio
    const [rx, ry] = this.w2s(this.viewSide ? ARENA.W : 0, this.viewSide ? ARENA.RIVER_BOTTOM : ARENA.RIVER_TOP);
    const rh = (ARENA.RIVER_BOTTOM - ARENA.RIVER_TOP) * this.sy;
    const grad = ctx.createLinearGradient(0, ry, 0, ry + rh);
    grad.addColorStop(0, '#3d8fd1');
    grad.addColorStop(0.5, '#5cb3ee');
    grad.addColorStop(1, '#3d8fd1');
    ctx.fillStyle = grad;
    ctx.fillRect(rx, ry, ARENA.W * this.sx, rh);
    // Ondinhas
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    const t = performance.now() / 1000;
    for (let i = 0; i < 9; i++) {
      const wx = rx + ((i * 2.1 + t * 0.6) % ARENA.W) * this.sx;
      const wy = ry + rh * (i % 2 ? 0.35 : 0.68);
      ctx.beginPath();
      ctx.arc(wx, wy, s * 0.3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    // Pontes
    for (const b of ARENA.BRIDGES) {
      const [bx, by] = this.w2s(this.viewSide ? b + ARENA.BRIDGE_HALF : b - ARENA.BRIDGE_HALF, this.viewSide ? ARENA.RIVER_BOTTOM + 0.4 : ARENA.RIVER_TOP - 0.4);
      const bw = ARENA.BRIDGE_HALF * 2 * this.sx;
      const bh = rh + 0.8 * this.sy;
      ctx.fillStyle = '#9a6a3a';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#6e4622';
      ctx.lineWidth = Math.max(1, s * 0.05);
      for (let k = 1; k < 6; k++) {
        ctx.beginPath();
        ctx.moveTo(bx, by + (bh * k) / 6);
        ctx.lineTo(bx + bw, by + (bh * k) / 6);
        ctx.stroke();
      }
      ctx.strokeRect(bx, by, bw, bh);
    }
    // Moldura da arena
    const [ax, ay] = this.w2s(this.viewSide ? ARENA.W : 0, this.viewSide ? ARENA.H : 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ax, ay, ARENA.W * this.sx, ARENA.H * this.sy);
  }

  _drawDeployZone(game, ui) {
    const card = CARDS[ui.selected];
    if (card.kind === 'spell') return;
    const ctx = this.ctx;
    const s = this.scale;
    ctx.fillStyle = 'rgba(220, 30, 30, 0.22)';
    for (let ty = 0; ty < ARENA.H; ty++) {
      for (let tx = 0; tx < ARENA.W; tx++) {
        if (game.isValidPosition(ui.side, ui.selected, tx + 0.5, ty + 0.5)) continue;
        const [x, y] = this.w2s(tx + (this.viewSide ? 1 : 0), ty + (this.viewSide ? 1 : 0));
        ctx.fillRect(x, y, this.sx + 0.5, this.sy + 0.5);
      }
    }
  }

  _bar(cx, y, w, ratio, color) {
    const ctx = this.ctx;
    const h = Math.max(4, this.scale * 0.18);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w / 2, y, w * Math.max(0, ratio), h);
  }

  _drawTower(t, game) {
    const ctx = this.ctx;
    const [x, y] = this.w2s(t.x, t.y);
    const r = t.radius * this.scale;
    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.75, r * 1.05, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (t.dead) {
      this._drawRuins(t, x, y, r);
      return;
    }

    const color = this.teamColor(t.side);
    const mine = t.side === this.viewSide;
    const sprite = getImage(`assets/ginasios/${t.kind === 'king' ? 'lider' : 'lateral'}-${mine ? 'azul' : 'vermelho'}.webp`);
    let top = y - r;
    let bottom = y + r;
    if (sprite) {
      // Desenho do ginásio apoiado na base do círculo de colisão
      const w = r * (t.kind === 'king' ? 2.15 : 2.3);
      const h = (w * sprite.height) / sprite.width;
      bottom = y + r * 0.85;
      top = bottom - h;
      ctx.save();
      // Skin de ginásio (cosmético): filtro de cor e brilho em volta; as cores de time continuam
      const skin = COSMETICS[(game.skins || [])[t.side]];
      const look = skin && skin.filter ? skin.filter : '';
      if (t.hitFlash > 0 || look) ctx.filter = `${t.hitFlash > 0 ? 'brightness(1.7) ' : ''}${look}`.trim() || 'none';
      if (skin && skin.glow) {
        ctx.shadowColor = skin.glow;
        ctx.shadowBlur = this.scale * 1.6;
      }
      // Recuo ao atirar: o ginásio achata um pouco, apoiado na base
      const since = game.time - (t.attackT ?? -99);
      const kick = Math.max(0, 1 - since / 0.15);
      const kw = w * (1 + 0.03 * kick);
      const kh = h * (1 - 0.05 * kick);
      ctx.drawImage(sprite, x - kw / 2, bottom - kh, kw, kh);
      if (skin && skin.glow) ctx.drawImage(sprite, x - kw / 2, bottom - kh, kw, kh); // 2ª passada reforça o brilho da skin
      ctx.restore();
      // Clarão de estrelas na boca do canhão (no Líder, na coroa)
      if (since >= 0 && since < 0.14) {
        const f = since / 0.14;
        const fy = top + h * (t.kind === 'king' ? 0.1 : mine ? 0.12 : 0.25);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = '#ffe98a';
        ctx.beginPath();
        ctx.arc(x, fy, this.scale * (0.35 + f * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + (t.id || 0);
          this._star(x + Math.cos(a) * this.scale * 0.7 * f, fy + Math.sin(a) * this.scale * 0.5 * f, this.scale * 0.16 * (1 - f * 0.5));
        }
        ctx.restore();
      }
    } else {
      this._drawPokeballTower(x, y, r, t, color);
    }
    if (t.kind === 'king' && !t.active) {
      ctx.font = `bold ${r * 0.45}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = '#ffffff';
      ctx.strokeText('z z', x + r * 0.95, top + r * 0.5);
      ctx.fillText('z z', x + r * 0.95, top + r * 0.5);
    }
    // Barra de vida do lado de dentro da arena (abaixo dos ginásios de cima, acima dos de baixo)
    const bw = r * 2;
    const upper = y < this.oy + (ARENA.H * this.scale) / 2;
    const by = upper ? bottom + this.scale * 0.1 : top - this.scale * 0.75;
    this._bar(x, by, bw, t.hp / t.maxHp, color);
    ctx.font = `bold ${Math.max(9, this.scale * 0.36)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.fillStyle = '#fff';
    const txt = String(Math.ceil(t.hp));
    ctx.strokeText(txt, x, by + this.scale * 0.22);
    ctx.fillText(txt, x, by + this.scale * 0.22);
  }

  // Ginásio destruído: sobra a base do desenho, quebrada e escurecida, com pedras em volta e fumaça subindo
  _drawRuins(t, x, y, r) {
    const ctx = this.ctx;
    const s = this.scale;
    const now = performance.now() / 1000;
    const mine = t.side === this.viewSide;
    const sprite = getImage(`assets/ginasios/${t.kind === 'king' ? 'lider' : 'lateral'}-${mine ? 'azul' : 'vermelho'}.webp`);
    const rnd = (n) => {
      const v = Math.sin(t.id * 12.9898 + n * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const bottom = y + r * 0.85;
    if (sprite) {
      const w = r * (t.kind === 'king' ? 2.15 : 2.3);
      const h = (w * sprite.height) / sprite.width;
      const keep = 0.4; // fração de baixo que continua de pé
      ctx.save();
      // Borda de cima irregular: só o que fica abaixo da linha quebrada aparece
      ctx.beginPath();
      ctx.moveTo(x - w / 2, bottom);
      for (let i = 0; i <= 8; i++) {
        ctx.lineTo(x - w / 2 + (w * i) / 8, bottom - h * keep * (0.7 + rnd(i) * 0.45));
      }
      ctx.lineTo(x + w / 2, bottom);
      ctx.closePath();
      ctx.clip();
      ctx.filter = 'grayscale(0.6) brightness(0.55)';
      ctx.drawImage(sprite, x - w / 2, bottom - h, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#7a7a7a';
      ctx.beginPath();
      ctx.arc(x, y + r * 0.3, r * 0.75, Math.PI, 0);
      ctx.fill();
    }
    // Pedras caídas em volta
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.05 + rnd(i + 10) * 0.9);
      const d = r * (0.9 + rnd(i + 20) * 0.5);
      const px = x + Math.cos(a) * d * (i % 2 ? 1 : -1);
      const py = bottom - r * 0.15 + rnd(i + 30) * r * 0.35;
      const pr = s * (0.14 + rnd(i + 40) * 0.16);
      ctx.fillStyle = i % 3 ? '#8d8676' : '#6d675b';
      ctx.strokeStyle = '#3e3a32';
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const ka = (k / 5) * Math.PI * 2 + rnd(i + k);
        ctx.lineTo(px + Math.cos(ka) * pr, py + Math.sin(ka) * pr * 0.75);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Fumaça subindo devagar
    ctx.fillStyle = '#c9c4ba';
    for (let i = 0; i < 4; i++) {
      const k = (now * 0.25 + i / 4 + rnd(i + 50)) % 1;
      ctx.globalAlpha = 0.35 * Math.sin(k * Math.PI);
      ctx.beginPath();
      ctx.arc(x + (rnd(i + 60) - 0.5) * r + Math.sin(now + i) * s * 0.3, bottom - r * 0.6 - k * s * 2.6, s * (0.3 + k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Reserva enquanto o desenho do ginásio carrega: Pokébola na cor do time
  _drawPokeballTower(x, y, r, t, color) {
    const ctx = this.ctx;
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.hitFlash > 0 ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.stroke();
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (t.kind === 'king') {
      this._icon('crown', x, y - r * 1.15, r * 0.9);
    }
  }

  // Construção: arte própria (assets/construcoes) ou, no Snorlax, o sprite dormindo
  _drawBuilding(b, game) {
    const ctx = this.ctx;
    const s = this.scale;
    const [x, y] = this.w2s(b.x, b.y);
    const r = b.radius * s;
    const color = this.teamColor(b.side);
    const now = performance.now() / 1000;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.45, r * 1.25, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.stroke();

    ctx.save();
    if (b.deploy > 0) ctx.globalAlpha = 0.5;
    if (b.hitFlash > 0) ctx.filter = 'brightness(1.9)';
    // Pulinho ao atirar
    const kick = Math.max(0, 1 - (game.time - (b.attackT ?? -99)) / 0.18);
    let top;
    if (b.card.id === 'sleepingsnorlax') {
      const sp = SPRITES[143];
      const f = sp && this._sheetFrame(143, sp.idle, 0, this.viewSide === 0 ? Math.PI / 2 : -Math.PI / 2, sp.walk.h);
      if (f) {
        const k = f.k * 1.25;
        const breathe = 1 + Math.sin(now * 2) * 0.03;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, x - (f.w * k) / 2, y - (f.h * k) / 2 - (f.h * k) * (breathe - 1), f.w * k, f.h * k * breathe);
        top = y - (f.walkH * k) / 2;
      } else {
        // Sprite ainda carregando: o retrato da carta
        const img = getImage(b.card.icon);
        const size = r * 2.6;
        if (img) ctx.drawImage(img, x - size / 2, y - size * 0.85, size, size);
        top = y - size * 0.85;
      }
      // Zzz
      ctx.filter = 'none';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) {
        const p = (now * 0.5 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(p * Math.PI) * (b.deploy > 0 ? 0.5 : 1);
        ctx.font = `bold ${s * (0.35 + i * 0.12)}px sans-serif`;
        const zx = x + r * 0.6 + p * s * 0.8;
        const zy = top - p * s * 1.2;
        ctx.strokeText('z', zx, zy);
        ctx.fillText('z', zx, zy);
      }
    } else {
      // Pixel art (tools/build-construcoes.py) na mesma escala dos sprites, sem suavizar
      const img = getImage(b.card.icon);
      if (img) {
        const k = s / PMD_PIXELS_PER_TILE;
        const sq = 1 + kick * 0.06;
        const w = img.naturalWidth * k * sq;
        const h = img.naturalHeight * k * (2 - sq);
        const left = x - w / 2;
        const tp = y + r * 0.5 - h;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, left, tp, w, h);
        this._buildingPokemon(b, img, left, tp, k, now);
        top = tp;
      } else {
        ctx.fillStyle = TYPE_COLORS[b.card.type];
        ctx.fillRect(x - r, y - r * 1.5, r * 2, r * 2);
        top = y - r * 1.5;
      }
    }
    ctx.restore();

    if (b.deploy > 0) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.beginPath();
      ctx.arc(x, y + r * 0.45, r * 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - b.deploy / MATCH.DEPLOY_TIME));
      ctx.stroke();
    }
    const barY = top - s * 0.25;
    this._bar(x, barY, Math.max(s * 1.2, r * 2), b.hp / b.maxHp, color);
    // Ampulheta: a construção está acabando sozinha
    this._icon('hourglass', x - Math.max(s * 1.2, r * 2) / 2 - s * 0.2, barY + s * 0.08, s * 0.34);
    if (b.stun > 0) this._icon('dizzy', x + r, top + s * 0.4, s * 0.5);
  }

  // Quadro animado de um Pokémon (idle) para enfeitar as construções
  _idleFrame(dex, angle, phase, now) {
    const sp = SPRITES[dex];
    if (!sp) return null;
    let tick = (now * 60 + phase) % animLength(sp.idle);
    let i = 0;
    while (i < sp.idle.d.length - 1 && tick >= sp.idle.d[i]) {
      tick -= sp.idle.d[i];
      i++;
    }
    return this._sheetFrame(dex, sp.idle, i, angle, sp.walk.h);
  }

  // Pokémon de verdade em cada construção: Chansey no Centro, Gastly rondando a Torre,
  // Zubat na boca da Caverna e Mewtwo dentro da cápsula do Laboratório.
  // (px, py) = ponto na pixel art onde fica o pé/centro do Pokémon.
  _buildingPokemon(b, img, left, top, k, now) {
    const ctx = this.ctx;
    const down = Math.PI / 2;
    const at = (px, py) => [left + px * k, top + py * k];
    const draw = (f, cx, cy, scale = 1, alpha = 1) => {
      if (!f) return;
      const w = f.w * f.k * scale;
      const h = f.h * f.k * scale;
      ctx.globalAlpha = alpha * (b.deploy > 0 ? 0.5 : 1);
      ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, cx - w / 2, cy - h / 2, w, h);
      ctx.globalAlpha = b.deploy > 0 ? 0.5 : 1;
    };
    const id = b.card.id;
    if (id === 'pokecenter') {
      const [cx, cy] = at(42, 40);
      draw(this._idleFrame(113, down, b.id * 7, now), cx, cy, 0.8);
    } else if (id === 'pokemontower') {
      const t = now * 1.6 + b.id;
      const [cx, cy] = at(20 + Math.cos(t) * 15, 16 + Math.sin(t) * 5);
      draw(this._idleFrame(92, down, b.id * 7, now), cx, cy, 0.75, 0.9);
    } else if (id === 'zubatcave') {
      const t = now * 1.3 + b.id;
      const [cx, cy] = at(28 + Math.sin(t) * 9, 16 + Math.sin(t * 2) * 3);
      draw(this._idleFrame(41, down, b.id * 7, now), cx, cy, 0.7);
    } else if (id === 'mewtwolab') {
      const [cx, cy] = at(27.5, 16 + Math.sin(now * 2) * 1.2);
      const f = this._idleFrame(150, down, b.id * 7, now);
      if (f) draw(f, cx, cy, Math.min(1, (24 * k) / (f.walkH * f.k)), 0.9);
      // Vidro por cima do Mewtwo
      ctx.globalAlpha = 0.45 * (b.deploy > 0 ? 0.5 : 1);
      ctx.drawImage(img, 18, 2, 20, 28, left + 18 * k, top + 2 * k, 20 * k, 28 * k);
      ctx.globalAlpha = 1;
    }
  }

  // Ícone em pixel art (assets/icones) centrado em (cx, cy), com `size` px de lado
  _icon(name, cx, cy, size) {
    const img = getImage(iconUrl(name));
    if (!img) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  }

  _drawUnit(u, game) {
    if (u.isBuilding) return this._drawBuilding(u, game);
    // Enquanto a Poké Ball voa (começo do efeito 'spawn'), o Pokémon ainda não apareceu
    if (u.deploy > MATCH.DEPLOY_TIME - 0.3) return;
    const ctx = this.ctx;
    const s = this.scale;
    const [x, y] = this.w2s(u.x, u.y);
    const r = u.radius * s;
    const color = this.teamColor(u.side);
    const now = performance.now() / 1000;
    const lift = u.air ? s * 0.9 + Math.sin(now * 6 + u.id) * s * 0.1 : 0;

    // Lendário: aura dourada pulsando embaixo
    if (u.def.legendary) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now * 4 + u.id);
      ctx.fillStyle = '#ffd75a';
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.5, r * 1.8, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Anel do time no chão (nadando: ondas na água em volta, na cor do time, e rastro atrás)
    if (u.swimming) {
      this._drawSwimWater(u, x, y, r, color, now);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.5, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.stroke();
    }

    ctx.save();
    if (u.deploy > 0) ctx.globalAlpha = 0.5;
    ctx.imageSmoothingEnabled = false;
    if (u.hitFlash > 0) ctx.filter = 'brightness(1.9)';
    else if (u.slowT > 0) ctx.filter = 'saturate(0.6) hue-rotate(160deg) brightness(1.15)'; // congelando (Nevasca)
    const frame = this._unitFrame(u, game);
    const fallback = !frame && getImage(spriteFront(u.def.dex));
    let top;
    // Nadando: afunda um pouco e a parte de baixo some dentro d'água (linha d'água balançando)
    const sink = u.swimming ? s * 0.22 : 0;
    if (u.swimming) {
      ctx.beginPath();
      ctx.rect(x - s * 4, y - s * 6, s * 8, s * 6 + r * 0.35 + Math.sin(now * 5 + u.id) * s * 0.05);
      ctx.clip();
    }
    if (frame) {
      // O centro do quadro é o ponto no chão onde o Pokémon está
      const dw = frame.w * frame.k;
      const dh = frame.h * frame.k;
      ctx.drawImage(frame.img, frame.sx, frame.sy, frame.w, frame.h, x - dw / 2, y - dh / 2 - lift + sink, dw, dh);
      top = y - frame.walkH * frame.k * 0.5 - lift; // estável: não pula com a animação de ataque
    } else if (fallback) {
      // Folha animada ainda carregando: usa o sprite estático da PokéAPI
      const size = s * (2.4 + u.radius * 2.4);
      top = y - size * 0.8 - lift;
      ctx.drawImage(fallback, x - size / 2, top, size, size);
      top += size * 0.18;
    } else {
      top = y - r * 2 - lift;
      ctx.fillStyle = TYPE_COLORS[u.def.type];
      ctx.beginPath();
      ctx.arc(x, y - r - lift, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${r}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(u.def.name[0], x, y - r - lift);
    }
    ctx.restore();

    if (u.deploy > 0) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.beginPath();
      ctx.arc(x, y + r * 0.5, r * 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.deploy / MATCH.DEPLOY_TIME));
      ctx.stroke();
    }

    const barY = top - s * 0.25;
    this._bar(x, barY, Math.max(s * 0.9, r * 1.8), u.hp / u.maxHp, color);
    if (u.evolved) this._icon('star', x, barY - s * 0.2, s * 0.36);
    if (u.stun > 0) this._icon('dizzy', x + r, top + s * 0.4, s * 0.5);
  }

  // Água em volta de quem está nadando: rastro em V atrás, ondas saindo e espuma na linha d'água
  _drawSwimWater(u, x, y, r, color, now) {
    const ctx = this.ctx;
    const s = this.scale;
    const wy = y + r * 0.35;
    const a = (u.face ?? 0) + (this.viewSide === 1 ? Math.PI : 0);
    ctx.save();
    ctx.lineCap = 'round';
    if (u.moving) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, s * 0.06);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * r * 0.5, wy - Math.sin(a) * r * 0.25);
        const bx = x - Math.cos(a) * s * 1.4 + Math.cos(a + (side * Math.PI) / 2) * s * 0.6;
        const by = wy - Math.sin(a) * s * 0.7 + Math.sin(a + (side * Math.PI) / 2) * s * 0.3;
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 2; i++) {
      const k = (now * 0.9 + i * 0.5 + u.id * 0.37) % 1;
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.strokeStyle = i === 0 ? color : '#ffffff';
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.beginPath();
      ctx.ellipse(x, wy, r * (0.9 + k * 0.9), r * (0.35 + k * 0.35), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const px = x + (i - 2) * r * 0.42 + Math.sin(now * 4 + i + u.id) * s * 0.05;
      ctx.beginPath();
      ctx.arc(px, wy + Math.sin(now * 6 + i * 1.7) * s * 0.03, s * (0.06 + 0.03 * Math.sin(now * 5 + i)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Quadro atual da animação, por prioridade: surgindo (Charge; lendário faz Pose), ataque (normal ou
  // golpe próprio), vitória (Pose), levou golpe (Hurt), acabou de evoluir (Pose), voo, andar ou parado
  _unitFrame(u, game) {
    const sp = SPRITES[u.def.dex];
    if (!sp) return null;
    this._preloadSheets(u.def.dex, sp);
    const now = (performance.now() / 1000) * 60 + u.id * 13; // em quadros de 60 fps, como no SpriteCollab
    const since = (t) => (game.time - (t ?? -99)) * 60;
    const atk = unitAttackAnim(u.def, u.attackAlt);
    const base = u.air ? sp.fly || sp.idle : u.moving && !(u.deploy > 0) && !(u.stun > 0) ? sp.walk : sp.idle;
    let anim = base;
    let tick = now % animLength(base);
    const play = (a, t) => {
      anim = a;
      tick = t;
    };
    if (u.deploy > 0) {
      const a = (u.def.legendary && sp.pose) || sp.charge;
      if (a) play(a, now % animLength(a));
    } else if (atk && since(u.attackT) >= 0 && since(u.attackT) < animLength(atk)) {
      play(atk, since(u.attackT));
    } else if (game.over && game.winner === u.side && sp.pose) {
      play(sp.pose, now % animLength(sp.pose));
    } else if (sp.hurt && since(u.hurtT) >= 0 && since(u.hurtT) < animLength(sp.hurt)) {
      play(sp.hurt, since(u.hurtT));
    } else if (sp.pose && since(u.poseT) >= 0 && since(u.poseT) < animLength(sp.pose)) {
      play(sp.pose, since(u.poseT));
    }
    const angle = this._screenAngle(u);
    // Folha nova ainda carregando: segue com a animação de andar/parada em vez de piscar
    return this._animFrame(u.def.dex, anim, tick, angle, sp.walk.h) || (anim !== base && this._animFrame(u.def.dex, base, now % animLength(base), angle, sp.walk.h));
  }

  _animFrame(dex, anim, tick, angle, walkH) {
    let i = 0;
    while (i < anim.d.length - 1 && tick >= anim.d[i]) {
      tick -= anim.d[i];
      i++;
    }
    return this._sheetFrame(dex, anim, i, angle, walkH);
  }

  // Começa a baixar todas as folhas de um Pokémon quando ele aparece, para as animações extras
  // (golpe próprio, Hurt, Pose, Faint) já estarem prontas quando forem usadas
  _preloadSheets(dex, sp) {
    if (sp.preloaded) return;
    sp.preloaded = true;
    for (const a of Object.values(sp)) if (a && a.file) getImage(animSheetUrl(dex, a));
  }

  _screenAngle(u) {
    const a = u.face ?? (u.side === 0 ? -Math.PI / 2 : Math.PI / 2);
    return this.viewSide === 1 ? a + Math.PI : a;
  }

  _sheetFrame(dex, anim, index, angle, walkH) {
    const img = getImage(animSheetUrl(dex, anim));
    if (!img) return null;
    const rows = Math.round(img.naturalHeight / anim.h);
    const oct = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    const row = rows >= 8 ? PMD_DIR_ROWS[oct] : 0;
    const k = (this.scale / PMD_PIXELS_PER_TILE) * Math.min(1, PMD_MAX_WALK_HEIGHT / walkH);
    return { img, sx: index * anim.w, sy: row * anim.h, w: anim.w, h: anim.h, k, walkH };
  }

  // Brilhinhos piscando em volta dos ginásios com skin "Cristal" ou "Campeão"
  _drawSparkles(game) {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    for (const t of game.towers) {
      const skin = COSMETICS[(game.skins || [])[t.side]];
      if (t.dead || !skin || !skin.sparkle) continue;
      const [x, y] = this.w2s(t.x, t.y);
      const r = t.radius * this.scale;
      for (let i = 0; i < 3; i++) {
        const phase = (now * 1.3 + i * 0.37 + t.id * 0.11) % 1;
        const ang = (i * 2.1 + t.id) % (Math.PI * 2);
        const sx = x + Math.cos(ang) * r * 0.9;
        const sy = y - r * 0.6 + Math.sin(ang) * r * 0.7;
        const size = this.scale * 0.34 * Math.sin(phase * Math.PI);
        ctx.save();
        ctx.globalAlpha = Math.sin(phase * Math.PI);
        ctx.fillStyle = skin.glow;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const rr = k % 2 ? size * 0.35 : size;
          const a = (k * Math.PI) / 4;
          ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
        }
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Balões de emote: aparecem perto do Ginásio Líder de quem mandou
  _drawBubbles(game, bubbles) {
    const ctx = this.ctx;
    const s = this.scale;
    const now = performance.now();
    for (const b of bubbles) {
      const king = game.towers.find((t) => t.side === b.side && t.kind === 'king');
      if (!king) continue;
      const age = (now - b.start) / 1000;
      const [kx, ky] = this.w2s(king.x, king.y);
      const mine = b.side === this.viewSide;
      const size = s * 2.8;
      const pop = Math.min(1, age / 0.18);
      const fade = age > 2.1 ? Math.max(0, 1 - (age - 2.1) / 0.3) : 1;
      const cx = kx + (mine ? s * 3 : -s * 3);
      const cy = ky + (mine ? -s * 2.6 : s * 2.6);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(cx, cy);
      ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = this.teamColor(b.side);
      ctx.lineWidth = Math.max(3, s * 0.15);
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, s * 0.6);
      ctx.fill();
      ctx.stroke();
      const img = getImage(emotePortraitUrl(b.pack, b.mood));
      if (img) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -size / 2 + s * 0.2, -size / 2 + s * 0.2, size - s * 0.4, size - s * 0.4);
      }
      ctx.restore();
    }
  }

  // Tremida de tela: golpes fortes, explosões e ginásios desabando
  _shakeOffset(game) {
    let amp = 0;
    for (const e of game.effects) if (e.shake) amp = Math.max(amp, e.shake * (e.ttl / e.total));
    if (amp <= 0.01) return [0, 0];
    const t = performance.now() / 1000;
    return [Math.sin(t * 91) * amp * this.scale, Math.cos(t * 77) * amp * this.scale];
  }

  // Estrela de 4 pontas (brilhos)
  _star(cx, cy, size) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = k % 2 ? size * 0.3 : size;
      const a = (k * Math.PI) / 4;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Raio em zigue-zague entre dois pontos (tela)
  _zigzag(x1, y1, x2, y2, jitter, parts = 5) {
    const ctx = this.ctx;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < parts; i++) {
      const j = (Math.random() - 0.5) * 2 * jitter;
      ctx.lineTo(x1 + (dx * i) / parts + nx * j, y1 + (dy * i) / parts + ny * j);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Estrela de cinco pontas (Meteoro dos ginásios)
  _star5(cx, cy, size, rot) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? size * 0.45 : size;
      const a = rot - Math.PI / 2 + (k * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  // Tiro dos ginásios: Meteoro (Swift), estrela dourada girando com rastro de brilhos.
  // O do Líder é maior e leva duas estrelinhas em órbita.
  _drawSwift(p, x, y) {
    const ctx = this.ctx;
    const s = this.scale;
    const now = performance.now() / 1000;
    const [ox, oy] = this.w2s(p.sx ?? p.x, p.sy ?? p.y);
    const travel = Math.hypot(x - ox, y - oy);
    const angle = travel > 2 ? Math.atan2(y - oy, x - ox) : 0;
    const size = s * (p.king ? 0.42 : 0.32);
    const L = Math.min(travel, s * 1.4);
    ctx.save();
    ctx.lineJoin = 'round';
    // Rastro: brilhos ficando para trás
    ctx.fillStyle = '#fff3a0';
    for (let i = 1; i <= 5; i++) {
      const t = (i - ((now * 6) % 1)) / 5;
      if (t <= 0) continue;
      ctx.globalAlpha = 0.8 * (1 - t);
      const side = Math.sin((p.id || 0) * 3 + i * 2.3) * s * 0.18;
      this._star(x - Math.cos(angle) * L * t - Math.sin(angle) * side, y - Math.sin(angle) * L * t + Math.cos(angle) * side, size * 0.45 * (1 - t * 0.5));
    }
    ctx.globalAlpha = 0.35;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const rot = now * 9 + (p.id || 0);
    this._star5(x, y, size, rot);
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.stroke();
    this._star5(x, y, size * 0.45, rot);
    ctx.fillStyle = '#fffbe0';
    ctx.fill();
    if (p.king) {
      for (let i = 0; i < 2; i++) {
        const a = now * 7 + i * Math.PI;
        const mx = x + Math.cos(a) * size * 1.5;
        const my = y + Math.sin(a) * size * 1.5;
        this._star5(mx, my, size * 0.42, -rot);
        ctx.fillStyle = '#ffe98a';
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Golpe à distância: cada tipo tem um formato próprio. O desenho é feito com a ponta do golpe na origem,
  // apontando para +x; o rastro vai para trás, até no máximo onde o golpe saiu (sx, sy).
  //   elétrico: raio em zigue-zague desde o atacante · fogo/dragão: rajada de chamas · água: jato com bolhas
  //   planta: folhas girando · gelo: cristal com neve · pedra/terra: rocha com poeira · psíquico/fada: ondas
  //   voador: lâmina de ar · veneno: gosma pingando · fantasma/sombrio: bola sombria · inseto/aço: ferrão
  //   normal/lutador: esfera de energia com linhas de velocidade
  _drawProjectile(p) {
    const ctx = this.ctx;
    let s = this.scale;
    const [x, y] = this.w2s(p.x, p.y);
    if (p.tower) {
      this._drawSwift(p, x, y);
      return;
    }
    s *= 1.6; // golpes bem maiores que o tiro dos ginásios, para o formato de cada tipo aparecer
    const [ox, oy] = this.w2s(p.sx ?? p.x, p.sy ?? p.y);
    const travel = Math.hypot(x - ox, y - oy);
    const angle = travel > 2 ? Math.atan2(y - oy, x - ox) : (p.a || 0) + (this.viewSide === 1 ? Math.PI : 0);
    const now = performance.now() / 1000;
    const seed = (p.id || 0) * 7.13;
    const tail = (max) => Math.min(travel, s * max);
    const color = TYPE_COLORS[p.type] || '#ffffff';
    const dot = (px, py, r) => {
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.5, r), 0, Math.PI * 2);
      ctx.fill();
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (p.type) {
      case 'electric': {
        // Raio inteiro, do atacante até a ponta, tremendo a cada quadro
        const L = travel;
        const parts = Math.max(3, Math.round(L / (s * 0.5)));
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255, 220, 60, 0.45)';
        ctx.lineWidth = s * 0.34;
        this._zigzag(-L, 0, 0, 0, s * 0.22, parts);
        ctx.strokeStyle = '#fff7b0';
        ctx.lineWidth = s * 0.11;
        this._zigzag(-L, 0, 0, 0, s * 0.22, parts);
        // Galhos saindo do raio
        ctx.lineWidth = s * 0.05;
        for (let i = 0; i < 2; i++) {
          const bx = -Math.random() * L * 0.8;
          const side = Math.random() < 0.5 ? -1 : 1;
          this._zigzag(bx, 0, bx - s * 0.4, side * s * (0.3 + Math.random() * 0.3), s * 0.1, 3);
        }
        ctx.fillStyle = 'rgba(255, 240, 140, 0.55)';
        dot(0, 0, s * (0.38 + Math.random() * 0.1));
        ctx.fillStyle = '#ffffff';
        dot(0, 0, s * 0.16);
        break;
      }
      case 'fire':
      case 'dragon': {
        // Rajada: bolhas de chama que diminuem e esfriam para trás, com fagulhas
        const L = tail(1.6);
        const pal = p.type === 'fire' ? ['#fff3a0', '#ffc23a', '#ff7a1a', '#d8331a'] : ['#f0e0ff', '#b98aff', '#7a3cff', '#3d1a99'];
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 11; i >= 0; i--) {
          const t = i / 11;
          const wob = Math.sin(now * 30 + i * 1.7 + seed) * s * 0.08 * t;
          ctx.globalAlpha = 0.85 - t * 0.6;
          ctx.fillStyle = pal[Math.min(3, Math.floor(t * 4))];
          dot(-t * L, wob, s * (0.32 - t * 0.12) * (1 + Math.sin(now * 40 + i) * 0.12));
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal[0];
        dot(s * 0.04, 0, s * 0.17);
        ctx.fillStyle = pal[1];
        for (let i = 0; i < 4; i++) {
          const t = (now * 2.5 + i / 4 + seed) % 1;
          dot(-t * L * 1.1, Math.sin(seed + i * 2.4) * s * 0.35 * t, s * 0.05 * (1 - t));
        }
        break;
      }
      case 'water': {
        // Jato contínuo afinando para trás, com brilho e bolhas soltas
        const L = tail(2.2);
        const grad = ctx.createLinearGradient(-L, 0, 0, 0);
        grad.addColorStop(0, 'rgba(79, 140, 255, 0)');
        grad.addColorStop(0.6, 'rgba(79, 140, 255, 0.75)');
        grad.addColorStop(1, '#8fc0ff');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-L, 0);
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          ctx.lineTo(-L + t * L, -s * (0.05 + 0.2 * t) - Math.sin(now * 25 + i) * s * 0.025);
        }
        ctx.arc(0, 0, s * 0.25, -Math.PI / 2, Math.PI / 2);
        for (let i = 8; i >= 0; i--) {
          const t = i / 8;
          ctx.lineTo(-L + t * L, s * (0.05 + 0.2 * t) + Math.sin(now * 25 + i + 2) * s * 0.025);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = s * 0.05;
        ctx.beginPath();
        ctx.moveTo(-L * 0.6, -s * 0.07);
        ctx.lineTo(s * 0.05, -s * 0.09);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(220, 240, 255, 0.9)';
        ctx.lineWidth = Math.max(1, s * 0.03);
        for (let i = 0; i < 4; i++) {
          const t = (now * 1.8 + i / 4 + seed) % 1;
          ctx.beginPath();
          ctx.arc(-t * L, Math.sin(seed + i * 1.9) * s * 0.32, s * (0.05 + 0.05 * t), 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'grass': {
        // Folha Navalha: três folhas girando em volta da trajetória
        const L = tail(1);
        for (let i = 0; i < 3; i++) {
          const ph = now * 9 + (i * Math.PI * 2) / 3 + seed;
          ctx.save();
          ctx.translate(-i * L * 0.33, Math.sin(ph) * s * 0.3);
          ctx.rotate(now * 16 + i * 2);
          ctx.globalAlpha = 1 - i * 0.2;
          ctx.fillStyle = i === 0 ? '#7ddc5a' : '#5cc04a';
          ctx.beginPath();
          ctx.moveTo(-s * 0.26, 0);
          ctx.quadraticCurveTo(0, -s * 0.18, s * 0.26, 0);
          ctx.quadraticCurveTo(0, s * 0.18, -s * 0.26, 0);
          ctx.fill();
          ctx.strokeStyle = '#2f7a22';
          ctx.lineWidth = Math.max(1, s * 0.03);
          ctx.beginPath();
          ctx.moveTo(-s * 0.22, 0);
          ctx.lineTo(s * 0.22, 0);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'ice': {
        // Raio de Gelo: cristal brilhante com rastro de flocos
        const L = tail(1.4);
        ctx.strokeStyle = 'rgba(191, 244, 255, 0.45)';
        ctx.lineWidth = s * 0.16;
        ctx.beginPath();
        ctx.moveTo(-L, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const t = (i + ((now * 3) % 1)) / 6;
          this._star(-t * L, Math.sin(seed + i * 2.1) * s * 0.22, s * 0.09 * (1 - t * 0.6));
        }
        ctx.fillStyle = '#bff4ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        ctx.moveTo(s * 0.42, 0);
        ctx.lineTo(0, s * 0.14);
        ctx.lineTo(-s * 0.28, 0);
        ctx.lineTo(0, -s * 0.14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'bug':
      case 'steel': {
        // Ferrão / aço: ponta metálica com linhas de velocidade
        const L = tail(1.1);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = Math.max(1, s * 0.04);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(-s * 0.2, i * s * 0.12);
          ctx.lineTo(-L, i * s * 0.12);
          ctx.stroke();
        }
        ctx.fillStyle = p.type === 'bug' ? '#c8d84a' : '#d8d8ea';
        ctx.strokeStyle = p.type === 'bug' ? '#5a6a10' : '#6a6a80';
        ctx.beginPath();
        ctx.moveTo(s * 0.4, 0);
        ctx.lineTo(-s * 0.2, s * 0.13);
        ctx.lineTo(-s * 0.12, 0);
        ctx.lineTo(-s * 0.2, -s * 0.13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'rock':
      case 'ground': {
        // Pedra girando com nuvem de poeira e pedrinhas atrás
        const L = tail(1.2);
        ctx.fillStyle = p.type === 'rock' ? 'rgba(200, 185, 150, 0.4)' : 'rgba(210, 170, 110, 0.45)';
        for (let i = 1; i <= 4; i++) dot(-(i / 4) * L, Math.sin(seed + i) * s * 0.1, s * (0.12 + i * 0.05));
        ctx.fillStyle = '#6b5a3a';
        for (let i = 0; i < 3; i++) {
          const t = (now * 2 + i / 3 + seed) % 1;
          ctx.fillRect(-t * L - s * 0.05, Math.sin(seed * 3 + i * 2) * s * 0.25 - s * 0.05, s * 0.1, s * 0.1);
        }
        ctx.rotate(now * 9);
        ctx.fillStyle = p.type === 'rock' ? '#9c8a5a' : '#b98c4a';
        ctx.strokeStyle = '#4a3b22';
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.beginPath();
        [1, 0.75, 1.05, 0.8, 0.95, 0.7].forEach((r, i) => {
          const a = (i * Math.PI) / 3;
          ctx.lineTo(Math.cos(a) * s * 0.3 * r, Math.sin(a) * s * 0.3 * r);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        dot(-s * 0.07, -s * 0.07, s * 0.08);
        break;
      }
      case 'psychic':
      case 'fairy': {
        // Ondas em anel saindo da ponta e ficando para trás
        const L = tail(1.6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = color;
        ctx.lineWidth = s * 0.07;
        for (let i = 0; i < 4; i++) {
          const t = (now * 2.2 + i / 4) % 1;
          ctx.globalAlpha = 1 - t;
          ctx.beginPath();
          ctx.ellipse(-t * L, 0, s * (0.1 + t * 0.12), s * (0.22 + t * 0.25), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = color;
        dot(0, 0, s * 0.3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        this._star(0, 0, s * 0.16 * (1 + Math.sin(now * 20) * 0.15));
        break;
      }
      case 'flying': {
        // Lâmina de ar: meia-lua branca com rastros de vento
        const L = tail(1.2);
        ctx.strokeStyle = 'rgba(230, 240, 255, 0.55)';
        ctx.lineWidth = Math.max(1, s * 0.04);
        for (let i = -1; i <= 1; i += 2) {
          ctx.beginPath();
          ctx.moveTo(-s * 0.1, i * s * 0.28);
          ctx.quadraticCurveTo(-L * 0.5, i * s * (0.3 + Math.sin(now * 12 + i) * 0.08), -L, i * s * 0.12);
          ctx.stroke();
        }
        ctx.fillStyle = '#f4f8ff';
        ctx.beginPath();
        ctx.arc(-s * 0.12, 0, s * 0.38, -1.2, 1.2);
        ctx.arc(-s * 0.3, 0, s * 0.34, 1.0, -1.0, true);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'poison': {
        // Gosma roxa tremendo, pingando gotas
        const L = tail(1.1);
        ctx.fillStyle = 'rgba(160, 64, 160, 0.55)';
        for (let i = 0; i < 4; i++) {
          const t = (now * 2.4 + i / 4 + seed) % 1;
          dot(-t * L, Math.sin(seed + i * 2.7) * s * 0.18 + t * s * 0.1, s * 0.09 * (1 - t * 0.5));
        }
        const w = 1 + Math.sin(now * 18 + seed) * 0.12;
        ctx.fillStyle = '#9a3fb0';
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.3 * w, (s * 0.24) / w, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d58ae8';
        dot(s * 0.07, -s * 0.07, s * 0.08);
        dot(-s * 0.1, s * 0.06, s * 0.05);
        break;
      }
      case 'ghost':
      case 'dark': {
        // Bola Sombria: esfera escura girando, com fiapos de sombra atrás
        const L = tail(1.2);
        const ghost = p.type === 'ghost';
        ctx.strokeStyle = ghost ? 'rgba(120, 80, 170, 0.6)' : 'rgba(60, 40, 40, 0.6)';
        ctx.lineWidth = s * 0.08;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-s * 0.15, 0);
          ctx.quadraticCurveTo(-L * 0.5, Math.sin(now * 10 + i * 2.1 + seed) * s * 0.35, -L, Math.sin(now * 7 + i) * s * 0.2);
          ctx.stroke();
        }
        ctx.fillStyle = ghost ? 'rgba(170, 120, 230, 0.4)' : 'rgba(150, 60, 60, 0.4)';
        dot(0, 0, s * 0.36);
        ctx.fillStyle = ghost ? '#2a1640' : '#1e1414';
        dot(0, 0, s * 0.24);
        ctx.strokeStyle = ghost ? '#b98aff' : '#d05050';
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.18, now * 8, now * 8 + 2.2);
        ctx.stroke();
        break;
      }
      default: {
        // Normal e lutador: esfera de energia com brilho e linhas de velocidade
        const L = tail(1);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = Math.max(1, s * 0.04);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(-s * 0.25, i * s * 0.14);
          ctx.lineTo(-L * (0.7 + 0.3 * Math.abs(i)), i * s * 0.14);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.45;
        dot(0, 0, s * 0.36 * (1 + Math.sin(now * 24) * 0.08));
        ctx.globalAlpha = 1;
        dot(0, 0, s * 0.22);
        ctx.fillStyle = '#ffffff';
        dot(s * 0.03, 0, s * 0.11);
      }
    }
    ctx.restore();
  }

  _drawPendingSpell(sp) {
    const ctx = this.ctx;
    const [x, y] = this.w2s(sp.x, sp.y);
    const r = sp.card.radius * this.scale;
    const k = 1 - sp.timer / sp.total;
    ctx.strokeStyle = TYPE_COLORS[sp.card.type];
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Bola de fogo caindo
    if (sp.card.id === 'blizzard') {
      // Nuvem de neve se formando em cima da área
      ctx.globalAlpha = 0.5 + 0.4 * k;
      ctx.fillStyle = '#e8f6ff';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + (i - 2) * this.scale * 0.6, y - this.scale * 3, this.scale * (0.6 + (i % 2) * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (sp.card.id === 'fireblast') {
      const fy = y - (1 - k) * this.scale * 8;
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.arc(x, fy, this.scale * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath();
      ctx.arc(x, fy, this.scale * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawEffect(e) {
    const ctx = this.ctx;
    const s = this.scale;
    const k = 1 - e.ttl / e.total; // 0 -> 1
    const [x, y] = this.w2s(e.x, e.y);
    const color = e.color || TYPE_COLORS[e.type] || '#ffffff';
    // Aleatório estável por efeito (o desenho não "pisca" de um quadro para o outro)
    const rnd = (n) => {
      const v = Math.sin((e.id || 1) * 12.9898 + n * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const out = 1 - (1 - k) * (1 - k); // desacelera no fim
    ctx.save();
    switch (e.kind) {
      case 'text': {
        ctx.globalAlpha = 1 - k;
        ctx.font = `bold ${e.size * s}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.fillStyle = e.color;
        const ty = y - k * s * 0.9;
        ctx.strokeText(e.text, x, ty);
        ctx.fillText(e.text, x, ty);
        break;
      }
      case 'cast':
        // Energia juntando no atacante
        if (e.spell) break;
        ctx.globalAlpha = 0.8 * (1 - k);
        ctx.strokeStyle = color;
        ctx.lineWidth = s * 0.08;
        ctx.beginPath();
        ctx.arc(x, y, s * (0.15 + 0.45 * out), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'strike': {
        // Golpe corpo a corpo: três garras cortando o alvo, na direção do ataque
        const [ax, ay] = this.w2s(e.sx, e.sy);
        const ang = Math.atan2(y - ay, x - ax) + Math.PI / 2;
        const size = s * (e.big ? 0.75 : 0.5);
        const reveal = Math.min(1, k * 3);
        ctx.globalAlpha = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
        ctx.translate(x, y);
        ctx.rotate(ang + 0.5);
        ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          const off = i * size * 0.32;
          ctx.strokeStyle = color;
          ctx.lineWidth = s * (e.big ? 0.16 : 0.12);
          ctx.beginPath();
          ctx.moveTo(-size, off);
          ctx.lineTo(-size + 2 * size * reveal, off);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = s * 0.05;
          ctx.stroke();
        }
        if (e.big && k < 0.4) {
          ctx.fillStyle = '#fff6c8';
          this._star(0, 0, size * (0.6 + k));
        }
        break;
      }
      case 'impact': {
        // Partículas do tipo do golpe saindo do ponto de acerto
        if (k < 0.3) {
          ctx.globalAlpha = 0.8 * (1 - k / 0.3);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, s * 0.3 * (1 - k / 0.3) + s * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = color;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + rnd(i) * 0.8;
          const d = s * (0.15 + 0.6 * out * (0.6 + rnd(i + 9) * 0.6));
          let px = x + Math.cos(a) * d;
          let py = y + Math.sin(a) * d * 0.8;
          if (e.type === 'fire') py -= k * s * 0.5;
          if (e.type === 'water') py += (k * k - k) * s * 0.9 + k * s * 0.3;
          const r = s * 0.09 * (1 - k) + s * 0.02;
          if (e.type === 'grass' || e.type === 'ice' || e.type === 'fairy' || e.type === 'psychic') this._star(px, py, r * 1.6);
          else {
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (e.type === 'electric' && k < 0.6) {
          ctx.strokeStyle = '#fff59d';
          ctx.lineWidth = s * 0.05;
          for (let i = 0; i < 3; i++) {
            const a = rnd(i + 20) * Math.PI * 2;
            this._zigzag(x, y, x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.7, s * 0.12, 3);
          }
        }
        break;
      }
      case 'blast': {
        // Área: clarão, anel e estilhaços (raio e fogo têm desenho próprio)
        if (e.spell === 'thunderbolt' && k < 0.12) {
          ctx.globalAlpha = 0.28 * (1 - k / 0.12);
          ctx.fillStyle = '#fffbe0';
          ctx.fillRect(-50, -50, this.canvas.width + 100, this.canvas.height + 100);
        }
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, e.radius * s * (0.6 + 0.4 * out), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = s * 0.1 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(x, y, e.radius * s * (0.3 + 0.8 * out), 0, Math.PI * 2);
        ctx.stroke();
        const n = Math.round(8 + e.radius * 4);
        ctx.fillStyle = e.type === 'fire' ? '#ffd54a' : color;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd(i);
          const d = e.radius * s * out * (0.5 + rnd(i + 30) * 0.7);
          const py = y + Math.sin(a) * d * 0.75 - (e.type === 'fire' ? k * s * 0.8 : 0);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, py, s * 0.12 * (1 - k) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
        if (e.spell === 'surf') {
          // Onda: anéis de água se abrindo, com espuma branca
          for (let i = 0; i < 3; i++) {
            const kk = Math.min(1, out + i * 0.12);
            ctx.globalAlpha = (1 - k) * (0.9 - i * 0.25);
            ctx.strokeStyle = i ? '#4f8cff' : '#e8f6ff';
            ctx.lineWidth = s * (0.25 - i * 0.05);
            ctx.beginPath();
            ctx.ellipse(x, y, e.radius * this.sx * kk, e.radius * this.sy * kk * 0.8, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        if (e.spell === 'earthquake') {
          // Rachaduras saindo do centro e pedrinhas pulando
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = '#5a3d1e';
          ctx.lineWidth = s * 0.1;
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + rnd(i);
            let px = x;
            let py = y;
            ctx.beginPath();
            ctx.moveTo(px, py);
            for (let j = 1; j <= 3; j++) {
              const d = (e.radius * s * Math.min(1, out * 1.3) * j) / 3;
              px = x + Math.cos(a + (rnd(i * 3 + j) - 0.5) * 0.6) * d;
              py = y + Math.sin(a + (rnd(i * 3 + j) - 0.5) * 0.6) * d * 0.75;
              ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
          ctx.fillStyle = '#8b6a3e';
          for (let i = 0; i < 10; i++) {
            const a = rnd(i + 40) * Math.PI * 2;
            const d = e.radius * s * rnd(i + 50);
            const hop = Math.abs(Math.sin(k * Math.PI * 3 + i)) * s * 0.4 * (1 - k);
            ctx.fillRect(x + Math.cos(a) * d - s * 0.08, y + Math.sin(a) * d * 0.75 - hop - s * 0.08, s * 0.16, s * 0.16);
          }
        }
        if (e.spell === 'blizzard') {
          // Flocos de neve girando e caindo
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 18; i++) {
            const a = rnd(i) * Math.PI * 2 + k * 2;
            const d = e.radius * s * Math.sqrt(rnd(i + 20));
            ctx.globalAlpha = (1 - k) * 0.9;
            this._star(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.75 - (1 - k) * s * 0.8, s * 0.13);
          }
        }
        if (e.spell === 'thunderbolt' && k < 0.6) {
          ctx.globalAlpha = 1 - k / 0.6;
          ctx.strokeStyle = '#fff7a8';
          ctx.lineCap = 'round';
          ctx.lineWidth = s * 0.22;
          this._zigzag(x + s * 0.2, y - s * 9, x, y, s * 0.6, 7);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = s * 0.08;
          this._zigzag(x + s * 0.2, y - s * 9, x, y, s * 0.4, 7);
        }
        break;
      }
      case 'spawn': {
        // Lendário: coluna de luz dourada e brilhos subindo
        if (e.legendary) {
          ctx.save();
          const t = Math.min(1, k * 1.4);
          ctx.globalAlpha = 0.55 * (1 - k);
          const grad = ctx.createLinearGradient(0, y - s * 9, 0, y);
          grad.addColorStop(0, 'rgba(255,230,120,0)');
          grad.addColorStop(1, 'rgba(255,215,90,1)');
          ctx.fillStyle = grad;
          const w = s * (1.6 + Math.sin(k * 20) * 0.15);
          ctx.fillRect(x - w / 2, y - s * 9 * t, w, s * 9 * t);
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = '#fff3a0';
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + k * 4;
            this._star(x + Math.cos(a) * s * 1.4 * out, y - k * s * 3 - rnd(i) * s * 1.5, s * 0.16);
          }
          ctx.restore();
          if (k > 0.5) break;
        }
        // Poké Ball arremessada do Líder em arco até o ponto, quica e solta um clarão na cor do time
        // (construção: sem bola, só poeira e o anel do time)
        const thrown = e.bx !== undefined;
        const ballEnd = thrown ? 0.45 : 0.35;
        if (k < ballEnd && !e.building) {
          const t = k / ballEnd;
          const r = s * 0.3;
          let bx = x;
          let by = y - s * 0.6 - Math.sin(t * Math.PI) * s * 0.5;
          if (thrown) {
            // 75% do tempo voando, o resto num quique no chão
            const [fx, fy] = this.w2s(e.bx, e.by);
            const f = Math.min(1, t / 0.75);
            const dist = Math.hypot(x - fx, y - fy);
            bx = fx + (x - fx) * f;
            by = fy + (y - s * 0.6 - fy) * f - Math.sin(f * Math.PI) * Math.min(s * 4, dist * 0.45);
            if (t > 0.75) by = y - s * 0.6 - Math.sin(((t - 0.75) / 0.25) * Math.PI) * s * 0.35;
            // Sombra no chão acompanhando a bola
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.ellipse(fx + (x - fx) * f, fy + (y - fy) * f + s * 0.2, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.translate(bx, by);
          ctx.rotate(thrown && t < 0.75 ? t * 14 : Math.sin(t * 18) * 0.3);
          ctx.fillStyle = '#e8413a';
          ctx.beginPath();
          ctx.arc(0, 0, r, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI);
          ctx.fill();
          ctx.strokeStyle = '#1b1b1b';
          ctx.lineWidth = Math.max(1, r * 0.16);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.moveTo(-r, 0);
          ctx.lineTo(r, 0);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // Construção não tem a bola: o clarão começa já no início
          const t = e.building ? k : Math.max(0, (k - ballEnd) / (1 - ballEnd));
          ctx.globalAlpha = 1 - t;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(x, y - s * 0.5, s * (0.5 + t * 0.6), s * (1.1 + t * 0.4), 0, 0, Math.PI * 2);
          ctx.globalAlpha = 0.55 * (1 - t);
          ctx.fill();
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = this.teamColor(e.side);
          ctx.lineWidth = s * 0.12;
          ctx.beginPath();
          ctx.ellipse(x, y + s * 0.2, s * (0.4 + t * 1.4), s * (0.2 + t * 0.7), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'splash': {
        // Entrou ou saiu do rio: gotas pulando em arco e um anel de água
        const R = e.radius * s;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, s * 0.07);
        ctx.beginPath();
        ctx.ellipse(x, y + R * 0.35, R * (0.8 + out * 1.4), R * (0.3 + out * 0.5), 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + rnd(i);
          const d = R * (0.4 + out * (1 + rnd(i + 8)));
          const px = x + Math.cos(a) * d;
          const py = y + R * 0.2 - Math.sin(k * Math.PI) * s * (0.6 + rnd(i + 16) * 0.5) + Math.sin(a) * d * 0.35;
          ctx.fillStyle = i % 2 ? '#ffffff' : '#9fd4ff';
          ctx.beginPath();
          ctx.arc(px, py, s * 0.09 * (1 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'faint': {
        // Desmaio: com a animação Faint do SpriteCollab, ela toca e o Pokémon some aos poucos;
        // sem ela, fica cinza, achata e some. Voadores caem nos dois casos.
        const sp = SPRITES[e.dex];
        const angle = (e.face ?? Math.PI / 2) + (this.viewSide === 1 ? Math.PI : 0);
        const played = (e.total - e.ttl) * 60;
        const faint = sp && sp.faint && this._animFrame(e.dex, sp.faint, played, angle, sp.walk.h);
        const frame = faint || (sp && this._sheetFrame(e.dex, sp.idle, 0, angle, sp.walk.h));
        if (frame) {
          ctx.save();
          const lift = e.air ? s * 0.9 * (1 - out) : 0;
          const dw = frame.w * frame.k;
          const dh = frame.h * frame.k;
          ctx.imageSmoothingEnabled = false;
          if (faint) {
            const fade = Math.max(0, (played - animLength(sp.faint)) / 60 / 0.35);
            ctx.globalAlpha = Math.max(0, 1 - fade);
            ctx.filter = `grayscale(${Math.min(0.7, k)}) brightness(${1 + 0.4 * Math.min(1, fade)})`;
            ctx.drawImage(frame.img, frame.sx, frame.sy, frame.w, frame.h, x - dw / 2, y - dh / 2 - lift, dw, dh);
          } else {
            ctx.globalAlpha = 1 - k;
            ctx.filter = 'grayscale(0.7) brightness(1.4)';
            ctx.translate(x, y + dh / 2 - lift);
            ctx.scale(1 + 0.25 * k, 1 - 0.55 * k);
            ctx.drawImage(frame.img, frame.sx, frame.sy, frame.w, frame.h, -dw / 2, -dh, dw, dh);
          }
          ctx.restore();
        }
        if (k > 0.4) {
          const t = (k - 0.4) / 0.6;
          ctx.globalAlpha = 0.6 * (1 - t);
          ctx.fillStyle = '#e8e2d0';
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + rnd(i);
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * s * 0.5 * t, y + Math.sin(a) * s * 0.2 * t, s * (0.18 + 0.15 * t), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'crash': {
        // Ginásio desabando: clarão, poeira e pedaços voando
        const R = e.radius * s;
        if (k < 0.15) {
          ctx.globalAlpha = 0.8 * (1 - k / 0.15);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, R * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.65 * (1 - k);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + rnd(i);
          const d = R * (0.3 + out * (0.7 + rnd(i + 3) * 0.6));
          ctx.fillStyle = i % 2 ? '#cfc6b0' : '#a89f8c';
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 - k * s * 0.4, R * (0.35 + 0.35 * out), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#6b5a45';
        for (let i = 0; i < 10; i++) {
          const a = rnd(i + 50) * Math.PI * 2;
          const v = R * (1 + rnd(i + 60) * 1.5);
          const px = x + Math.cos(a) * v * out;
          const py = y - Math.abs(Math.sin(a)) * v * (out - k * k * 1.2);
          const r = s * (0.1 + rnd(i + 70) * 0.12);
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        }
        break;
      }
      case 'evolve': {
        // Evolução: silhueta branca piscando, brilhos subindo e um anel no fim
        const R = e.radius * s;
        if (k < 0.75) {
          const blink = 0.45 + 0.45 * Math.abs(Math.sin(k * 28));
          ctx.globalAlpha = blink * (1 - k / 0.75 * 0.3);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(x, y - R * 1.4, R * 1.4, R * 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#fff3a0';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const px = x + Math.cos(a + k * 3) * R * 1.6;
          const py = y - R - k * s * 1.8 - rnd(i) * s * 0.6;
          this._star(px, py, s * 0.18 * (1 - k * 0.5));
        }
        if (k > 0.6) {
          const t = (k - 0.6) / 0.4;
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = s * 0.15;
          ctx.beginPath();
          ctx.arc(x, y - R, R * (1 + t * 2.5), 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'heal': {
        // Onda verde do Centro Pokémon (mais forte quando curou alguém)
        ctx.globalAlpha = (e.active ? 0.75 : 0.3) * (1 - k);
        ctx.strokeStyle = '#6dff9a';
        ctx.lineWidth = s * 0.1;
        ctx.beginPath();
        ctx.ellipse(x, y, e.radius * this.sx * out, e.radius * this.sy * out * 0.75, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (e.active) {
          ctx.fillStyle = '#6dff9a';
          ctx.font = `bold ${s * 0.45}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + rnd(i);
            ctx.fillText('+', x + Math.cos(a) * s * 1.2, y + Math.sin(a) * s * 0.7 - k * s * 1.2);
          }
        }
        break;
      }
      case 'poof':
        ctx.globalAlpha = 0.7 * (1 - k);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, e.radius * s * (0.8 + k), 0, Math.PI * 2);
        ctx.fill();
        break;
      default:
    }
    ctx.restore();
  }

  _drawGhost(game, ui) {
    const ctx = this.ctx;
    const card = CARDS[ui.selected];
    // A prévia aparece onde o Pokémon vai nascer (o ponto permitido mais próximo do dedo)
    // Guarda o último cálculo: só recalcula quando o dedo muda de quadradinho (0,25 tile) ou a carta muda
    const key = `${ui.selected}|${ui.side}|${Math.round(ui.hover[0] * 4)}|${Math.round(ui.hover[1] * 4)}|${game.towers.filter((t) => t.dead).length}`;
    if (!this._snap || this._snap.key !== key) {
      this._snap = { key, pos: game.snapPosition(ui.side, ui.selected, ui.hover[0], ui.hover[1]) || ui.hover };
    }
    const snapped = this._snap.pos;
    const [hx, hy] = snapped;
    const [x, y] = this.w2s(hx, hy);
    const valid = true;
    const s = this.scale;
    const [fx, fy] = this.w2s(ui.hover[0], ui.hover[1]);
    if (Math.hypot(fx - x, fy - y) > s * 0.4) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    if (card.kind === 'spell') {
      ctx.fillStyle = valid ? 'rgba(255,255,255,0.2)' : 'rgba(255,0,0,0.25)';
      ctx.strokeStyle = valid ? '#ffffff' : '#ff4040';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, card.radius * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.55;
      if (card.range > 1.6) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x, y, (card.range + card.radius) * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (card.healRadius) {
        ctx.strokeStyle = 'rgba(109,255,154,0.8)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.ellipse(x, y, card.healRadius * this.sx, card.healRadius * this.sy, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const art = card.kind === 'building' && card.id !== 'sleepingsnorlax' && getImage(card.icon);
      if (art) {
        const k = s / PMD_PIXELS_PER_TILE;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(art, x - (art.naturalWidth * k) / 2, y + card.radius * s * 0.5 - art.naturalHeight * k, art.naturalWidth * k, art.naturalHeight * k);
      }
      const dex = card.kind === 'building' ? (card.id === 'sleepingsnorlax' ? 143 : null) : card.dex;
      const sp = SPRITES[dex];
      const f = sp && this._sheetFrame(dex, sp.idle, 0, this.viewSide === 0 ? -Math.PI / 2 : Math.PI / 2, sp.walk.h);
      if (f) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, x - (f.w * f.k) / 2, y - (f.h * f.k) / 2, f.w * f.k, f.h * f.k);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = valid ? '#ffffff' : '#ff4040';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + card.radius * s * 0.5, card.radius * s * 1.1, card.radius * s * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
