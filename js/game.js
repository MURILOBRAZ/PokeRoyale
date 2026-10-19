// Simulação da partida. Não desenha nada: o renderizador lê o estado e a entrada
// chega só por game.deploy(), o que permite rodar a simulação num host de multiplayer.
// Lado 0 = jogador de baixo, lado 1 = jogador de cima.

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function edgeDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
}

class Game {
  constructor({ decks = [DEFAULT_DECK, DEFAULT_DECK] } = {}) {
    this.nextId = 1;
    this.time = 0;
    this.endTime = MATCH.DURATION;
    this.overtime = false;
    this.over = false;
    this.winner = null; // 0, 1 ou -1 (empate)
    this.crowns = [0, 0];
    this.players = decks.map((deck) => {
      const queue = shuffle([...deck]);
      return { energy: MATCH.ENERGY_START, hand: queue.splice(0, 4), queue };
    });
    this.units = [];
    this.towers = [];
    this.projectiles = [];
    this.spells = [];
    this.effects = [];
    this.events = []; // mensagens para a interface (banners)
    this._createTowers();
  }

  get timeLeft() {
    return Math.max(0, this.endTime - this.time);
  }

  get doubleEnergy() {
    return this.time >= MATCH.DOUBLE_AT;
  }

  nextCard(side) {
    return this.players[side].queue[0];
  }

  _createTowers() {
    for (const side of [0, 1]) {
      const yP = side === 0 ? 25.5 : 6.5;
      const yK = side === 0 ? 29 : 3;
      this._addTower(side, 'princess', 3.5, yP, 0);
      this._addTower(side, 'princess', 14.5, yP, 1);
      this._addTower(side, 'king', 9, yK, -1);
    }
  }

  _addTower(side, kind, x, y, lane) {
    const s = TOWERS[kind];
    this.towers.push({
      id: this.nextId++, isTower: true, side, kind, lane, x, y,
      radius: s.radius, hp: s.hp, maxHp: s.hp, types: ['normal'],
      stats: s, active: kind === 'princess', cooldown: 0, target: null, dead: false,
    });
  }

  // ---------- Invocação ----------

  isValidPosition(side, cardId, x, y) {
    const card = CARDS[cardId];
    if (x < 0.5 || x > ARENA.W - 0.5 || y < 0.5 || y > ARENA.H - 0.5) return false;
    if (card.kind === 'spell') return true;
    for (const t of this.towers) {
      if (!t.dead && Math.hypot(t.x - x, t.y - y) < t.radius + 0.3) return false;
    }
    const own = side === 0 ? y >= ARENA.RIVER_BOTTOM : y <= ARENA.RIVER_TOP;
    if (own) return true;
    // Bolsão: ginásio lateral inimigo derrubado libera a metade inimiga daquela pista
    const lane = x < ARENA.W / 2 ? 0 : 1;
    const enemyTower = this.towers.find((t) => t.side !== side && t.kind === 'princess' && t.lane === lane);
    if (!enemyTower.dead) return false;
    return side === 0 ? y >= 11 : y <= ARENA.H - 11;
  }

  canDeploy(side, handIndex, x, y) {
    if (this.over) return false;
    const p = this.players[side];
    const cardId = p.hand[handIndex];
    if (!cardId) return false;
    if (p.energy < CARDS[cardId].cost) return false;
    return this.isValidPosition(side, cardId, x, y);
  }

  deploy(side, handIndex, x, y) {
    if (!this.canDeploy(side, handIndex, x, y)) return false;
    const p = this.players[side];
    const cardId = p.hand[handIndex];
    const card = CARDS[cardId];
    p.energy -= card.cost;
    p.queue.push(cardId);
    p.hand[handIndex] = p.queue.shift();

    if (card.kind === 'spell') {
      this.spells.push({ card, side, x, y, timer: card.delay, total: card.delay });
    } else {
      const n = card.count || 1;
      const offsets = n === 1 ? [[0, 0]] : [[0, -0.5], [-0.6, 0.4], [0.6, 0.4]];
      for (let i = 0; i < n; i++) {
        const [ox, oy] = offsets[i % offsets.length];
        this._spawnUnit(card, side, x + ox, y + (side === 0 ? oy : -oy));
      }
    }
    return true;
  }

