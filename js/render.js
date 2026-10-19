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
    this.mapUrl = arena.map ? arenaMapUrl(arena) : null;
    if (this.mapUrl) getImage(this.mapUrl); // começa a carregar já
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
    this.scale = Math.min(w / ARENA.W, h / ARENA.H);
    this.ox = (w - this.scale * ARENA.W) / 2;
    this.oy = (h - this.scale * ARENA.H) / 2;
  }

  w2s(x, y) {
    if (this.viewSide === 1) {
      x = ARENA.W - x;
      y = ARENA.H - y;
    }
    return [this.ox + x * this.scale, this.oy + y * this.scale];
  }

  // Coordenadas CSS relativas ao canvas -> mundo
  s2w(px, py) {
    let x = (px - this.ox) / this.scale;
    let y = (py - this.oy) / this.scale;
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
    this._drawGround();
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
    if (map) {
      // O mapa já tem rio, pontes e pistas alinhados à grade (tools/build-arenas.py)
      const w = ARENA.W * s;
      const h = ARENA.H * s;
      ctx.save();
      ctx.translate(this.ox + w / 2, this.oy + h / 2);
      if (this.viewSide === 1) ctx.rotate(Math.PI);
      ctx.drawImage(map, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }
    for (let ty = 0; ty < ARENA.H; ty++) {
      for (let tx = 0; tx < ARENA.W; tx++) {
        const [x, y] = this.w2s(tx + (this.viewSide ? 1 : 0), ty + (this.viewSide ? 1 : 0));
        ctx.fillStyle = this.ground[(tx + ty) % 2];
        ctx.fillRect(x, y, s + 0.5, s + 0.5);
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
    const rh = (ARENA.RIVER_BOTTOM - ARENA.RIVER_TOP) * s;
    const grad = ctx.createLinearGradient(0, ry, 0, ry + rh);
    grad.addColorStop(0, '#3d8fd1');
    grad.addColorStop(0.5, '#5cb3ee');
    grad.addColorStop(1, '#3d8fd1');
    ctx.fillStyle = grad;
    ctx.fillRect(rx, ry, ARENA.W * s, rh);
    // Ondinhas
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    const t = performance.now() / 1000;
    for (let i = 0; i < 9; i++) {
      const wx = rx + ((i * 2.1 + t * 0.6) % ARENA.W) * s;
      const wy = ry + rh * (i % 2 ? 0.35 : 0.68);
      ctx.beginPath();
      ctx.arc(wx, wy, s * 0.3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    // Pontes
    for (const b of ARENA.BRIDGES) {
      const [bx, by] = this.w2s(this.viewSide ? b + ARENA.BRIDGE_HALF : b - ARENA.BRIDGE_HALF, this.viewSide ? ARENA.RIVER_BOTTOM + 0.4 : ARENA.RIVER_TOP - 0.4);
      const bw = ARENA.BRIDGE_HALF * 2 * s;
      const bh = rh + 0.8 * s;
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
    ctx.strokeRect(ax, ay, ARENA.W * s, ARENA.H * s);
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
        ctx.fillRect(x, y, s + 0.5, s + 0.5);
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
      ctx.fillStyle = '#7a7a7a';
      ctx.beginPath();
      ctx.arc(x, y + r * 0.3, r * 0.75, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#5b5b5b';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x - r * 0.5 + i * r * 0.35, y + r * 0.35, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
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
      ctx.drawImage(sprite, x - w / 2, top, w, h);
      if (skin && skin.glow) ctx.drawImage(sprite, x - w / 2, top, w, h); // 2ª passada reforça o brilho da skin
      ctx.restore();
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
      ctx.font = `${r * 0.9}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👑', x, y - r * 1.15);
    }
  }

  _drawUnit(u, game) {
    const ctx = this.ctx;
    const s = this.scale;
    const [x, y] = this.w2s(u.x, u.y);
    const r = u.radius * s;
    const color = this.teamColor(u.side);
    const now = performance.now() / 1000;
    const lift = u.air ? s * 0.9 + Math.sin(now * 6 + u.id) * s * 0.1 : 0;

    // Anel do time no chão
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.5, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.stroke();

    ctx.save();
    if (u.deploy > 0) ctx.globalAlpha = 0.5;
    ctx.imageSmoothingEnabled = false;
    if (u.hitFlash > 0) ctx.filter = 'brightness(1.9)';
    const frame = this._unitFrame(u, game);
    const fallback = !frame && getImage(spriteFront(u.def.dex));
    let top;
    if (frame) {
      // O centro do quadro é o ponto no chão onde o Pokémon está
      const dw = frame.w * frame.k;
      const dh = frame.h * frame.k;
      ctx.drawImage(frame.img, frame.sx, frame.sy, frame.w, frame.h, x - dw / 2, y - dh / 2 - lift, dw, dh);
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
    if (u.evolved) {
      ctx.font = `${s * 0.35}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('⭐', x, barY);
    }
    if (u.stun > 0) {
      ctx.font = `${s * 0.5}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💫', x + r, top + s * 0.4);
    }
  }

  // Quadro atual da animação: ataque (logo após atacar), andar (em movimento) ou parado
  _unitFrame(u, game) {
    const sp = SPRITES[u.def.dex];
    if (!sp) return null;
    const atk = u.def.range > 1.6 ? sp.shoot || sp.attack : sp.attack;
    const since = (game.time - (u.attackT ?? -99)) * 60; // em quadros de 60 fps, como no SpriteCollab
    let anim;
    let tick;
    if (!(u.deploy > 0) && since >= 0 && since < animLength(atk)) {
      anim = atk;
      tick = since;
    } else {
      anim = u.moving && !(u.deploy > 0) && !(u.stun > 0) ? sp.walk : sp.idle;
      tick = ((performance.now() / 1000) * 60 + u.id * 13) % animLength(anim);
    }
    let i = 0;
    while (i < anim.d.length - 1 && tick >= anim.d[i]) {
      tick -= anim.d[i];
      i++;
    }
    return this._sheetFrame(u.def.dex, anim, i, this._screenAngle(u), sp.walk.h);
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

  _drawProjectile(p) {
    const ctx = this.ctx;
    const [x, y] = this.w2s(p.x, p.y);
    const r = this.scale * (p.tower ? 0.16 : 0.2);
    ctx.fillStyle = p.tower ? '#fff4c2' : TYPE_COLORS[p.type];
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
    ctx.save();
    if (e.kind === 'text') {
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
    } else if (e.kind === 'blast') {
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(x, y, e.radius * s * (0.6 + 0.4 * k), 0, Math.PI * 2);
      ctx.fill();
      if (e.spell === 'thunderbolt' && k < 0.6) {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#fff7a8';
        ctx.lineWidth = s * 0.18;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.3, y - s * 6);
        ctx.lineTo(x + s * 0.4, y - s * 3.5);
        ctx.lineTo(x - s * 0.3, y - s * 2.8);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    } else if (e.kind === 'poof') {
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, e.radius * s * (0.8 + k), 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'evolve') {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.15;
      ctx.beginPath();
      ctx.arc(x, y - e.radius * s, e.radius * s * (1 + k * 2.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawGhost(game, ui) {
    const ctx = this.ctx;
    const card = CARDS[ui.selected];
    const [hx, hy] = ui.hover;
    const [x, y] = this.w2s(hx, hy);
    const valid = game.isValidPosition(ui.side, ui.selected, hx, hy);
    const s = this.scale;
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
      const sp = SPRITES[card.dex];
      const f = sp && this._sheetFrame(card.dex, sp.idle, 0, this.viewSide === 0 ? -Math.PI / 2 : Math.PI / 2, sp.walk.h);
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
