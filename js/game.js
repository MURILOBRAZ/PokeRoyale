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

// Animação de ataque: normal ou, com alt, o golpe próprio do Pokémon (strike/special), se ele tiver
function unitAttackAnim(def, alt) {
  const sp = typeof SPRITES !== 'undefined' ? SPRITES[def.dex] : null;
  if (!sp) return null;
  const ranged = def.range > 1.6;
  const sig = ranged ? sp.special : sp.strike;
  if (alt && sig) return sig;
  return ranged ? sp.shoot || sp.attack : sp.attack;
}

// Tempo do começo da animação de ataque até o quadro em que o golpe acerta (campo hit do SpriteCollab).
// O dano sai nesse momento, sincronizado com o desenho. Limitado para não pesar no balanceamento.
function hitDelay(def, alt) {
  const anim = unitAttackAnim(def, alt);
  if (!anim || !(anim.hit > 0)) return 0;
  const frames = anim.d.slice(0, anim.hit).reduce((a, b) => a + b, 0);
  return Math.min(frames / 60, 0.35, def.hitSpeed * 0.5);
}

// Pokémon de água (terrestre) atravessa o rio nadando, sem precisar da ponte — só nas arenas em que
// o rio é de água (em Cinnabar é lava, em Viridian um cânion...)
const canSwim = (u) => !u.air && !u.isBuilding && !!u.types && u.types.includes('water');
const SWIM_SPEED = 1.3; // nadando é 30% mais rápido que andando
const inRiver = (x, y) => y > ARENA.RIVER_TOP && y < ARENA.RIVER_BOTTOM && !ARENA.BRIDGES.some((b) => Math.abs(x - b) < ARENA.BRIDGE_HALF);
// Elétrico conduz na água: o golpe que acerta alguém nadando também acerta os inimigos nadando perto dele
const CONDUCT_RADIUS = 2.5;
const CONDUCT_MULT = 0.5;
// Mapas com muita água (js/terrain.js, GDD 22.4): casa a casa, o que é terra e o que é água
const TERRAIN_STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// Centro exato da arena: quem é invocado ali (sem pender para nenhuma pista) vai ao ginásio lateral que
// ainda está de pé; fora dele, vale a metade em que caiu
const CENTER_HALF = 0.5;
// Na escolha do alvo, o Líder conta como mais longe enquanto houver ginásio lateral de pé
const KING_BIAS = 3;
// Depois de escolher o ginásio, o Pokémon só troca de pista se for parar bem dentro da outra metade
// (ex.: perseguindo alguém); a caminho do Líder, no centro, ele não troca pelo lateral
const LANE_SWITCH = 1.5;

function edgeDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
}

class Game {
  // levels: nível de cada carta por lado ({id: nível}); trainers: nível de treinador por lado (ginásios).
  // Sem eles, tudo joga com os stats base (treino e amistosos).
  // skins: visual dos ginásios de cada lado (cosmético, não muda nada na simulação)
  constructor({ decks = [DEFAULT_DECK, DEFAULT_DECK], levels = [{}, {}], trainers = [1, 1], skins = ['skin:classico', 'skin:classico'], arena = 0 } = {}) {
    this.skins = skins;
    const stage = ARENAS[arena] || ARENAS[0];
    this.swimRiver = stage.river === 'water';
    this._setTerrain(typeof TERRAIN !== 'undefined' ? TERRAIN[stage.map] : null);
    this.levels = levels;
    this.trainers = trainers;
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
    this.fxSeq = 0; // número do último efeito criado (o som toca só os novos, também no convidado)
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

  // ---------- Terreno (mapas com muita água) ----------
  // wet: casa de água; main: terra ligada aos ginásios (ilhas soltas no meio da água não recebem terrestres)

  _setTerrain(rows) {
    this.terrain = null;
    this.flowCache = new Map();
    if (!rows) return;
    const W = ARENA.W;
    const wet = new Uint8Array(W * ARENA.H);
    rows.forEach((row, gy) => {
      for (let gx = 0; gx < W; gx++) wet[gy * W + gx] = row[gx] === '~' ? 1 : 0;
    });
    const main = new Uint8Array(wet.length);
    const stack = [Math.floor(25.5) * W + Math.floor(ARENA.BRIDGES[0])];
    main[stack[0]] = 1;
    while (stack.length) {
      const c = stack.pop();
      const gx = c % W;
      for (const n of [c - W, c + W, gx > 0 ? c - 1 : -1, gx < W - 1 ? c + 1 : -1]) {
        if (n >= 0 && n < wet.length && !wet[n] && !main[n]) {
          main[n] = 1;
          stack.push(n);
        }
      }
    }
    this.terrain = { wet, main };
  }

  _cell(x, y) {
    return clamp(Math.floor(y), 0, ARENA.H - 1) * ARENA.W + clamp(Math.floor(x), 0, ARENA.W - 1);
  }

  _cellCenter(c) {
    return [(c % ARENA.W) + 0.5, Math.floor(c / ARENA.W) + 0.5];
  }

  _inWater(x, y) {
    return this.terrain ? this.terrain.wet[this._cell(x, y)] === 1 : this.swimRiver && inRiver(x, y);
  }

  // Ponto de terra mais perto de (x, y) (mainOnly: só a terra ligada aos ginásios)
  _nearestLand(x, y, mainOnly = false) {
    const { wet, main } = this.terrain;
    let best = null;
    let bestD = Infinity;
    for (let c = 0; c < wet.length; c++) {
      if (wet[c] || (mainOnly && !main[c])) continue;
      const gx = c % ARENA.W;
      const gy = Math.floor(c / ARENA.W);
      const px = clamp(x, gx + 0.05, gx + 0.95);
      const py = clamp(y, gy + 0.05, gy + 0.95);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [px, py];
      }
    }
    return best || [x, y];
  }