  _spawnUnit(card, side, x, y) {
    const u = {
      id: this.nextId++, side, card,
      def: { ...card },
      x: clamp(x, 0.5, ARENA.W - 0.5), y: clamp(y, 0.5, ARENA.H - 0.5),
      radius: card.radius, hp: card.hp, maxHp: card.hp,
      types: card.types, air: !!card.air,
      deploy: MATCH.DEPLOY_TIME, cooldown: 0, stun: 0, target: null,
      kills: 0, evolved: false, dead: false, attackAnim: 0,
    };
    this.units.push(u);
    return u;
  }

  // ---------- Loop ----------

  update(dt) {
    if (this.over) {
      this._updateEffects(dt);
      return;
    }
    const wasDouble = this.doubleEnergy;
    this.time += dt;
    if (!wasDouble && this.doubleEnergy) this.events.push({ text: 'Energia dupla! ⚡⚡' });

    const rate = (this.doubleEnergy ? 2 : 1) / MATCH.ENERGY_REGEN;
    for (const p of this.players) p.energy = Math.min(MATCH.ENERGY_MAX, p.energy + rate * dt);

    for (const s of this.spells) {
      s.timer -= dt;
      if (s.timer <= 0) this._resolveSpell(s);
    }
    this.spells = this.spells.filter((s) => s.timer > 0);

    for (const u of this.units) if (!u.dead) this._updateUnit(u, dt);
    for (const t of this.towers) if (!t.dead) this._updateTower(t, dt);
    this._updateProjectiles(dt);
    this._separate();

    this.units = this.units.filter((u) => !u.dead);
    this._updateEffects(dt);
    this._checkTime();
  }

  _updateEffects(dt) {
    for (const e of this.effects) e.ttl -= dt;
    this.effects = this.effects.filter((e) => e.ttl > 0);
  }

  _checkTime() {
    if (this.over || this.time < this.endTime) return;
    if (this.crowns[0] !== this.crowns[1]) {
      this._end(this.crowns[0] > this.crowns[1] ? 0 : 1);
    } else if (!this.overtime) {
      this.overtime = true;
      this.endTime += MATCH.OVERTIME;
      this.events.push({ text: 'Prorrogação! Morte súbita' });
    } else {
      // Desempate: vence quem tem o ginásio mais fraco com mais vida
      const weakest = [0, 1].map((side) =>
        Math.min(...this.towers.filter((t) => t.side === side).map((t) => (t.dead ? 0 : t.hp))));
      if (weakest[0] === weakest[1]) this._end(-1);
      else this._end(weakest[0] > weakest[1] ? 0 : 1);
    }
  }

  _end(winner) {
    this.over = true;
    this.winner = winner;
  }

  // ---------- Unidades ----------

  _canTarget(u, t) {
    if (!t || t.dead) return false;
    if (t.side === u.side) return false;
    if (u.def.targets === 'buildings') return !!t.isTower;
    if (t.air && u.def.targets === 'ground') return false;
    return true;
  }

