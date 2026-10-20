// Oponente controlado pelo computador. Só age por game.deploy(); a única vantagem
// por nível é o energyRate (recarga de energia em relação à do jogador).

// pushAt: energia para atacar (sorteada entre pushAt − 3 e pushAt a cada ataque);
// openChance: chance de o bot abrir a partida sozinho (senão espera o jogador ou juntar energia);
// openAt: a partir de quantos segundos ele pode abrir (o momento exato é sorteado, até +6 s)
const BOT_LEVELS = {
  easy: { think: 2.2, reaction: 0.5, pushAt: 10, mistakes: 0.45, energyRate: 0.85, openChance: 0.4, openAt: 5 },
  normal: { think: 1.0, reaction: 0.85, pushAt: 9.5, mistakes: 0.15, energyRate: 1, openChance: 0.55, openAt: 3 },
  hard: { think: 0.4, reaction: 1.0, pushAt: 10, mistakes: 0, energyRate: 1.2, openChance: 0.65, openAt: 2 },
};

class Bot {
  constructor(game, side, level = 'normal') {
    this.game = game;
    this.side = side;
    this.cfg = BOT_LEVELS[level];
    this.timer = 2.5;
    this._rollPush();
    // Abre a partida ou não? E quando? Sorteado a cada partida, para não dar para prever
    this.opensAt = Math.random() < this.cfg.openChance ? this.cfg.openAt + Math.random() * 6 : Infinity;
  }

  // Cada ataque acontece com uma quantidade diferente de energia (fica menos previsível)
  _rollPush() {
    this.pushAt = this.cfg.pushAt - Math.random() * 3;
  }

  update(dt) {
    if (this.game.over) return;
    const g = this.game;
    const extra = (this.cfg.energyRate - 1) * ((g.doubleEnergy ? 2 : 1) / MATCH.ENERGY_REGEN) * dt;
    this.me.energy = clamp(this.me.energy + extra, 0, MATCH.ENERGY_MAX);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cfg.think * (0.7 + Math.random() * 0.6);
    this._think();
  }

  get me() {
    return this.game.players[this.side];
  }

  // Converte "profundidade" (0 = minha base, 32 = base inimiga) em y do mundo
  _y(depth) {
    return this.side === 0 ? ARENA.H - depth : depth;
  }

  _depth(y) {
    return this.side === 0 ? ARENA.H - y : y;
  }

  _hand() {
    return this.me.hand.map((id, i) => ({ id, i, card: CARDS[id] })).filter((h) => h.card.cost <= this.me.energy);
  }

  _think() {
    const g = this.game;
    const threats = g.units.filter((u) => u.side !== this.side && this._depth(u.y) < 19);
    if (threats.length && Math.random() < this.cfg.reaction) {
      if (this._defend(threats)) return;
      // Ameaça grande e sem resposta agora: guarda energia
      if (threats.reduce((s, u) => s + u.hp, 0) > 800) return;
    }
    if (this._finishTower()) return;
    if (this._support()) return;
    // Abertura: sem nada em campo, começa a jogar sozinho (não espera o jogador)
    const mine = g.units.some((u) => u.side === this.side);
    if (!mine && g.time >= this.opensAt && this._open()) return;
    if (this.me.energy >= this.pushAt && this._push()) this._rollPush();
  }

  // Joga uma carta lá atrás, numa pista: ela anda até a ponte enquanto a energia recarrega
  // e vira o começo de um ataque (como os jogadores fazem no Clash Royale)
  _open() {
    const hand = this._hand().filter((h) => h.card.kind === 'unit' && !h.card.kamikaze);
    if (!hand.length) return false;
    const tank = hand.find((h) => h.card.targets === 'buildings' && h.card.cost <= this.me.energy);
    const pick = tank || hand.reduce((a, b) => (b.card.hp * (b.card.count || 1) > a.card.hp * (a.card.count || 1) ? b : a));
    const lane = Math.random() < 0.5 ? 0 : 1;
    if (Math.random() < 0.3) return this._tryDeploy(pick.i, ARENA.BRIDGES[lane], this._y(13)); // direto na ponte
    const x = (ARENA.BRIDGES[lane] + ARENA.W / 2) / 2;
    return this._tryDeploy(pick.i, x, this._y(3.5));
  }

  _tryDeploy(i, x, y) {
    const tries = [[0, 0], [1.5, 0], [-1.5, 0], [0, -1.5], [2.5, 1], [-2.5, 1]];
    for (const [ox, oy] of tries) {
      const px = clamp(x + ox, 0.6, ARENA.W - 0.6);
      const py = y + (this.side === 0 ? -oy : oy);
      if (this.game.deploy(this.side, i, px, py)) return true;
    }
    return false;
  }

