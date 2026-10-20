// Dados e balanceamento do PokéRoyale. Todos os números do jogo ficam aqui.
// As cartas de Pokémon são geradas a partir de POKEDEX (js/pokedex.js) por makePokemonCard().

// Geometria alinhada aos mapas das arenas (assets/arenas, ver tools/build-arenas.py):
// as pistas passam pelas pontes e os ginásios laterais ficam no começo de cada pista.
const ARENA = {
  W: 18,
  H: 32,
  RIVER_TOP: 14.7,
  RIVER_BOTTOM: 17.3,
  BRIDGES: [2.35, 15.65],
  BRIDGE_HALF: 1.15,
};

const MATCH = {
  DURATION: 180,
  DOUBLE_AT: 120,
  OVERTIME: 60,
  ENERGY_MAX: 10,
  ENERGY_START: 5,
  ENERGY_REGEN: 2.8, // segundos por ponto de energia
  DEPLOY_TIME: 1.0,
  SIGHT: 5.5,
};

const TOWERS = {
  princess: { hp: 1500, dmg: 55, hitSpeed: 0.8, range: 7.5, radius: 1.4 },
  king: { hp: 2600, dmg: 70, hitSpeed: 1.0, range: 7.0, radius: 1.9 },
};

// ---------- Tipos ----------

const TYPE_COLORS = {
  normal: '#A8A878', fire: '#F08030', water: '#6890F0', electric: '#F8D030',
  grass: '#78C850', ice: '#98D8D8', fighting: '#C03028', poison: '#A040A0',
  ground: '#E0C068', flying: '#A890F0', psychic: '#F85888', bug: '#A8B820',
  rock: '#B8A038', ghost: '#705898', dragon: '#7038F8', dark: '#705848',
  steel: '#B8B8D0', fairy: '#EE99AC',
};

const TYPE_NAMES = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico',
  grass: 'Planta', ice: 'Gelo', fighting: 'Lutador', poison: 'Veneno',
  ground: 'Terra', flying: 'Voador', psychic: 'Psíquico', bug: 'Inseto',
  rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão', dark: 'Sombrio',
  steel: 'Aço', fairy: 'Fada',
};

// Tabela oficial: ataque -> tipo do alvo. Ausente = 1x.
const TYPE_CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

// Sem imunidade no jogo: o resultado fica sempre entre 0,5x e 2x
function typeMultiplier(attackType, defenderTypes) {
  let m = 1;
  for (const t of defenderTypes) {
    const row = TYPE_CHART[attackType];
    if (row && row[t] !== undefined) m *= row[t];
  }
  return Math.max(0.5, Math.min(2, m));
}

// ---------- Sprites ----------

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';
const spriteFront = (dex) => `${SPRITE_BASE}/pokemon/${dex}.png`;
const spriteBack = (dex) => `${SPRITE_BASE}/pokemon/back/${dex}.png`;
const itemIcon = (name) => `${SPRITE_BASE}/items/${name}.png`;

// ---------- Geração das cartas de Pokémon ----------

// Na 1ª geração o tipo decidia se o golpe era físico ou especial. Aqui, especial = ataque à distância.
const RANGED_TYPES = { fire: 3, water: 3.5, grass: 3, electric: 4.5, ice: 4, psychic: 4, dragon: 3.5, ghost: 3.5, fairy: 3.5 };
const SPLASH_TYPES = new Set(['fire', 'ice', 'ground', 'rock']);