  _acquireTarget(u) {
    let best = null;
    let bestD = Infinity;
    for (const list of [this.units, this.towers]) {
      for (const t of list) {
        if (!this._canTarget(u, t)) continue;
        const d = edgeDist(u, t);
        if (d <= MATCH.SIGHT && d < bestD) {
          best = t;
          bestD = d;
        }
      }
    }
    if (best) return best;
    // Nada por perto: vai até o ginásio inimigo mais próximo
    for (const t of this.towers) {
      if (!this._canTarget(u, t)) continue;
      const d = edgeDist(u, t);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  _updateUnit(u, dt) {
    u.attackAnim = Math.max(0, u.attackAnim - dt);
    u.hitFlash = Math.max(0, (u.hitFlash || 0) - dt);
    if (u.deploy > 0) {
      u.deploy -= dt;
      return;
    }
    if (u.stun > 0) {
      u.stun -= dt;
      return;
    }
    u.cooldown = Math.max(0, u.cooldown - dt);

    const locked = this._canTarget(u, u.target) && edgeDist(u, u.target) <= u.def.range + 0.3;
    if (!locked) u.target = this._acquireTarget(u);
    const t = u.target;
    if (!t) return;

    if (edgeDist(u, t) <= u.def.range) {
      if (u.cooldown <= 0) {
        u.cooldown = u.def.hitSpeed;
        u.attackAnim = 0.2;
        this._attack(u, t);
      }
    } else {
      const [wx, wy] = this._waypoint(u, t.x, t.y);
      this._moveToward(u, wx, wy, dt);
    }
  }

  _moveToward(u, tx, ty, dt) {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) return;
    const step = Math.min(d, u.def.speed * dt);
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
  }

  // Terrestres só cruzam o rio pelas pontes
  _waypoint(u, tx, ty) {
    if (u.air) return [tx, ty];
    const RT = ARENA.RIVER_TOP;
    const RB = ARENA.RIVER_BOTTOM;
    const [b1, b2] = ARENA.BRIDGES;
    const bx = Math.abs(u.x - b1) + Math.abs(tx - b1) <= Math.abs(u.x - b2) + Math.abs(tx - b2) ? b1 : b2;
    const goingUp = ty < u.y;
    const inRiver = u.y > RT && u.y < RB;
    if (inRiver) {
      // Já está na ponte: segue reto até a outra margem, a não ser que o alvo esteja na ponte
      if (ty > RT && ty < RB) return [tx, ty];
      return [this._nearestBridge(u.x), goingUp ? RT - 0.5 : RB + 0.5];
    }
    const across = (u.y >= RB && ty < RB) || (u.y <= RT && ty > RT);
    if (!across) return [tx, ty];
    if (Math.abs(u.x - bx) > 0.35) return [bx, goingUp ? RB + 0.2 : RT - 0.2];
    return [bx, goingUp ? RT - 0.5 : RB + 0.5];
  }

  _nearestBridge(x) {
    const [b1, b2] = ARENA.BRIDGES;
    return Math.abs(x - b1) < Math.abs(x - b2) ? b1 : b2;
  }

  _attack(u, t) {
    const d = u.def;
    if (d.range > 1.6) {
      this.projectiles.push({
        x: u.x, y: u.y - (u.air ? 0.8 : 0.3), target: t, speed: 11,
        dmg: d.dmg, type: d.type, splash: d.splash || 0, source: u, side: u.side,
      });
    } else {
      this._hit(u, t, d.dmg, d.type, d.splash || 0);
    }
  }

  _hit(source, target, dmg, type, splash) {
    if (splash > 0) {
      for (const e of this._enemiesOf(source.side)) {
        if (Math.hypot(e.x - target.x, e.y - target.y) <= splash + e.radius) this._damage(e, dmg, type, source);
      }
      this.effects.push({ kind: 'blast', x: target.x, y: target.y, radius: splash, color: TYPE_COLORS[type], ttl: 0.3, total: 0.3 });
    } else {
      this._damage(target, dmg, type, source);
    }
  }

  *_enemiesOf(side) {
    for (const u of this.units) if (!u.dead && u.side !== side) yield u;
    for (const t of this.towers) if (!t.dead && t.side !== side) yield t;
  }

  _damage(e, amount, type, source) {
    if (e.dead) return;
    const m = typeMultiplier(type, e.types);
    const v = Math.round(amount * m);
    e.hp -= v;
    e.hitFlash = 0.12;
    this.effects.push({
      kind: 'text', x: e.x + (Math.random() - 0.5) * 0.4, y: e.y - e.radius - 0.4,
      text: String(v), color: m > 1 ? '#ffe14d' : m < 1 ? '#c8c8c8' : '#ffffff',
      size: m > 1 ? 0.55 : 0.42, ttl: 0.8, total: 0.8,
    });
    if (m > 1 && (!e.lastSuper || this.time - e.lastSuper > 1.5)) {
      e.lastSuper = this.time;
      this.effects.push({ kind: 'text', x: e.x, y: e.y - e.radius - 1.0, text: 'Super efetivo!', color: '#ffb020', size: 0.5, ttl: 1.1, total: 1.1 });
    }
    if (e.isTower && e.kind === 'king') e.active = true;
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      this.effects.push({ kind: 'poof', x: e.x, y: e.y, radius: e.radius, ttl: 0.5, total: 0.5 });
      if (e.isTower) this._towerDestroyed(e);
      if (source && !source.dead && !source.isTower) this._creditKill(source);
    }
  }

