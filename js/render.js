// Desenha o estado do jogo no <canvas>. viewSide define de que lado a arena é vista
// (o jogador de cima no multiplayer vê tudo invertido, com a própria base embaixo).

const TEAM = { me: '#3b82f6', enemy: '#ef4444' };

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
    this.resize();
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
    if (ui.selected && ui.hover) this._drawGhost(game, ui);
  }

  _drawGround() {
    const ctx = this.ctx;
    const s = this.scale;
    for (let ty = 0; ty < ARENA.H; ty++) {
      for (let tx = 0; tx < ARENA.W; tx++) {
        const [x, y] = this.w2s(tx + (this.viewSide ? 1 : 0), ty + (this.viewSide ? 1 : 0));
        ctx.fillStyle = (tx + ty) % 2 === 0 ? '#74c255' : '#6ab84c';
        ctx.fillRect(x, y, s + 0.5, s + 0.5);
      }
    }
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

    // Pokébola: metade de cima na cor do time
    const color = this.teamColor(t.side);
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
      if (!t.active) {
        ctx.font = `bold ${r * 0.45}px sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('z z', x + r * 0.9, y - r * 0.8);
      }
    }
    const bw = r * 2;
    const by = y + r + this.scale * 0.15;
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
    const size = s * (2.4 + u.radius * 2.4);
    const bounce = u.attackAnim > 0 ? -s * 0.12 : 0;
    const img = getImage(u.side === this.viewSide ? spriteBack(u.def.dex) : spriteFront(u.def.dex));
    const top = y - size * 0.8 - lift + bounce;
    if (img) {
      ctx.imageSmoothingEnabled = false;
      if (u.hitFlash > 0) ctx.filter = 'brightness(1.9)';
      ctx.drawImage(img, x - size / 2, top, size, size);
    } else {
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

    const barY = top + size * 0.18;
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
      ctx.fillText('💫', x + r, top + size * 0.3);
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
      const img = getImage(spriteBack(card.dex));
      const size = s * (2.4 + card.radius * 2.4);
      if (img) ctx.drawImage(img, x - size / 2, y - size * 0.8, size, size);
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