// Exceções de papel na arena
const FLOATING = new Set(['gastly', 'haunter', 'koffing', 'weezing']);
const GROUNDED_BIRDS = new Set(['doduo', 'dodrio']);
const BUILDING_TARGETERS = new Set(['onix', 'graveler', 'golem', 'rhyhorn', 'rhydon', 'snorlax']);
const SWARMS = { caterpie: 3, weedle: 3, rattata: 3, spearow: 3, zubat: 3, diglett: 3, exeggcute: 3 };
const KAMIKAZE = new Set(['voltorb', 'electrode']);
// Ajuste fino de custo para quem ficou forte demais nos testes automáticos (Aço resiste a quase tudo)
const COST_ADJUST = { magnemite: 1, magneton: 1 };

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function makePokemonCard(p) {
  const s = p.stats;
  const bst = s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
  const attackType = p.types[0] === 'normal' && p.types[1] ? p.types[1] : p.types[0];
  const kamikaze = KAMIKAZE.has(p.id);
  const ranged = !kamikaze && RANGED_TYPES[attackType] !== undefined;
  const air = (p.types.includes('flying') || FLOATING.has(p.id)) && !GROUNDED_BIRDS.has(p.id);
  const building = BUILDING_TARGETERS.has(p.id);
  const count = SWARMS[p.id] || 1;

  // Custo vem do total de stats; a distribuição dos stats decide vida x dano
  const baseCost = clampNum(Math.round((bst - 150) / 62), 1, 9);
  const cost = Math.min(9, baseCost + (count > 1 ? 1 : 0) + (COST_ADJUST[p.id] || 0));
  // Expoente < 1 suaviza os extremos (canhões de vidro como Abra/Gengar e tanques puros)
  const bulk = (((s.hp + (s.def + s.spd) / 2) / bst) * 3) ** 0.7;
  const offense = (((ranged ? s.spa : s.atk) / bst) * 6) ** 0.7;

  let hp = 260 * baseCost * bulk;
  let dps = 30 * baseCost * offense;
  let speed = clampNum(0.55 + s.spe / 110, 0.55, 1.8);
  if (ranged) {
    hp *= 0.85;
    dps *= 0.8;
  }
  if (air) hp *= 0.9;
  if (building) {
    hp *= 2.2;
    speed = Math.max(0.65, speed * 0.8);
  }
  if (count > 1) {
    hp = (hp * 1.6) / count;
    dps = (dps * 1.6) / count;
  }
  const hitSpeed = Math.round(clampNum(1.7 - s.spe / 130, 0.7, 1.6) * 10) / 10;
  let dmg = dps * hitSpeed;
  if (kamikaze) dmg = 110 * cost;

  const card = {
    id: p.id, name: p.name, kind: 'unit', dex: p.dex, cost,
    type: attackType, types: p.types,
    hp: Math.round(hp), dmg: Math.round(dmg), hitSpeed,
    range: ranged ? RANGED_TYPES[attackType] : 1.0,
    speed: Math.round(speed * 100) / 100,
    radius: count > 1 ? 0.38 : clampNum(0.35 + p.height / 40, 0.35, 0.9),
    targets: building ? 'buildings' : ranged || air || kamikaze ? 'all' : 'ground',
    mass: Math.max(1, p.weight / 100),
    legendary: p.legendary,
    stage: p.stage,
  };
  if (air) card.air = true;
  if (count > 1) card.count = count;
  if (kamikaze) {
    card.kamikaze = true;
    card.splash = 2.0;
  } else if (SPLASH_TYPES.has(attackType)) {
    card.splash = 1.0;
  }
  if (p.evolvesTo.length && !p.legendary && !kamikaze) {
    card.evolve = { kills: count > 1 || p.id === 'magikarp' ? 1 : p.stage === 1 ? 2 : 3, into: p.evolvesTo };
  }
  card.desc = describeCard(card);
  return card;
}