  _creditKill(u) {
    u.kills++;
    const evo = u.card.evolve;
    if (!evo || u.evolved || u.kills < evo.kills) return;
    const ratio = Math.max(0.5, u.hp / u.maxHp);
    u.def = { ...u.def, ...evo.into };
    u.maxHp = evo.into.hp;
    u.hp = Math.round(u.maxHp * ratio);
    u.radius *= 1.15;
    u.evolved = true;
    this.effects.push({ kind: 'evolve', x: u.x, y: u.y, radius: u.radius, ttl: 0.8, total: 0.8 });
    this.events.push({ text: `${u.card.name} evoluiu para ${evo.into.name}!`, side: u.side });
  }

  _towerDestroyed(t) {
    const attacker = 1 - t.side;
    if (t.kind === 'king') {
      this.crowns[attacker] = 3;
      this._end(attacker);
      return;
    }
    this.crowns[attacker]++;
    const king = this.towers.find((k) => k.side === t.side && k.kind === 'king');
    king.active = true;
    if (this.overtime) this._end(attacker);
  }

  // ---------- Ginásios ----------

  _updateTower(t, dt) {
    t.hitFlash = Math.max(0, (t.hitFlash || 0) - dt);
    if (!t.active) return;
    t.cooldown = Math.max(0, t.cooldown - dt);
    const inRange = (u) => !u.dead && u.side !== t.side && edgeDist(t, u) <= t.stats.range;
    if (!t.target || !inRange(t.target)) {
      t.target = null;
      let bestD = Infinity;
      for (const u of this.units) {
        if (!inRange(u)) continue;
        const d = edgeDist(t, u);
        if (d < bestD) {
          bestD = d;
          t.target = u;
        }
      }
    }
    if (t.target && t.cooldown <= 0) {
      t.cooldown = t.stats.hitSpeed;
      this.projectiles.push({
        x: t.x, y: t.y - t.radius * 0.6, target: t.target, speed: 13,
        dmg: t.stats.dmg, type: 'normal', splash: 0, source: t, side: t.side, tower: true,
      });
    }
  }