  _defend(threats) {
    const g = this.game;
    // Ameaça mais perigosa: muita vida e perto da minha base
    const threat = threats.reduce((a, b) => (b.hp / (1 + this._depth(b.y)) > a.hp / (1 + this._depth(a.y)) ? b : a));
    const hand = this._hand();
    let best = null;
    let bestScore = 0.5;
    for (const h of hand) {
      const c = h.card;
      let score;
      if (c.kind === 'spell') {
        if (c.groundOnly && threat.air) continue; // Terremoto não pega voador
        const cluster = threats.filter((u) => Math.hypot(u.x - threat.x, u.y - threat.y) <= c.radius && !(c.groundOnly && u.air));
        const total = cluster.reduce((s, u) => s + u.hp, 0);
        const m = typeMultiplier(c.type, threat.types);
        const kills = threat.hp <= c.dmg * m;
        if (cluster.length < 2 && !kills) continue;
        if (total < c.dmg * 0.6 && !kills) continue;
        score = m * 1.5 + cluster.length * 0.7 - c.cost * 0.15;
      } else if (c.kind === 'building') {
        // Construção de defesa (Torre, Laboratório, Snorlax): puxa e segura a ameaça no meio do campo
        if (c.heal || c.spawn) continue;
        if (c.dmg && threat.air && c.targets === 'ground') continue;
        score = 1.3 + (threat.def.targets === 'buildings' ? 1.2 : 0)
          + (c.dmg ? typeMultiplier(c.type, threat.types) * 0.6 : 0.3)
          - c.cost * 0.15;
      } else {
        if (c.targets === 'buildings') continue;
        if (threat.air && c.targets === 'ground') continue;
        score = typeMultiplier(c.type, threat.types) * 2
          - typeMultiplier(threat.def.type, c.types)
          + (c.hp * (c.count || 1)) / 1000 * 0.5
          - c.cost * 0.15;
      }
      if (Math.random() < this.cfg.mistakes) score *= Math.random();
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    if (!best) return false;
    const c = best.card;
    if (c.kind === 'spell') {
      // Mira um pouco à frente, na direção em que a ameaça anda
      const lead = (threat.def.speed || 1) * c.delay * (threat.side === 0 ? -1 : 1);
      return g.deploy(this.side, best.i, threat.x, threat.y + lead);
    }
    if (c.kind === 'building') {
      const x = clamp((threat.x + ARENA.W / 2) / 2, 4, ARENA.W - 4);
      return this._tryDeploy(best.i, x, this._y(8));
    }
    const gap = c.range > 2 ? c.range + 1 : 1.5;
    const depth = clamp(this._depth(threat.y) - gap, 1, 14.5);
    return this._tryDeploy(best.i, threat.x, this._y(depth));
  }

  _finishTower() {
    const g = this.game;
    const targets = g.towers.filter((t) => t.side !== this.side && !t.dead);
    for (const h of this._hand()) {
      if (h.card.kind !== 'spell') continue;
      const t = targets.find((tw) => tw.hp <= h.card.dmg * h.card.towerMult);
      if (t) return g.deploy(this.side, h.i, t.x, t.y);
    }
    return false;
  }

  _support() {
    const g = this.game;
    const mine = g.units.filter((u) => u.side === this.side && !u.isBuilding && this._depth(u.y) > 12);
    if (!mine.length) return false;
    const lead = mine.reduce((a, b) => (b.hp > a.hp ? b : a));
    // Centro Pokémon atrás do ataque, para curar quem está indo
    const center = this._hand().find((h) => h.card.heal);
    if (center && lead.hp > 600 && Math.random() < 0.5) {
      return this._tryDeploy(center.i, lead.x, this._y(clamp(this._depth(lead.y) - 3, 3, 14)));
    }
    if (lead.hp < 1500 && Math.random() < 0.6) return false;
    const support = this._hand().filter((h) => h.card.kind === 'unit' && h.card.targets !== 'buildings' && h.card.cost + 1 <= this.me.energy);
    if (!support.length) return false;
    const pick = support[Math.floor(Math.random() * support.length)];
    const depth = clamp(this._depth(lead.y) - 2.5, 1, 14.5);
    return this._tryDeploy(pick.i, lead.x, this._y(depth));
  }

  _push() {
    const g = this.game;
    // Pista do ginásio inimigo mais fraco
    const enemy = g.towers.filter((t) => t.side !== this.side && t.kind === 'princess');
    const score = (t) => (t.dead ? -1 : t.hp);
    const weak = enemy.reduce((a, b) => (score(b) < score(a) ? b : a));
    const laneX = ARENA.BRIDGES[weak.lane];
    // Caverna Zubat lá atrás, na pista do ataque: vai soltando Zubats
    const cave = this._hand().find((h) => h.card.spawn);
    if (cave && Math.random() < 0.5) return this._tryDeploy(cave.i, (laneX + ARENA.W / 2) / 2, this._y(5));
    const units = this._hand().filter((h) => h.card.kind === 'unit');
    if (!units.length) return false;
    const tank = units.find((h) => h.card.targets === 'buildings');
    const pick = tank || units[Math.floor(Math.random() * units.length)];
    // Tanque às vezes vai do fundo (junta energia para o suporte), senão direto na ponte
    const depth = tank && Math.random() < 0.4 ? 9 : 14;
    return this._tryDeploy(pick.i, laneX, this._y(depth));
  }
}