  // Caminho reto todo em terra? (margin: meia largura do corredor, para o corpo não raspar na água)
  _clearPath(x0, y0, x1, y1, margin = 0.3, body = 0.5) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) return true;
    // Nem passando por cima de um ginásio de pé (menos o do destino): o caminho é que contorna eles
    for (const t of this.towers) {
      if (t.dead || Math.hypot(t.x - x1, t.y - y1) < t.radius + body) continue;
      const k = clamp(((t.x - x0) * (x1 - x0) + (t.y - y0) * (y1 - y0)) / (len * len), 0, 1);
      if (Math.hypot(x0 + (x1 - x0) * k - t.x, y0 + (y1 - y0) * k - t.y) < t.radius + body) return false;
    }
    const px = (-(y1 - y0) / len) * margin;
    const py = ((x1 - x0) / len) * margin;
    const n = Math.ceil(len / 0.3);
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      const { wet } = this.terrain;
      if (wet[this._cell(x, y)] || wet[this._cell(x + px, y + py)] || wet[this._cell(x - px, y - py)]) return false;
    }
    return true;
  }

  // Distância andando (só por terra) de cada casa até a casa do alvo. Os ginásios de pé (menos o do
  // destino) bloqueiam as casas que ocupam, para o caminho já contorná-los em vez de desviar em cima da hora.
  // Guardada por casa de destino e ginásios de pé
  _flow(goal) {
    const key = `${goal}:${this.towers.map((t) => (t.dead ? 0 : 1)).join('')}`;
    let flow = this.flowCache.get(key);
    if (flow) return flow;
    const W = ARENA.W;
    const wet = Uint8Array.from(this.terrain.wet);
    const [gx0, gy0] = this._cellCenter(goal);
    for (const t of this.towers) {
      const reach = t.radius + 0.35;
      if (t.dead || Math.hypot(gx0 - t.x, gy0 - t.y) < reach) continue;
      for (let c = 0; c < wet.length; c++) {
        const [cx, cy] = this._cellCenter(c);
        if (Math.hypot(cx - t.x, cy - t.y) < reach) wet[c] = 1;
      }
    }
    flow = new Float64Array(wet.length).fill(Infinity); // Float64: com Float32 o arredondamento das diagonais (√2) descartava casas
    flow[goal] = 0;
    const heap = [[0, goal]];
    const push = (item) => {
      heap.push(item);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, c] = pop();
      if (d > flow[c]) continue;
      const gx = c % W;
      const gy = Math.floor(c / W);
      for (const [dx, dy, cost] of TERRAIN_STEPS) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= ARENA.H) continue;
        const n = ny * W + nx;
        // Na diagonal, não corta a quina da água
        if (wet[n] || (dx && dy && (wet[gy * W + nx] || wet[ny * W + gx]))) continue;
        if (d + cost < flow[n]) {
          flow[n] = d + cost;
          push([d + cost, n]);
        }
      }
    }
    flow.blocked = wet; // terra/água com os ginásios de pé marcados, para o passo a passo seguir as mesmas regras
    if (this.flowCache.size > 300) this.flowCache.clear();
    this.flowCache.set(key, flow);
    return flow;
  }

  // Terrestre num mapa de água: segue o caminho por terra, indo reto até onde der
  _terrainWaypoint(u, tx, ty) {
    const body = u.radius + 0.1;
    if (this._clearPath(u.x, u.y, tx, ty, 0.3, body)) return [tx, ty];
    const goal = this._cell(tx, ty);
    const flow = this._flow(goal);
    let cell = this._cell(u.x, u.y);
    // Em terra, numa casa que o caminho evita por estar colada a um ginásio (o corpo do Pokémon ainda cabe ali):
    // segue a partir da vizinha com caminho, em vez de voltar para trás
    if (!Number.isFinite(flow[cell]) && !this.terrain.wet[cell]) {
      let near = -1;
      for (const [dx, dy] of TERRAIN_STEPS) {
        const gx = (cell % ARENA.W) + dx;
        const gy = Math.floor(cell / ARENA.W) + dy;
        if (gx < 0 || gx >= ARENA.W || gy < 0 || gy >= ARENA.H) continue;
        const n = gy * ARENA.W + gx;
        if (Number.isFinite(flow[n]) && (near < 0 || flow[n] < flow[near])) near = n;
      }
      if (near >= 0) cell = near;
    }
    if (!Number.isFinite(flow[cell])) {
      // Sem caminho a partir daqui: na água ou numa casa colada a um ginásio (que o caminho evita). Vai para
      // a casa mais perto que tenha caminho e segue dali
      let best = -1;
      let bestD = Infinity;
      for (let c = 0; c < flow.length; c++) {
        if (!Number.isFinite(flow[c])) continue;
        const [cx, cy] = this._cellCenter(c);
        const d = (cx - u.x) ** 2 + (cy - u.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best < 0 ? [tx, ty] : this._cellCenter(best);
    }
    let best = null;
    for (let i = 0; i < 8 && cell !== goal; i++) {
      let next = -1;
      const cx0 = cell % ARENA.W;
      const cy0 = Math.floor(cell / ARENA.W);
      for (const [dx, dy] of TERRAIN_STEPS) {
        const gx = cx0 + dx;
        const gy = cy0 + dy;
        if (gx < 0 || gx >= ARENA.W || gy < 0 || gy >= ARENA.H) continue;
        const n = gy * ARENA.W + gx;
        // Diagonal que corta a quina da água não vale (igual ao cálculo do caminho)
        if (dx && dy && (flow.blocked[cy0 * ARENA.W + gx] || flow.blocked[gy * ARENA.W + cx0])) continue;
        if (flow[n] < flow[next < 0 ? cell : next]) next = n;
      }
      if (next < 0) break;
      cell = next;
      const [cx, cy] = this._cellCenter(cell);
      if (best && !this._clearPath(u.x, u.y, cx, cy, 0.3, body)) break;
      best = [cx, cy];
    }
    return best || [tx, ty];
  }

  _createTowers() {
    for (const side of [0, 1]) {
      const yP = side === 0 ? 25.5 : 6.5;
      const yK = side === 0 ? 29 : 3;
      this._addTower(side, 'princess', ARENA.BRIDGES[0], yP, 0);
      this._addTower(side, 'princess', ARENA.BRIDGES[1], yP, 1);
      this._addTower(side, 'king', 9, yK, -1);
    }
  }

  _addTower(side, kind, x, y, lane) {
    const base = TOWERS[kind];
    const m = towerMultiplier(this.trainers[side]);
    const s = { ...base, hp: Math.round(base.hp * m), dmg: Math.round(base.dmg * m) };
    this.towers.push({
      id: this.nextId++, isTower: true, side, kind, lane, x, y,
      radius: s.radius, hp: s.hp, maxHp: s.hp, types: [], // ginásios não têm tipo
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
    // Mapa com água: terrestres e construções só na terra ligada aos ginásios; os de água também na água
    if (this.terrain && !card.air) {
      const c = this._cell(x, y);
      const swimmer = card.kind === 'unit' && card.types.includes('water');
      if (this.terrain.wet[c] ? !swimmer : !this.terrain.main[c]) return false;
    }
    // Construção não pode trancar a saída de uma ponte
    if (card.kind === 'building') {
      // Nem no corredor das pistas (entre a ponte e o ginásio lateral), por onde todos passam
      if (ARENA.BRIDGES.some((bx) => Math.abs(x - bx) < ARENA.BRIDGE_HALF + card.radius + 0.6)) return false;
      // Nem no rio ou colada nele (o bolsão chega até a margem)
      if (y > ARENA.RIVER_TOP - card.radius - 0.3 && y < ARENA.RIVER_BOTTOM + card.radius + 0.3) return false;
      for (const u of this.units) {
        if (u.isBuilding && !u.dead && Math.hypot(u.x - x, u.y - y) < u.radius + card.radius) return false;
      }
      // Nem colada num ginásio (deixaria um vão onde os Pokémon ficam presos)
      for (const t of this.towers) {
        if (!t.dead && Math.hypot(t.x - x, t.y - y) < t.radius + card.radius + 2.0) return false;
      }
    }
    const own = side === 0 ? y >= ARENA.RIVER_BOTTOM : y <= ARENA.RIVER_TOP;
    if (own) return true;
    // Bolsão: ginásio lateral inimigo derrubado libera a metade inimiga daquela pista
    const lane = x < ARENA.W / 2 ? 0 : 1;
    const enemyTower = this.towers.find((t) => t.side !== side && t.kind === 'princess' && t.lane === lane);
    if (!enemyTower.dead) return false;
    return side === 0 ? y >= 11 : y <= ARENA.H - 11;
  }

  // Ponto permitido mais próximo de (x, y): soltar a carta num lugar proibido (lado do oponente,
  // rio, em cima de um ginásio) faz o Pokémon nascer ali do lado, em vez de não acontecer nada.
  snapPosition(side, cardId, x, y) {
    const card = CARDS[cardId];
    if (!card) return null;
    x = clamp(x, 0.5, ARENA.W - 0.5);
    y = clamp(y, 0.5, ARENA.H - 0.5);
    if (card.kind === 'spell' || this.isValidPosition(side, cardId, x, y)) return [x, y];
    let best = null;
    let bestD = Infinity;
    for (let gy = 0.5; gy <= ARENA.H - 0.5; gy += 0.25) {
      for (let gx = 0.5; gx <= ARENA.W - 0.5; gx += 0.25) {
        const d = (gx - x) ** 2 + (gy - y) ** 2;
        if (d < bestD && this.isValidPosition(side, cardId, gx, gy)) {
          bestD = d;
          best = [gx, gy];
        }
      }
    }
    return best;
  }

  canDeploy(side, handIndex, x, y) {
    if (this.over) return false;
    const p = this.players[side];
    const cardId = p.hand[handIndex];
    if (!cardId) return false;
    if (p.energy < CARDS[cardId].cost) return false;
    return !!this.snapPosition(side, cardId, x, y);
  }

  deploy(side, handIndex, x, y) {
    if (!this.canDeploy(side, handIndex, x, y)) return false;
    [x, y] = this.snapPosition(side, this.players[side].hand[handIndex], x, y);
    const p = this.players[side];
    const cardId = p.hand[handIndex];
    const card = CARDS[cardId];
    p.energy -= card.cost;
    p.queue.push(cardId);
    p.hand[handIndex] = p.queue.shift();

    if (card.kind === 'spell') {
      this._fx({ kind: 'cast', spell: card.id, type: card.type, x, y, side, ttl: 0.3, total: 0.3 });
      const mult = levelMultiplier(card, this.levels[side][cardId]);
      this.spells.push({ card, side, x, y, timer: card.delay, total: card.delay, mult });
    } else if (card.kind === 'building') {
      this._fx({ kind: 'spawn', building: true, x, y, side, n: 1, ttl: 0.7, total: 0.7 });
      this._spawnBuilding(card, side, x, y, levelMultiplier(card, this.levels[side][cardId]));
    } else {
      const n = card.count || 1;
      // A Poké Ball sai voando do Líder de quem jogou até o ponto escolhido
      const king = this.towers.find((t) => t.side === side && t.kind === 'king');
      this._fx({ kind: 'spawn', dex: card.dex, x, y, bx: king.x, by: king.y - king.radius, side, n, legendary: !!card.legendary, ttl: card.legendary ? 1.4 : 0.7, total: card.legendary ? 1.4 : 0.7, shake: card.legendary ? 0.2 : 0 });
      if (card.legendary) this.events.push({ text: `✨ ${card.name} lendário entrou na batalha!`, side });
      const offsets = n === 1 ? [[0, 0]] : [[0, -0.5], [-0.6, 0.4], [0.6, 0.4]];
      for (let i = 0; i < n; i++) {
        const [ox, oy] = offsets[i % offsets.length];
        this._spawnUnit(card, side, x + ox, y + (side === 0 ? oy : -oy), levelMultiplier(card, this.levels[side][cardId]));
      }
    }
    return true;
  }

  _spawnUnit(card, side, x, y, mult = 1) {
    const hp = Math.round(card.hp * mult);
    // Terrestres nunca nascem dentro do rio (bandos se espalham ao redor do ponto escolhido)
    if (this.terrain) {
      if (!card.air && !card.types.includes('water') && this._inWater(x, y)) [x, y] = this._nearestLand(x, y, true);
    } else if (!card.air && y > ARENA.RIVER_TOP && y < ARENA.RIVER_BOTTOM) {
      y = side === 0 ? ARENA.RIVER_BOTTOM + 0.05 : ARENA.RIVER_TOP - 0.05;
    }
    const u = {
      id: this.nextId++, side, card,
      def: { ...card, hp, dmg: Math.round(card.dmg * mult) },
      mult,
      x: clamp(x, 0.5, ARENA.W - 0.5), y: clamp(y, 0.5, ARENA.H - 0.5),
      radius: card.radius, hp, maxHp: hp,
      types: card.types, air: !!card.air,
      deploy: MATCH.DEPLOY_TIME, cooldown: 0, stun: 0, target: null,
      kills: 0, evolved: false, dead: false, attackAnim: 0,
      face: side === 0 ? -Math.PI / 2 : Math.PI / 2, moving: false, attackT: -99,
    };
    this.units.push(u);
    return u;
  }

  // Construção: fica parada, perde vida com o tempo (some no fim da duração)
  _spawnBuilding(card, side, x, y, mult = 1) {
    const hp = Math.round(card.hp * mult);
    const b = {
      id: this.nextId++, side, card, isBuilding: true,
      def: { ...card, hp, dmg: Math.round((card.dmg || 0) * mult), heal: Math.round((card.heal || 0) * mult) },
      mult,
      x: clamp(x, 0.5, ARENA.W - 0.5), y: clamp(y, 0.5, ARENA.H - 0.5),
      radius: card.radius, hp, maxHp: hp, decay: hp / card.life,
      types: card.types, air: false,
      deploy: MATCH.DEPLOY_TIME, cooldown: 0, stun: 0, target: null,
      kills: 0, evolved: false, dead: false, attackAnim: 0, attackT: -99,
      pulse: 1, spawnTimer: card.spawnEvery ? card.spawnEvery * 0.4 : 0,
      face: side === 0 ? -Math.PI / 2 : Math.PI / 2, moving: false,
    };
    this.units.push(b);
    return b;
  }

  _updateBuilding(b, dt) {
    b.hitFlash = Math.max(0, (b.hitFlash || 0) - dt);
    if (b.deploy > 0) {
      b.deploy -= dt;
      return;
    }
    // Perde vida sozinha até sumir
    b.hp -= b.decay * dt;
    if (b.hp <= 0) {
      b.hp = 0;
      b.dead = true;
      this._fx({ kind: 'crash', x: b.x, y: b.y, radius: b.radius, ttl: 0.9, total: 0.9, shake: 0.1 });
      return;
    }
    if (b.stun > 0) {
      b.stun -= dt;
      return;
    }
    const d = b.def;
    // Centro Pokémon: cura os aliados por perto a cada segundo
    if (d.heal) {
      b.pulse -= dt;
      if (b.pulse <= 0) {
        b.pulse = 1;
        let healed = false;
        for (const u of this.units) {
          if (u.dead || u.isBuilding || u.side !== b.side || u.deploy > 0 || u.hp >= u.maxHp) continue;
          if (Math.hypot(u.x - b.x, u.y - b.y) > d.healRadius + u.radius) continue;
          u.hp = Math.min(u.maxHp, u.hp + d.heal);
          healed = true;
        }
        this._fx({ kind: 'heal', x: b.x, y: b.y, radius: d.healRadius, active: healed, ttl: 0.7, total: 0.7 });
      }
    }
    // Caverna Zubat: solta um Zubat de tempos em tempos, na frente da caverna
    if (d.spawn) {
      b.spawnTimer -= dt;
      if (b.spawnTimer <= 0) {
        b.spawnTimer = d.spawnEvery;
        const z = this._spawnUnit(CARDS[d.spawn], b.side, b.x, b.y + (b.side === 0 ? -1.3 : 1.3), b.mult);
        z.deploy = 0.4;
        z.from = b.card.id; // estatística: o dano desse Zubat conta para a Caverna
        this._fx({ kind: 'cast', type: 'poison', x: b.x, y: b.y - 0.4, side: b.side, ttl: 0.3, total: 0.3 });
      }
    }
    // Torre Pokémon e Laboratório do Mewtwo: atiram no Pokémon inimigo mais próximo ao alcance
    if (d.dmg) {
      b.cooldown = Math.max(0, b.cooldown - dt);
      const inRange = (u) => !u.isBuilding && this._canTarget(b, u) && edgeDist(b, u) <= d.range;
      if (!b.target || !inRange(b.target)) {
        b.target = null;
        let best = Infinity;
        for (const u of this.units) {
          if (!inRange(u)) continue;
          const dist = edgeDist(b, u);
          if (dist < best) {
            best = dist;
            b.target = u;
          }
        }
      }
      if (b.target && b.cooldown <= 0) {
        b.cooldown = d.hitSpeed;
        b.attackT = this.time;
        const t = b.target;
        this._fx({ kind: 'cast', type: d.type, x: b.x, y: b.y - b.radius, side: b.side, ttl: 0.25, total: 0.25 });
        this.projectiles.push({
          id: this.nextId++, x: b.x, y: b.y - b.radius, sx: b.x, sy: b.y - b.radius, target: t, speed: 11,
          dmg: d.dmg, type: d.type, splash: d.splash || 0, source: b, side: b.side,
        });
      }
    }
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

  // Efeitos visuais/sonoros: só dados simples (vão no snapshot para o convidado)
  _fx(e) {
    e.id = ++this.fxSeq;
    this.effects.push(e);
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

  // Pokémon ainda surgindo (deploy > 0) não pode ser alvo nem levar dano
  _canTarget(u, t) {
    if (!t || t.dead || t.deploy > 0) return false;
    if (t.side === u.side) return false;
    if (u.def.targets === 'buildings') return !!(t.isTower || t.isBuilding);
    if (t.air && u.def.targets === 'ground') return false;
    return true;
  }

  _acquireTarget(u) {
    // Alvo deixado de lado (não conseguiu chegar nele): volta a valer se já estiver ao alcance do ataque
    let ignored = u.ignore && this.time < u.ignore.until ? u.ignore.id : null;
    if (ignored !== null) {
      const it = [...this.towers, ...this.units].find((t) => t.id === ignored);
      if (it && edgeDist(u, it) <= u.def.range + 0.3) {
        u.ignore = null;
        ignored = null;
      }
    }
    const tower = this._laneTower(u, ignored);
    // À vista (MATCH.SIGHT, ou o alcance + 0,5 para quem ataca de longe): o Pokémon ou construção inimiga
    // mais perto. Entre os ginásios, só o da pista dele (passar perto do Líder a caminho do lateral não faz
    // ele mudar de alvo) ou um que já esteja ao alcance do ataque
    const sight = Math.max(MATCH.SIGHT, u.def.range + 0.5);
    const reach = u.def.range + 0.3;
    // Foco no que está mais perto (Pokémon, construção ou ginásio à vista), como no Clash Royale. O Líder
    // conta como KING_BIAS tiles mais longe enquanto houver lateral de pé: no meio do caminho, o lateral
    // fica sempre mais perto que ele
    const score = (t, slack = 0) => {
      const d = edgeDist(u, t);
      // O ginásio da pista sempre entra na conta, mesmo fora da visão (senão, colado no Líder, só ele "existe")
      if (!(d <= sight + slack) && t !== tower) return Infinity;
      if (d > reach + slack && this._offShore(u, t)) return Infinity; // nadando longe: o terrestre não chega lá
      return d + (t.isTower && t.kind === 'king' && this._princessUp(t.side) ? KING_BIAS : 0);
    };
    let best = null;
    let bestS = Infinity;
    for (const t of [...this.units, ...this.towers]) {
      if (!this._canTarget(u, t) || t.id === ignored) continue;
      const s = score(t);
      if (s < bestS) {
        best = t;
        bestS = s;
      }
    }
    // Não fica trocando de alvo à toa: o atual só sai por um que esteja meio tile mais perto (e tem meio
    // tile de folga no alcance e na visão, senão quem fica bem no limite vira e desvira de alvo)
    const cur = u.target;
    if (cur && cur !== best && this._canTarget(u, cur) && cur.id !== ignored) {
      const s = score(cur, 0.5);
      if (Number.isFinite(s) && bestS > s - 0.5) return cur;
    }
    return best || tower;
  }

  _princessUp(side) {
    return this.towers.some((t) => t.side === side && t.kind === 'princess' && !t.dead);
  }

  // Ginásio que o Pokémon persegue: o da pista da metade da arena em que está, dos dois lados do rio —
  // o lateral dela e, se ele já caiu, o Líder; não atravessa o mapa para o lateral da outra pista.
  // No centro exato, vai ao lateral de pé mais próximo. Se desistiu desse (preso atrás de algo), o mais perto.
  // A escolha fica guardada (laneTarget) até o ginásio cair ou o Pokémon ir para a outra metade.
  _laneTower(u, ignored) {
    const middle = Math.abs(u.x - ARENA.W / 2) < CENTER_HALF;
    const lane = u.x < ARENA.W / 2 ? 0 : 1;
    const ok = (t) => this._canTarget(u, t) && t.id !== ignored;
    // Mantém o ginásio já escolhido enquanto ele estiver de pé e o Pokémon não mudar de metade
    const prev = u.laneTarget;
    if (prev && ok(prev) && !(lane !== u.laneSide && Math.abs(u.x - ARENA.W / 2) > LANE_SWITCH)) return prev;
    const pick = this._pickLaneTower(u, lane, middle, ok);
    u.laneTarget = pick;
    u.laneSide = pick && pick.kind === 'princess' ? pick.lane : lane;
    return pick;
  }

  _pickLaneTower(u, lane, middle, ok) {
    // No meio, empate na distância fica com a pista do lado em que ele está
    const cost = (t) => edgeDist(u, t) + (t.lane === lane ? 0 : 0.01);
    let best = null;
    for (const t of this.towers) {
      if (t.kind !== 'princess' || !ok(t) || (!middle && t.lane !== lane)) continue;
      if (!best || cost(t) < cost(best)) best = t;
    }
    if (best) return best;
    const king = this.towers.find((t) => t.kind === 'king' && ok(t));
    if (king) return king;
    for (const t of this.towers) {
      if (ok(t) && (!best || edgeDist(u, t) < edgeDist(u, best))) best = t;
    }
    return best;
  }

  _updateUnit(u, dt) {
    if (u.isBuilding) return this._updateBuilding(u, dt);
    if (u.slowT > 0) u.slowT -= dt;
    u.attackAnim = Math.max(0, u.attackAnim - dt);
    u.hitFlash = Math.max(0, (u.hitFlash || 0) - dt);
    u.moving = false;
    if (u.deploy > 0) {
      u.deploy -= dt;
      return;
    }
    if (u.stun > 0) {
      u.stun -= dt;
      u.windup = null; // atordoado no meio do golpe: o golpe é perdido
      return;
    }
    u.cooldown = Math.max(0, u.cooldown - dt);

    // Golpe já começou: espera o quadro do acerto, parado no lugar
    if (u.windup) {
      u.windup.t -= dt;
      if (u.windup.t > 0) return;
      const t = u.windup.target;
      u.windup = null;
      if (this._canTarget(u, t) && edgeDist(u, t) <= u.def.range + 0.8) this._attack(u, t);
      else u.cooldown = Math.min(u.cooldown, 0.2); // o alvo sumiu: procura outro logo
      return;
    }

    // Atacando, revê o alvo a cada 0,3 s: se um inimigo chegou mais perto, troca para ele
    const locked = this._canTarget(u, u.target) && edgeDist(u, u.target) <= u.def.range + 0.3;
    if (!locked || this.time >= (u.retargetAt || 0)) {
      u.retargetAt = this.time + 0.3;
      u.target = this._acquireTarget(u);
    }
    const t = u.target;
    if (!t) return;

    // Pequena tolerância: unidades empurradas por outras ficam a centésimos do alcance
    if (edgeDist(u, t) <= u.def.range + 0.3) {
      u.chase = null; // atacando: lutar não conta como "não conseguiu chegar" no alvo de antes
      if (u.cooldown <= 0) {
        u.cooldown = u.def.hitSpeed;
        u.attackAnim = 0.2;
        u.attackT = this.time;
        // A cada 3 ataques, usa o golpe próprio (Shock do Pikachu, Kick do Hitmonlee...)
        u.attackN = (u.attackN || 0) + 1;
        u.attackAlt = u.attackN % 3 === 0;
        u.face = Math.atan2(t.y - u.y, t.x - u.x);
        const delay = hitDelay(u.def, u.attackAlt);
        if (delay > 0) u.windup = { t: delay, target: t };
        else this._attack(u, t);
      }
    } else {
      // Alvo inalcançável (ex.: atrás de um ginásio colado na parede): sem chegar mais perto em 2,5 s,
      // desiste dele por um tempo e procura outro — senão o Pokémon fica parado para sempre
      // Nos mapas de água, o avanço do terrestre é medido pelo caminho por terra (contornar a água
      // pode afastar em linha reta antes de aproximar)
      const dist = this._chaseDist(u, t);
      if (!u.chase || u.chase.id !== t.id) u.chase = { id: t.id, best: dist, since: this.time };
      else if (dist < u.chase.best - 0.25) {
        u.chase.best = dist;
        u.chase.since = this.time;
      } else if (this.time - u.chase.since > 2.5) {
        u.ignore = { id: t.id, until: this.time + 5 };
        u.chase = null;
        u.target = null;
        return;
      }
      const [wx, wy] = this._waypoint(u, t.x, t.y);
      this._moveToward(u, wx, wy, dt, t);
    }
  }

  _moveToward(u, tx, ty, dt, target) {
    const d = Math.hypot(tx - u.x, ty - u.y);
    if (d < 1e-3) return;
    const rx = (tx - u.x) / d;
    const ry = (ty - u.y) / d;
    // Nos mapas de água o caminho já contorna os ginásios: o desvio de última hora fica só para construções
    // (os dois juntos disputavam a direção e o Pokémon ia e voltava atrás do ginásio)
    const pathed = !!this.terrain && !this._swims(u);
    let [dx, dy] = u.air ? [rx, ry] : this._avoidTowers(u, rx, ry, target, pathed);
    const swim = u.swimming ? SWIM_SPEED : 1;
    const step = Math.min(d, u.def.speed * swim * (u.slowT > 0 ? 0.55 : 1) * dt); // Nevasca: mais lento
    let nx = u.x + dx * step;
    let ny = u.y + dy * step;
    // Mapa com água: quem não nada desliza pela margem (como numa parede) em vez de entrar na água; se o
    // desvio de um ginásio joga para a água, tenta reto e depois de lado
    if (this.terrain && !u.air && !this._swims(u)) {
      const land = (x, y) => !this._inWater(x, y);
      // De lado, mantém por 0,5 s o lado que já vinha usando (senão alterna a cada quadro e treme)
      const slide = u.slide && this.time < u.slide.until ? u.slide.sign : 1;
      const dirs = [[dx, dy], [rx, ry], [-dy * slide, dx * slide], [dy * slide, -dx * slide]];
      let moved = false;
      for (const [k, [cx, cy]] of dirs.entries()) {
        const ax = u.x + cx * step;
        const ay = u.y + cy * step;
        if (land(ax, ay)) [nx, ny, moved] = [ax, ay, true];
        else if (land(ax, u.y) && Math.abs(cx) > 0.2) [nx, ny, moved] = [ax, u.y, true];
        else if (land(u.x, ay) && Math.abs(cy) > 0.2) [nx, ny, moved] = [u.x, ay, true];
        if (moved) {
          if (k >= 2) u.slide = { sign: k === 2 ? slide : -slide, until: this.time + 0.5 };
          break;
        }
      }
      if (!moved) return;
      // Deslizando pela margem, continua olhando para onde quer ir (virar a cada quadro parecia girar)
      if (Math.hypot(nx - (u.x + dx * step), ny - (u.y + dy * step)) > 1e-6) [dx, dy] = [rx, ry];
    }
    u.face = Math.atan2(dy, dx);
    u.moving = true;
    u.x = nx;
    u.y = ny;
  }

  // Ginásio no caminho (que não seja o alvo): contorna pela tangente mais próxima da direção desejada
  _avoidTowers(u, dx, dy, target, buildingsOnly = false) {
    for (const t of [...(buildingsOnly ? [] : this.towers), ...this.units.filter((b) => b.isBuilding)]) {
      if (t.dead || t === target) continue;
      const ox = t.x - u.x;
      const oy = t.y - u.y;
      const od = Math.hypot(ox, oy);
      if (od > t.radius + u.radius + 0.6 || dx * ox + dy * oy <= 0) continue;
      let px = -oy / od;
      let py = ox / od;
      if (px * dx + py * dy < 0) {
        px = -px;
        py = -py;
      }
      // Ginásio colado na parede: contorna pelo lado que tem espaço para o Pokémon passar
      const towardCenter = Math.sign(ARENA.W / 2 - t.x);
      const wallRoom = towardCenter > 0 ? t.x - t.radius - 0.4 : ARENA.W - 0.4 - (t.x + t.radius);
      // (nos mapas de água, quem já está do lado do centro não é mandado de volta: ali ele contorna por baixo)
      const centerSide = !!this.terrain && (u.x - t.x) * towardCenter > 0;
      if (Math.abs(px) > 0.3 && Math.sign(px) !== towardCenter && wallRoom < u.radius * 2 && !centerSide) {
        px = -px;
        py = -py;
      }
      // Mantém o lado escolhido para contornar por 1 s (perto do limite, a regra acima trocava de lado a
      // cada quadro e o Pokémon ficava tremendo no lugar)
      const side = Math.sign(px * oy - py * ox) || 1;
      // (nunca o lado que faz o Pokémon recuar)
      const backward = -px * dx - py * dy < -0.1;
      if (u.detour && u.detour.id === t.id && this.time < u.detour.until && u.detour.side !== side && !backward) {
        px = -px;
        py = -py;
      } else if (!u.detour || u.detour.id !== t.id || this.time >= u.detour.until) {
        u.detour = { id: t.id, side, until: this.time + 1 };
      }
      return [px, py];
    }
    return [dx, dy];
  }

  // Terrestres só cruzam o rio pelas pontes (nos mapas de água, só andam por terra)
  _waypoint(u, tx, ty) {
    if (u.air || this._swims(u)) return [tx, ty];
    if (this.terrain) return this._terrainWaypoint(u, tx, ty);
    const RT = ARENA.RIVER_TOP;
    const RB = ARENA.RIVER_BOTTOM;
    const [b1, b2] = ARENA.BRIDGES;
    const bx = Math.abs(u.x - b1) + Math.abs(tx - b1) <= Math.abs(u.x - b2) + Math.abs(tx - b2) ? b1 : b2;
    const goingUp = ty < u.y;
    const inRiver = u.y > RT && u.y < RB;
    // Faixa da ponte que a unidade pode usar (bandos atravessam lado a lado)
    const half = Math.max(0.1, ARENA.BRIDGE_HALF - u.radius * 0.5);
    if (inRiver) {
      // Já está na ponte: segue reto até a outra margem, a não ser que o alvo esteja na ponte
      if (ty > RT && ty < RB) return [tx, ty];
      const b = this._nearestBridge(u.x);
      return [clamp(u.x, b - half, b + half), goingUp ? RT - 0.5 : RB + 0.5];
    }
    const across = (u.y >= RB && ty < RB) || (u.y <= RT && ty > RT);
    if (!across) return [tx, ty];
    const laneX = clamp(u.x, bx - half, bx + half);
    if (Math.abs(u.x - laneX) > 0.3) return [laneX, goingUp ? RB + 0.2 : RT - 0.2];
    return [laneX, goingUp ? RT - 0.5 : RB + 0.5];
  }

  // Alvo que um terrestre não alcança andando num mapa de água: nadando no mar ou numa ilha solta no meio
  // dele (no rio dos mapas comuns ele ainda alcança pela ponte)
  _offShore(u, t) {
    if (!this.terrain || t.isTower || u.air || this._swims(u)) return false;
    const c = this._cell(t.x, t.y);
    return !!t.swimming || !!this.terrain.wet[c] || !this.terrain.main[c];
  }

  _chaseDist(u, t) {
    if (!this.terrain || u.air || this._swims(u)) return edgeDist(u, t);
    const d = this._flow(this._cell(t.x, t.y))[this._cell(u.x, u.y)];
    return Number.isFinite(d) ? d : edgeDist(u, t);
  }

  _swims(u) {
    return (this.swimRiver || !!this.terrain) && canSwim(u);
  }

  _nearestBridge(x) {
    const [b1, b2] = ARENA.BRIDGES;
    return Math.abs(x - b1) < Math.abs(x - b2) ? b1 : b2;
  }

  _attack(u, t) {
    const d = u.def;
    if (d.kamikaze) {
      // Explosão: dano em área ao redor de si mesmo, e o Pokémon sai de campo
      for (const e of [...this._enemiesOf(u.side)]) {
        if (Math.hypot(e.x - u.x, e.y - u.y) <= d.splash + e.radius) this._damage(e, d.dmg, d.type, u);
      }
      this._fx({ kind: 'blast', type: d.type, x: u.x, y: u.y, radius: d.splash, color: TYPE_COLORS[d.type], ttl: 0.6, total: 0.6, shake: 0.25 });
      u.hp = 0;
      u.dead = true;
      return;
    }
    if (d.range > 1.6) {
      this._fx({ kind: 'cast', type: d.type, x: u.x, y: u.y - (u.air ? 0.8 : 0.3), side: u.side, ttl: 0.25, total: 0.25 });
      this.projectiles.push({
        id: this.nextId++, x: u.x, y: u.y - (u.air ? 0.8 : 0.3), sx: u.x, sy: u.y - (u.air ? 0.8 : 0.3), target: t, speed: 11,
        dmg: d.dmg, type: d.type, splash: d.splash || 0, source: u, side: u.side,
      });
    } else {
      this._fx({ kind: 'strike', type: d.type, x: t.x, y: t.y - (t.air ? 0.8 : 0), sx: u.x, sy: u.y, big: d.dmg >= 250, ttl: 0.3, total: 0.3 });
      this._hit(u, t, d.dmg, d.type, d.splash || 0, true);
    }
  }

  _hit(source, target, dmg, type, splash, melee = false) {
    if (!source.isTower && !melee && !(splash > 0)) {
      this._fx({ kind: 'impact', type, x: target.x, y: target.y - (target.air ? 0.8 : 0), ttl: 0.35, total: 0.35 });
    }
    const hit = new Set();
    if (splash > 0) {
      for (const e of this._enemiesOf(source.side)) {
        if (Math.hypot(e.x - target.x, e.y - target.y) <= splash + e.radius) {
          this._damage(e, dmg, type, source);
          hit.add(e);
        }
      }
      this._fx({ kind: 'blast', type, x: target.x, y: target.y, radius: splash, color: TYPE_COLORS[type], ttl: 0.4, total: 0.4 });
    } else {
      this._damage(target, dmg, type, source);
      hit.add(target);
    }
    if (type === 'electric') this._conduct(source.side, hit, dmg);
  }

  // Elétrico conduz na água: de cada alvo atingido que está nadando, a descarga passa para os inimigos
  // nadando perto dele (metade do dano)
  _conduct(side, hit, dmg) {
    for (const from of hit) {
      if (!from.swimming) continue;
      for (const e of this.units) {
        if (e.dead || e.side === side || !e.swimming || hit.has(e)) continue;
        if (Math.hypot(e.x - from.x, e.y - from.y) > CONDUCT_RADIUS + e.radius) continue;
        hit.add(e);
        this._damage(e, dmg * CONDUCT_MULT, 'electric', null);
        this._fx({ kind: 'impact', type: 'electric', x: e.x, y: e.y, ttl: 0.35, total: 0.35 });
      }
    }
  }

  *_enemiesOf(side) {
    for (const u of this.units) if (!u.dead && u.side !== side) yield u;
    for (const t of this.towers) if (!t.dead && t.side !== side) yield t;
  }

  _damage(e, amount, type, source) {
    if (e.dead || e.deploy > 0) return; // vale também para golpes, dano em área e projéteis já no ar
    const m = typeMultiplier(type, e.types);
    const v = Math.round(amount * m);
    e.hp -= v;
    e.hitFlash = 0.12;
    // Pokémon reage ao golpe (animação Hurt), no máximo uma vez por segundo para não travar o andar
    if (!e.isTower && !e.isBuilding && this.time - (e.hurtT ?? -99) > 1) e.hurtT = this.time;
    this._fx({
      kind: 'text', x: e.x + (Math.random() - 0.5) * 0.4, y: e.y - e.radius - 0.4,
      text: String(v), color: m > 1 ? '#ffe14d' : m < 1 ? '#c8c8c8' : '#ffffff',
      size: m > 1 ? 0.55 : 0.42, ttl: 0.8, total: 0.8,
    });
    if (m > 1 && (!e.lastSuper || this.time - e.lastSuper > 1.5)) {
      e.lastSuper = this.time;
      this._fx({ kind: 'text', x: e.x, y: e.y - e.radius - 1.0, text: 'Super efetivo!', color: '#ffb020', size: 0.5, ttl: 1.1, total: 1.1 });
    }
    if (e.isTower && e.kind === 'king') e.active = true;
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      if (e.isBuilding) {
        this._fx({ kind: 'crash', x: e.x, y: e.y, radius: e.radius, ttl: 0.9, total: 0.9, shake: 0.15 });
      } else if (e.isTower) {
        this._fx({ kind: 'crash', x: e.x, y: e.y, radius: e.radius, king: e.kind === 'king', ttl: 1.2, total: 1.2, shake: e.kind === 'king' ? 0.5 : 0.35 });
      } else {
        // Com a animação Faint do SpriteCollab, dá tempo de ela tocar antes de sumir
        const faint = typeof SPRITES !== 'undefined' && SPRITES[e.def.dex] && SPRITES[e.def.dex].faint;
        const ttl = faint ? 0.95 : 0.7;
        this._fx({ kind: 'faint', dex: e.def.dex, x: e.x, y: e.y, face: e.face, air: e.air, radius: e.radius, ttl, total: ttl });
      }
      if (e.isTower) this._towerDestroyed(e);
      if (source && !source.dead && !source.isTower) this._creditKill(source);
    }
  }

  // Evolui para a carta seguinte da linha evolutiva (Eevee sorteia entre as três).
  // Pode evoluir de novo: os abates contam a partir da última evolução.
  _creditKill(u) {
    u.kills++;
    const evo = u.def.evolve;
    if (!evo || u.kills < evo.kills) return;
    const into = CARDS[evo.into[Math.floor(Math.random() * evo.into.length)]];
    const before = u.def.name;
    const ratio = Math.max(0.5, u.hp / u.maxHp);
    // Membros de bando evoluem mais fracos que a carta cheia
    const scale = u.card.count > 1 ? 0.6 : 1;
    // Evolui no mesmo nível da carta original
    const m = scale * (u.mult || 1);
    u.def = { ...into, hp: Math.round(into.hp * m), dmg: Math.round(into.dmg * m) };
    u.maxHp = u.def.hp;
    u.hp = Math.round(u.maxHp * ratio);
    u.radius = u.card.count > 1 ? Math.min(into.radius, u.radius * 1.3) : into.radius;
    u.types = into.types;
    u.air = !!into.air;
    u.kills = 0;
    u.evolved = true;
    u.poseT = this.time; // comemora a evolução (animação Pose)
    u.target = null;
    this._fx({ kind: 'evolve', dex: into.dex, x: u.x, y: u.y, radius: u.radius, ttl: 1.1, total: 1.1 });
    this.events.push({ text: `${before} evoluiu para ${into.name}!`, side: u.side });
  }

  _towerDestroyed(t) {
    const attacker = 1 - t.side;
    if (t.kind === 'king') {
      // Líder caiu: os laterais que sobraram desabam juntos (como no Clash Royale)
      for (const o of this.towers) {
        if (o.side !== t.side || o.dead) continue;
        o.hp = 0;
        o.dead = true;
        this._fx({ kind: 'crash', x: o.x, y: o.y, radius: o.radius, ttl: 1.2, total: 1.2, shake: 0.35 });
      }
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
    const inRange = (u) => !u.dead && !(u.deploy > 0) && u.side !== t.side && edgeDist(t, u) <= t.stats.range;
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
      t.attackT = this.time; // recuo e clarão no desenho
      // Ginásios atiram Meteoro (estrelas); o do Líder é maior
      const y = t.y - t.radius * 0.6;
      this.projectiles.push({
        id: this.nextId++, x: t.x, y, sx: t.x, sy: y, target: t.target, speed: 13,
        dmg: t.stats.dmg, type: 'normal', splash: 0, source: t, side: t.side, tower: true, king: t.kind === 'king',
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
        p.a = Math.atan2(dy, dx);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  _resolveSpell(s) {
    const c = s.card;
    const hit = new Set();
    for (const e of [...this._enemiesOf(s.side)]) {
      const dist = Math.hypot(e.x - s.x, e.y - s.y);
      if (dist > c.radius + e.radius) continue;
      if (c.groundOnly && e.air) continue; // Terremoto não alcança quem voa
      const mult = e.isTower ? c.towerMult : e.isBuilding ? c.buildingMult || 1 : 1;
      this._damage(e, c.dmg * (s.mult || 1) * mult, c.type, null);
      hit.add(e);
      if (e.isTower || e.isBuilding || e.dead) continue;
      if (c.stun) e.stun = Math.max(e.stun, c.stun);
      if (c.slow) e.slowT = Math.max(e.slowT || 0, c.slowTime);
      // Surf: a onda empurra para longe do centro (só quem está no chão)
      if (c.knockback && !e.air) {
        const ux = dist > 0.01 ? (e.x - s.x) / dist : 0;
        const uy = dist > 0.01 ? (e.y - s.y) / dist : (e.side === 0 ? 1 : -1);
        e.x = clamp(e.x + ux * c.knockback, 0.5, ARENA.W - 0.5);
        e.y = clamp(e.y + uy * c.knockback, 0.5, ARENA.H - 0.5);
      }
    }
    if (c.type === 'electric') this._conduct(s.side, hit, c.dmg * (s.mult || 1));
    const shake = { fireblast: 0.3, earthquake: 0.45, surf: 0.12 }[c.id] || 0.15;
    this._fx({ kind: 'blast', type: c.type, x: s.x, y: s.y, radius: c.radius, color: TYPE_COLORS[c.type], ttl: c.id === 'earthquake' ? 0.9 : 0.6, total: c.id === 'earthquake' ? 0.9 : 0.6, spell: c.id, shake });
  }

  // ---------- Rede ----------
  // O anfitrião envia toSnapshot() ~20x/s; o convidado só aplica e interpola.

  toSnapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      time: r(this.time), endTime: this.endTime, overtime: this.overtime,
      over: this.over, winner: this.winner, crowns: this.crowns,
      players: this.players.map((p) => ({ energy: r(p.energy), hand: p.hand, next: p.queue[0] })),
      towers: this.towers.map((t) => ({ hp: Math.round(t.hp), mhp: t.maxHp, active: t.active, dead: t.dead, hf: r(t.hitFlash || 0), at: r(t.attackT ?? -99) })),
      units: this.units.map((u) => ({
        id: u.id, c: u.card.id, s: u.side, x: r(u.x), y: r(u.y), hp: Math.round(u.hp), mhp: u.maxHp,
        r: r(u.radius), d: r(u.deploy), st: r(u.stun), sl: r(u.slowT || 0), ev: u.evolved ? u.def.id : 0, air: u.air, fa: r(u.face), m: u.moving, at: r(u.attackT), a: r(u.attackAnim), hf: r(u.hitFlash || 0),
        aa: !!u.attackAlt, sw: !!u.swimming, ht: r(u.hurtT ?? -99), pt: r(u.poseT ?? -99),
      })),
      projectiles: this.projectiles.map((p) => ({ id: p.id, x: r(p.x), y: r(p.y), sx: r(p.sx ?? p.x), sy: r(p.sy ?? p.y), type: p.type, tower: !!p.tower, king: !!p.king, a: r(p.a || 0) })),
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
      Object.assign(this.towers[i], { hp: t.hp, maxHp: t.mhp, active: t.active, dead: t.dead, hitFlash: t.hf, attackT: t.at });
    });
    const old = new Map(this.units.map((u) => [u.id, u]));
    this.units = snap.units.map((s) => {
      const card = CARDS[s.c];
      let u = old.get(s.id);
      if (!u) {
        u = { id: s.id, side: s.s, card, x: s.x, y: s.y };
      }
      u.def = s.ev ? CARDS[s.ev] : card;
      u.isBuilding = card.kind === 'building';
      u.types = u.def.types;
      u.air = s.air;
      Object.assign(u, {
        tx: s.x, ty: s.y, hp: s.hp, maxHp: s.mhp, radius: s.r, deploy: s.d,
        face: s.fa, moving: s.m, attackT: s.at,
        stun: s.st, slowT: s.sl, evolved: !!s.ev, attackAnim: s.a, hitFlash: s.hf,
        attackAlt: s.aa, swimming: s.sw, hurtT: s.ht, poseT: s.pt,
      });
      return u;
    });
    this.projectiles = snap.projectiles;
    this.spells = snap.spells.map((s) => ({ ...s, card: CARDS[s.c], side: s.s }));
    this.effects = snap.effects;
  }

  // Convidado: aproxima suavemente as posições recebidas entre um snapshot e outro
  interpolate(dt) {
    this.time += dt; // avança o relógio local até o próximo snapshot (animações)
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
        // Inimigos que não podem atacar um ao outro (ex.: dois tanques de ginásio) passam sem se bloquear
        if (a.side !== b.side && !this._canTarget(a, b) && !this._canTarget(b, a)) continue;
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
        if (a.isBuilding && b.isBuilding) continue;
        const ma = a.def.mass || 1;
        const mb = b.def.mass || 1;
        // Construção não sai do lugar: quem esbarra nela é que se afasta
        const sa = a.isBuilding ? 0 : b.isBuilding ? 1 : mb / (ma + mb);
        const sb = b.isBuilding ? 0 : a.isBuilding ? 1 : ma / (ma + mb);
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * overlap * sa;
        a.y -= ny * overlap * sa;
        b.x += nx * overlap * sb;
        b.y += ny * overlap * sb;
      }
    }
    for (const u of us) {
      if (u.dead || u.isBuilding) continue; // construção nunca sai do lugar
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
        // Mapa com água: empurrado para a água, quem não nada volta para a terra mais perto
        if (this.terrain) {
          if (!this._swims(u) && this._inWater(u.x, u.y)) [u.x, u.y] = this._nearestLand(u.x, u.y);
        } else if (u.y > ARENA.RIVER_TOP && u.y < ARENA.RIVER_BOTTOM && !this._swims(u)) {
          // No rio, fica preso à ponte (quem é de água nada)
          const b = this._nearestBridge(u.x);
          const h = ARENA.BRIDGE_HALF - u.radius * 0.5;
          u.x = clamp(u.x, b - h, b + h);
        }
      }
      u.x = clamp(u.x, 0.4, ARENA.W - 0.4);
      u.y = clamp(u.y, 0.4, ARENA.H - 0.4);
      // Entrou ou saiu da água: espirro
      const swimming = this._swims(u) && this._inWater(u.x, u.y);
      if (swimming !== !!u.swimming && !(u.deploy > 0)) {
        this._fx({ kind: 'splash', x: u.x, y: u.y, radius: u.radius, ttl: 0.5, total: 0.5 });
      }
      u.swimming = swimming;
    }
  }
}