  // ---------- Projéteis e golpes ----------

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      const t = p.target;
      if (t.dead) {
        p.done = true;
        continue;
      }
      const ty = t.y - (t.air ? 0.8 : 0);
      const dx = t.x - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step + 0.1) {
        p.done = true;
        this._hit(p.source, t, p.dmg, p.type, p.splash);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  _resolveSpell(s) {
    const c = s.card;
    for (const e of [...this._enemiesOf(s.side)]) {
      if (Math.hypot(e.x - s.x, e.y - s.y) > c.radius + e.radius) continue;
      this._damage(e, c.dmg * (e.isTower ? c.towerMult : 1), c.type, null);
      if (c.stun && !e.isTower) e.stun = Math.max(e.stun, c.stun);
    }
    this.effects.push({ kind: 'blast', x: s.x, y: s.y, radius: c.radius, color: TYPE_COLORS[c.type], ttl: 0.5, total: 0.5, spell: c.id });
  }

  // ---------- Rede ----------
  // O anfitrião envia toSnapshot() ~20x/s; o convidado só aplica e interpola.

  toSnapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      time: r(this.time), endTime: this.endTime, overtime: this.overtime,
      over: this.over, winner: this.winner, crowns: this.crowns,
      players: this.players.map((p) => ({ energy: r(p.energy), hand: p.hand, next: p.queue[0] })),
      towers: this.towers.map((t) => ({ hp: Math.round(t.hp), active: t.active, dead: t.dead, hf: r(t.hitFlash || 0) })),
      units: this.units.map((u) => ({
        id: u.id, c: u.card.id, s: u.side, x: r(u.x), y: r(u.y), hp: Math.round(u.hp), mhp: u.maxHp,
        r: r(u.radius), d: r(u.deploy), st: r(u.stun), ev: u.evolved, a: r(u.attackAnim), hf: r(u.hitFlash || 0),
      })),
      projectiles: this.projectiles.map((p) => ({ x: r(p.x), y: r(p.y), type: p.type, tower: !!p.tower })),
      spells: this.spells.map((s) => ({ c: s.card.id, s: s.side, x: s.x, y: s.y, timer: r(s.timer), total: s.total })),
      effects: this.effects.map((e) => ({ ...e, x: r(e.x), y: r(e.y) })),
    };
  }

  applySnapshot(snap) {
    Object.assign(this, {
      time: snap.time, endTime: snap.endTime, overtime: snap.overtime,
      over: snap.over, winner: snap.winner, crowns: snap.crowns,
    });
    snap.players.forEach((p, i) => {
      Object.assign(this.players[i], { energy: p.energy, hand: p.hand, queue: [p.next] });
    });
    snap.towers.forEach((t, i) => {
      Object.assign(this.towers[i], { hp: t.hp, active: t.active, dead: t.dead, hitFlash: t.hf });
    });
    const old = new Map(this.units.map((u) => [u.id, u]));
    this.units = snap.units.map((s) => {
      const card = CARDS[s.c];
      let u = old.get(s.id);
      if (!u) {
        u = { id: s.id, side: s.s, card, x: s.x, y: s.y, types: card.types, air: !!card.air };
      }
      u.def = s.ev ? { ...card, ...card.evolve.into } : card;
      Object.assign(u, {
        tx: s.x, ty: s.y, hp: s.hp, maxHp: s.mhp, radius: s.r, deploy: s.d,
        stun: s.st, evolved: s.ev, attackAnim: s.a, hitFlash: s.hf,
      });
      return u;
    });
    this.projectiles = snap.projectiles;
    this.spells = snap.spells.map((s) => ({ ...s, card: CARDS[s.c], side: s.s }));
    this.effects = snap.effects;
  }

  // Convidado: aproxima suavemente as posições recebidas entre um snapshot e outro
  interpolate(dt) {
    const k = Math.min(1, dt * 15);
    for (const u of this.units) {
      u.x += (u.tx - u.x) * k;
      u.y += (u.ty - u.y) * k;
    }
    this._updateEffects(dt);
  }

  // ---------- Colisão ----------

  _separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead || a.air !== b.air) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d >= min) continue;
        if (d < 1e-4) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d = Math.hypot(dx, dy);
        }
        const overlap = min - d;
        const ma = a.def.mass || 1;
        const mb = b.def.mass || 1;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * overlap * (mb / (ma + mb));
        a.y -= ny * overlap * (mb / (ma + mb));
        b.x += nx * overlap * (ma / (ma + mb));
        b.y += ny * overlap * (ma / (ma + mb));
      }
    }
    for (const u of us) {
      if (u.dead) continue;
      if (!u.air) {
        for (const t of this.towers) {
          if (t.dead) continue;
          const dx = u.x - t.x;
          const dy = u.y - t.y;
          const d = Math.hypot(dx, dy) || 1e-4;
          const min = u.radius + t.radius;
          if (d < min) {
            u.x = t.x + (dx / d) * min;
            u.y = t.y + (dy / d) * min;
          }
        }
        // No rio, fica preso à ponte
        if (u.y > ARENA.RIVER_TOP && u.y < ARENA.RIVER_BOTTOM) {
          const b = this._nearestBridge(u.x);
          const h = ARENA.BRIDGE_HALF - u.radius * 0.5;
          u.x = clamp(u.x, b - h, b + h);
        }
      }
      u.x = clamp(u.x, 0.4, ARENA.W - 0.4);
      u.y = clamp(u.y, 0.4, ARENA.H - 0.4);
    }
  }
}