function describeCard(c) {
  const parts = [];
  if (c.count) parts.push(`bando de ${c.count}`);
  if (c.air) parts.push('voa');
  if (c.kamikaze) parts.push('explode no primeiro ataque, causando dano em área');
  else if (c.range > 1.5) parts.push('ataca à distância');
  else parts.push('corpo a corpo');
  if (c.targets === 'buildings') parts.push('só ataca ginásios');
  else if (c.targets === 'ground') parts.push('não alcança voadores');
  if (c.splash && !c.kamikaze) parts.push('dano em área');
  if (c.evolve) {
    const names = c.evolve.into.map((id) => POKEDEX.find((p) => p.id === id).name).join(' / ');
    parts.push(`evolui em ${names} após ${c.evolve.kills} ${c.evolve.kills === 1 ? 'abate' : 'abates'}`);
  }
  if (c.legendary) parts.push('lendário');
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

const SPELLS = {
  thunderbolt: {
    id: 'thunderbolt', name: 'Choque do Trovão', kind: 'spell', icon: itemIcon('thunder-stone'), cost: 3,
    type: 'electric', radius: 2.5, dmg: 280, towerMult: 0.35, stun: 0.6, delay: 0.25,
    desc: 'Golpe: raio em área que atordoa por 0,6 s.',
  },
  fireblast: {
    id: 'fireblast', name: 'Explosão de Fogo', kind: 'spell', icon: itemIcon('fire-stone'), cost: 4,
    type: 'fire', radius: 3.0, dmg: 420, towerMult: 0.35, delay: 0.7,
    desc: 'Golpe: grande explosão em área, cai depois de um instante.',
  },
};

// Construções (v0.8): ficam paradas no próprio lado, perdem vida com o tempo (life, em segundos)
// e somem no fim. Quem "só ataca ginásios" também ataca construções — servem para puxar o inimigo.
// arena: a partir de qual arena aparecem nas balls; rarity: raridade fixa.
const BUILDINGS = {
  pokecenter: {
    id: 'pokecenter', name: 'Centro Pokémon', kind: 'building', icon: 'assets/construcoes/pokecenter.png', cost: 4,
    type: 'normal', types: ['normal'], hp: 1000, life: 40, radius: 0.95, mass: 1000,
    heal: 70, healRadius: 3, arena: 0, rarity: 'rare',
    desc: 'Construção: cura 70 de vida por segundo dos seus Pokémon num raio de 3. Dura 40 s.',
  },
  pokemontower: {
    id: 'pokemontower', name: 'Torre Pokémon', kind: 'building', icon: 'assets/construcoes/pokemontower.png', cost: 4,
    type: 'ghost', types: ['ghost'], hp: 1000, life: 35, radius: 0.85, mass: 1000,
    dmg: 110, hitSpeed: 1.1, range: 5.5, targets: 'all', arena: 1, rarity: 'rare',
    desc: 'Construção: a torre assombrada de Lavender atira Bolas Sombrias. Acerta voadores. Dura 35 s.',
  },
  zubatcave: {
    id: 'zubatcave', name: 'Caverna Zubat', kind: 'building', icon: 'assets/construcoes/zubatcave.png', cost: 5,
    type: 'poison', types: ['rock'], hp: 800, life: 40, radius: 1.0, mass: 1000,
    spawn: 'zubat', spawnEvery: 7, arena: 4, rarity: 'epic',
    desc: 'Construção: solta um Zubat a cada 7 s. Dura 40 s.',
  },
  sleepingsnorlax: {
    id: 'sleepingsnorlax', name: 'Snorlax Dormindo', kind: 'building', dex: 143, cost: 3,
    type: 'normal', types: ['normal'], hp: 2800, life: 30, radius: 1.0, mass: 1000,
    arena: 1, rarity: 'rare',
    desc: 'Construção: não ataca. Bloqueia o caminho e atrai os inimigos enquanto dorme. Dura 30 s.',
  },
  mewtwolab: {
    id: 'mewtwolab', name: 'Laboratório do Mewtwo', kind: 'building', icon: 'assets/construcoes/mewtwolab.png', cost: 6,
    type: 'psychic', types: ['psychic'], hp: 1300, life: 40, radius: 1.0, mass: 1000,
    dmg: 160, hitSpeed: 2.0, range: 6, splash: 1.2, targets: 'ground', arena: 9, rarity: 'legendary', legendary: true,
    desc: 'Construção lendária: canhão psíquico com dano em área. Só alvos no chão. Dura 40 s.',
  },
};
BUILDINGS.sleepingsnorlax.icon = `${SPRITE_COLLAB}/portrait/0143/Normal.png`;

const CARDS = {};
for (const p of POKEDEX) CARDS[p.id] = makePokemonCard(p);
Object.assign(CARDS, SPELLS, BUILDINGS);

const DEFAULT_DECK = ['pikachu', 'charmander', 'squirtle', 'bulbasaur', 'onix', 'zubat', 'thunderbolt', 'fireblast'];
const DECK_SIZE = 8;
const DECK_SLOTS = 5; // decks salvos por conta (troca na Coleção)

function isValidDeck(deck) {
  return Array.isArray(deck) && deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE && deck.every((id) => CARDS[id]);
}

function deckAverageCost(deck) {
  return deck.reduce((s, id) => s + CARDS[id].cost, 0) / deck.length;
}

// Deck aleatório jogável: 1–2 golpes, custo médio razoável e defesa contra voadores
function randomDeck(pool = Object.keys(CARDS)) {
  const units = pool.filter((id) => CARDS[id].kind === 'unit');
  const spells = pool.filter((id) => CARDS[id].kind === 'spell');
  const buildings = pool.filter((id) => CARDS[id].kind === 'building');
  for (let attempt = 0; attempt < 500; attempt++) {
    const nSpells = Math.min(spells.length, Math.random() < 0.5 ? 1 : 2);
    const pickSpells = [...spells].sort(() => Math.random() - 0.5).slice(0, nSpells);
    // Às vezes uma construção (no lugar de um Pokémon)
    if (buildings.length && Math.random() < 0.45) pickSpells.push(buildings[Math.floor(Math.random() * buildings.length)]);
    const pool = [...units];
    const pickUnits = [];
    while (pickUnits.length < DECK_SIZE - pickSpells.length) {
      pickUnits.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    const deck = [...pickUnits, ...pickSpells];
    const avg = deckAverageCost(deck);
    const antiAir = pickUnits.filter((id) => CARDS[id].targets === 'all').length;
    const heavy = pickUnits.filter((id) => CARDS[id].cost >= 8).length;
    if (avg >= 2.8 && avg <= 4.6 && antiAir >= 2 && heavy <= 1) return deck;
  }
  return [...DEFAULT_DECK];
}

const dexPad = (dex) => String(dex).padStart(4, '0');

// Arte da carta: retrato do SpriteCollab; sprite da PokéAPI se não houver
function cardImage(card) {
  if (card.kind !== 'unit') return card.icon;
  const sp = SPRITES[card.dex];
  return sp && sp.portrait ? `${SPRITE_COLLAB}/portrait/${dexPad(card.dex)}/Normal.png` : spriteFront(card.dex);
}

function animSheetUrl(dex, anim) {
  return `${SPRITE_COLLAB}/sprite/${dexPad(dex)}/${anim.file}-Anim.png`;
}
