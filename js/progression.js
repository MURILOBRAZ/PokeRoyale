// Regras de progressão (contas, arenas, raridade, níveis, Premier Balls, itens).
// Usado no navegador (interface) e no servidor (api/), que é quem aplica as recompensas.
// Depende de CARDS e POKEDEX (js/pokedex.js + js/data.js).

// A jornada (v0.10): rotas entre os ginásios. Nas rotas se sobe troféus; no fim delas os troféus travam
// no portão do ginásio (trophies do ginásio) até vencer o desafio do Líder em melhor de 3 (ver GDD 22).
// O número da arena do jogador (users.arena) é a etapa mais longe já liberada: ginásio vencido = arena >= ele.
// kind: 'route' ou 'gym'; short: nome curto; mascot: nº do Pokémon símbolo (nos ginásios, o principal do líder)
// types: nos ginásios, os tipos que eles liberam nas balls (pelo primeiro tipo da carta); nas rotas, é
// preenchido abaixo com os tipos dos Pokémon da rota (ROUTE_CARDS)
// river: o que corre no meio do mapa desenhado (água deixa os Pokémon de água nadarem; lava e veneno
// só mudam o brilho que passa por cima no desenho da arena)
const ARENAS = [
  { kind: 'route', name: 'Rota 1', short: 'Rota 1', mascot: 16, trophies: 0, ground: ['#74c255', '#6ab84c'], map: 'rota1', river: 'water' },
  { kind: 'route', name: 'Floresta de Viridian', short: 'Floresta', mascot: 10, trophies: 150, ground: ['#5fa84a', '#56a043'], map: 'florestaviridian', river: 'water' },
  { kind: 'gym', name: 'Ginásio de Pewter', short: 'Pewter', mascot: 95, leader: 'Brock', trophies: 300, badge: 'Insígnia da Rocha', types: ['rock'], ground: ['#b9a77c', '#ab996f'], map: 'pewter', river: null },
  { kind: 'route', name: 'Mt. Moon', short: 'Mt. Moon', mascot: 35, trophies: 300, ground: ['#8d8278', '#82776d'], map: 'mtmoon', river: 'water' },
  { kind: 'route', name: 'Rota 4', short: 'Rota 4', mascot: 39, trophies: 450, ground: ['#74c255', '#6ab84c'], map: 'rota4', river: 'water' },
  { kind: 'gym', name: 'Ginásio de Cerulean', short: 'Cerulean', mascot: 121, leader: 'Misty', trophies: 600, badge: 'Insígnia da Cascata', types: ['water'], ground: ['#7cc3c9', '#6eb5bb'], map: 'cerulean', river: 'water' },
  { kind: 'route', name: 'Ponte Pepita', short: 'Ponte Pepita', mascot: 43, trophies: 600, ground: ['#74c255', '#6ab84c'], map: 'pontepepita', river: 'water' },
  { kind: 'route', name: 'Rota 6', short: 'Rota 6', mascot: 83, trophies: 800, ground: ['#6cbb52', '#62b148'], map: 'rota6', river: 'water' },
  { kind: 'gym', name: 'Ginásio de Vermilion', short: 'Vermilion', mascot: 26, leader: 'Lt. Surge', trophies: 1000, badge: 'Insígnia do Trovão', types: ['electric'], ground: ['#c9c26a', '#bbb45d'], map: 'vermilion', river: null },
  { kind: 'route', name: 'Túnel de Pedra', short: 'Túnel', mascot: 66, trophies: 1000, ground: ['#c9a66b', '#bd9a60'], map: 'tuneldepedra', river: 'water' },
  { kind: 'route', name: 'Rota 8', short: 'Rota 8', mascot: 58, trophies: 1200, ground: ['#74c255', '#6ab84c'], map: 'rota8', river: 'water' },
  { kind: 'gym', name: 'Ginásio de Celadon', short: 'Celadon', mascot: 45, leader: 'Erika', trophies: 1400, badge: 'Insígnia do Arco-íris', types: ['grass'], ground: ['#5fae5a', '#54a04f'], map: 'celadon', river: 'water' },
  { kind: 'route', name: 'Rota 12', short: 'Rota 12', mascot: 143, trophies: 1400, ground: ['#8b8f96', '#80848b'], map: 'rota12', river: 'water' },
  { kind: 'route', name: 'Ciclovia', short: 'Ciclovia', mascot: 84, trophies: 1600, ground: ['#6f747c', '#656a72'], map: 'ciclovia', river: 'water' },
  { kind: 'gym', name: 'Ginásio de Fuchsia', short: 'Fuchsia', mascot: 110, leader: 'Koga', trophies: 1800, badge: 'Insígnia da Alma', types: ['poison'], ground: ['#a98bb5', '#9b7ea7'], map: 'fuchsia', river: 'poison' },
  { kind: 'route', name: 'Rota 5', short: 'Rota 5', mascot: 132, trophies: 1800, ground: ['#74c255', '#6ab84c'], map: 'rota5', river: 'water' },
  { kind: 'route', name: 'Rota 7', short: 'Rota 7', mascot: 123, trophies: 2050, ground: ['#74c255', '#6ab84c'], map: 'rota7', river: 'water' },
  { kind: 'gym', name: 'Ginásio de Saffron', short: 'Saffron', mascot: 65, leader: 'Sabrina', trophies: 2300, badge: 'Insígnia do Pântano', types: ['psychic'], ground: ['#d79bb3', '#c98ea6'], map: 'saffron', river: null },
  { kind: 'route', name: 'Ilhas Seafoam', short: 'Seafoam', mascot: 86, trophies: 2300, ground: ['#e4cf96', '#d8c38a'], map: 'seafoam', river: 'water' },
  { kind: 'route', name: 'Rota 20', short: 'Rota 20', mascot: 116, trophies: 2550, ground: ['#e4cf96', '#d8c38a'], map: 'rota20', river: 'water' },
  { kind: 'gym', name: 'Ginásio de Cinnabar', short: 'Cinnabar', mascot: 59, leader: 'Blaine', trophies: 2800, badge: 'Insígnia do Vulcão', types: ['fire'], ground: ['#cf8f62', '#c18256'], map: 'cinnabar', river: 'lava' },
  { kind: 'route', name: 'Rota 21', short: 'Rota 21', mascot: 131, trophies: 2800, ground: ['#e4cf96', '#d8c38a'], map: 'rota21', river: 'water' },
  { kind: 'route', name: 'Rota 22', short: 'Rota 22', mascot: 56, trophies: 3050, ground: ['#74c255', '#6ab84c'], map: 'rota22', river: 'water' },
  { kind: 'gym', name: 'Ginásio de Viridian', short: 'Viridian', mascot: 112, leader: 'Giovanni', trophies: 3300, badge: 'Insígnia da Terra', types: ['ground'], ground: ['#a8906a', '#9a835e'], map: 'viridian', river: null },
  { kind: 'route', name: 'Estrada da Vitória', short: 'Estrada', mascot: 106, trophies: 3300, ground: ['#c9a66b', '#bd9a60'], map: 'estradavitoria', river: 'water' },
  { kind: 'gym', name: 'Liga Pokémon', short: 'Liga', mascot: 149, leader: 'Elite dos Quatro', trophies: 4000, badge: 'Título de Campeão', types: ['ice', 'fighting', 'ghost', 'dragon'], ground: ['#8a93b8', '#7d86ab'], map: 'liga', river: 'water' },
];
ARENAS.forEach((a, i) => {
  a.id = i;
  a.leader ||= null;
  a.badge ||= null;
});

// Etapa pelo id do mapa (ex.: 'cerulean'): cartas, cosméticos e lendários apontam para a etapa por ele
function arenaIndex(map) {
  const i = ARENAS.findIndex((a) => a.map === map);
  if (i < 0) throw new Error(`Arena desconhecida: ${map}`);
  return i;
}

// Mapa desenhado da arena (assets/arenas, gerado por tools/build-arenas.py)
function arenaMapUrl(arena, mini = false) {
  return arena.map ? `assets/arenas/${arena.map}${mini ? '-mini' : ''}.webp` : null;
}

// Próximo ginásio ainda não vencido por quem chegou à etapa `arena` (null depois da Liga)
function nextGym(arena) {
  return ARENAS.find((a) => a.kind === 'gym' && a.id > arena) || null;
}

// Etapa que os troféus alcançam, sem passar de um ginásio ainda não vencido
function arenaForTrophies(trophies, arena = 0) {
  let a = 0;
  for (const st of ARENAS) {
    if (st.kind === 'gym' && st.id > arena) break;
    if (trophies >= st.trophies) a = st.id;
  }
  return a;
}

// Teto de troféus: o portão do próximo ginásio (Infinity depois da Liga)
function trophyCap(arena) {
  const gym = nextGym(arena);
  return gym ? gym.trophies : Infinity;
}

const STARTER_IDS = ['bulbasaur', 'charmander', 'squirtle'];

// Pokémon que cada rota libera nas balls, de preferência os que aparecem nela no jogo original.
// Os demais vão para o ginásio do seu primeiro tipo (ou ficam na Rota 1: normais, insetos e fadas que sobraram).
const ROUTE_CARDS = {
  florestaviridian: ['caterpie', 'metapod', 'butterfree', 'weedle', 'kakuna', 'beedrill'],
  mtmoon: ['clefairy', 'clefable', 'paras', 'parasect'],
  rota4: ['jigglypuff', 'wigglytuff', 'meowth', 'persian'],
  pontepepita: ['venonat', 'venomoth', 'oddish', 'gloom', 'vileplume'],
  rota6: ['farfetchd', 'bellsprout', 'weepinbell', 'victreebel'],
  tuneldepedra: ['machop', 'machoke', 'machamp', 'cubone', 'marowak'],
  rota8: ['growlithe', 'arcanine', 'eevee'],
  rota12: ['snorlax', 'lickitung'],
  ciclovia: ['doduo', 'dodrio'],
  rota5: ['ditto', 'porygon'],
  rota7: ['scyther', 'pinsir', 'kangaskhan', 'chansey'],
  seafoam: ['seel', 'dewgong', 'shellder', 'cloyster'],
  rota20: ['horsea', 'seadra', 'tentacool', 'tentacruel'],
  rota21: ['tauros', 'lapras'],
  rota22: ['mankey', 'primeape'],
  estradavitoria: ['hitmonlee', 'hitmonchan'],
};
const ROUTE_OF_CARD = {};
for (const [map, ids] of Object.entries(ROUTE_CARDS)) for (const id of ids) ROUTE_OF_CARD[id] = arenaIndex(map);

// Lendários: a partir de qual etapa podem sair (bem raros: só em pilhas de 1 carta, ver rollBallContents)
const LEGENDARY_ARENA = { articuno: 'seafoam', zapdos: 'saffron', moltres: 'cinnabar', mew: 'viridian', mewtwo: 'liga' };

// Etapa em que a carta aparece nas Premier Balls (rota própria, senão pelo primeiro tipo; golpes e construções têm a sua)
function arenaOfCard(card) {
  if (card.arena !== undefined) return arenaIndex(card.arena);
  if (card.kind === 'spell' || STARTER_IDS.includes(card.id)) return 0;
  if (card.legendary) return arenaIndex(LEGENDARY_ARENA[card.id] || 'liga');
  if (ROUTE_OF_CARD[card.id] !== undefined) return ROUTE_OF_CARD[card.id];
  const arena = ARENAS.find((a) => a.kind === 'gym' && a.types.includes(card.types[0]));
  return arena ? arena.id : 0;
}

// Tipos que cada rota mostra: os dos Pokémon que ela libera (a Rota 1 fica com os que sobraram nela)
for (const a of ARENAS) {
  if (a.kind !== 'route') continue;
  const types = new Set();
  for (const c of Object.values(CARDS)) if (c.kind === 'unit' && arenaOfCard(c) === a.id) types.add(c.types[0]);
  a.types = [...types];
}

// Progresso de 0 (Rota 1) a 1 (Liga): força do bot e tamanho das balls acompanham a jornada
const arenaProgress = (arena) => arena / (ARENAS.length - 1);

// ---------- Raridade e níveis ----------

const RARITIES = {
  common: { name: 'Comum', color: '#d9dde8', start: 1, steps: [2, 4, 10, 20, 50, 100, 200, 400, 800] },
  rare: { name: 'Rara', color: '#f5a742', start: 3, steps: [2, 4, 10, 20, 50, 100, 200] },
  epic: { name: 'Épica', color: '#c46ae8', start: 6, steps: [2, 4, 10, 20] },
  legendary: { name: 'Lendária', color: '#5fe0d4', start: 9, steps: [2] },
};
const MAX_CARD_LEVEL = 10;
const UPGRADE_GOLD = { 2: 5, 3: 20, 4: 50, 5: 150, 6: 400, 7: 1000, 8: 2000, 9: 4000, 10: 8000 };
const UPGRADE_XP = { 2: 4, 3: 5, 4: 6, 5: 10, 6: 25, 7: 50, 8: 100, 9: 200, 10: 400 };

function rarityOf(card) {
  if (card.kind === 'spell') return 'rare';
  if (card.kind === 'building') return card.rarity;
  if (card.legendary) return 'legendary';
  const p = POKEDEX.find((x) => x.id === card.id);
  const bst = Object.values(p.stats).reduce((a, b) => a + b, 0);
  if (p.stage === 3 || bst >= 500) return 'epic';
  if (p.stage === 2 || bst >= 400) return 'rare';
  return 'common';
}

function startLevel(card) {
  return RARITIES[rarityOf(card)].start;
}

// Cópias e Pokédólares para ir de `level` a `level + 1` (null = nível máximo)
function upgradeCost(card, level) {
  if (level >= MAX_CARD_LEVEL) return null;
  const r = RARITIES[rarityOf(card)];
  const next = level + 1;
  return { copies: r.steps[level - r.start], gold: UPGRADE_GOLD[next], xp: UPGRADE_XP[next] };
}

// Carta recém-obtida = stats base; no nível máximo, qualquer raridade fica +50%
function levelMultiplier(card, level) {
  if (!level) return 1;
  const start = startLevel(card);
  return 1 + (0.5 * (level - start)) / (MAX_CARD_LEVEL - start);
}

// ---------- Treinador ----------

const TRAINER_XP = [0, 20, 50, 100, 200, 400, 800, 1500, 2500, 4000, 6000, 9000, 13000];
const MAX_TRAINER_LEVEL = TRAINER_XP.length;

function trainerLevel(xp) {
  let lvl = 1;
  for (let i = 0; i < TRAINER_XP.length; i++) if (xp >= TRAINER_XP[i]) lvl = i + 1;
  return lvl;
}

function towerMultiplier(level) {
  return 1 + 0.04 * ((level || 1) - 1);
}

// ---------- Iniciais ----------

const STARTERS = {
  bulbasaur: { name: 'Bulbasaur', deck: ['bulbasaur', 'oddish', 'caterpie', 'pidgey', 'nidoranf', 'geodude', 'ekans', 'thunderbolt'], hint: 'Barato e rápido, muita pressão' },
  charmander: { name: 'Charmander', deck: ['charmander', 'growlithe', 'spearow', 'rattata', 'mankey', 'sandshrew', 'zubat', 'thunderbolt'], hint: 'Agressivo, cheio de bandos' },
  squirtle: { name: 'Squirtle', deck: ['squirtle', 'poliwag', 'psyduck', 'pidgey', 'weedle', 'diglett', 'nidoranm', 'fireblast'], hint: 'Equilibrado, bom de defesa' },
};

// ---------- Troféus ----------

const TROPHIES = {
  bot: { win: 25, loss: -10, draw: 0 },
  online: { win: 30, loss: -20, draw: 0 },
};
const WIN_STREAK_BONUS = 1; // troféus extras na vitória por vitória seguida antes dela (derrota ou empate zera a sequência)
// Desafio de ginásio: as partidas não mexem nos troféus; perder a melhor de 3 tira GYM_LOSS (2 desafios perdidos
// devolvem o jogador para dentro da rota)
const GYM_LOSS = -15;
const MATCH_MIN_SECONDS = 30; // partidas mais curtas que isso não valem recompensa
const MATCHES_PER_HOUR = 40;

// ---------- Premier Balls ----------

const BALL_SLOTS = 4;
const FREE_BALL_SECONDS = 4 * 3600;
const FREE_BALL_MAX = 2;

const BALLS = {
  premier: { name: 'Premier Ball', icon: 'premier-ball', chance: 0.7, seconds: 15 * 60, cards: 4, gold: [20, 40], weights: { common: 80, rare: 18, epic: 2, legendary: 0 } },
  great: { name: 'Great Ball', icon: 'great-ball', chance: 0.22, seconds: 3600, cards: 10, gold: [60, 100], weights: { common: 70, rare: 25, epic: 5, legendary: 0 }, guaranteed: ['rare'] },
  ultra: { name: 'Ultra Ball', icon: 'ultra-ball', chance: 0.07, seconds: 3 * 3600, cards: 25, gold: [150, 250], weights: { common: 55, rare: 33, epic: 12, legendary: 0.6 }, guaranteed: ['epic'], itemChance: 0.3 },
  master: { name: 'Master Ball', icon: 'master-ball', chance: 0.01, seconds: 8 * 3600, cards: 40, gold: [400, 600], weights: { common: 45, rare: 35, epic: 18, legendary: 2 }, guaranteed: ['legendary'], itemChance: 1 },
  poke: { name: 'Poké Ball', icon: 'poke-ball', chance: 0, seconds: 0, cards: 2, gold: [10, 20], weights: { common: 85, rare: 15, epic: 0, legendary: 0 } },
};

const ITEMS = {
  firestone: { name: 'Pedra do Fogo', icon: 'fire-stone', types: ['fire'] },
  waterstone: { name: 'Pedra da Água', icon: 'water-stone', types: ['water', 'ice'] },
  thunderstone: { name: 'Pedra do Trovão', icon: 'thunder-stone', types: ['electric'] },
  leafstone: { name: 'Pedra da Folha', icon: 'leaf-stone', types: ['grass', 'bug'] },
  moonstone: { name: 'Pedra da Lua', icon: 'moon-stone', types: ['fairy', 'normal', 'psychic', 'ghost', 'poison'] },
  rarecandy: { name: 'Doce Raro', icon: 'rare-candy' },
};

// Pedra serve como cópia curinga de cartas de um dos seus tipos
function itemFitsCard(itemId, card) {
  const item = ITEMS[itemId];
  if (!item || card.kind !== 'unit') return false;
  if (itemId === 'rarecandy') return true;
  return card.types.some((t) => item.types.includes(t));
}

function rollBallTier(rand = Math.random) {
  let r = rand();
  for (const tier of ['master', 'ultra', 'great', 'premier']) {
    r -= BALLS[tier].chance;
    if (r < 0) return tier;
  }
  return 'premier';
}

function cardPool(arena) {
  return Object.values(CARDS).filter((c) => arenaOfCard(c) <= arena);
}

// Sorteia o conteúdo de uma ball: { cards: {id: qtd}, gold, items: {id: qtd} }
function rollBallContents(tier, arena, rand = Math.random) {
  const ball = BALLS[tier];
  const pool = cardPool(arena);
  const byRarity = {};
  for (const c of pool) (byRarity[rarityOf(c)] ||= []).push(c.id);
  const pickOf = (rarity) => {
    // Raridade sem cartas liberadas ainda: cai para a de baixo
    const order = ['legendary', 'epic', 'rare', 'common'];
    for (let i = order.indexOf(rarity); i < order.length; i++) {
      const list = byRarity[order[i]];
      if (list && list.length) return list[Math.floor(rand() * list.length)];
    }
    return null;
  };
  const weighted = () => {
    const w = ball.weights;
    let r = rand() * (w.common + w.rare + w.epic + w.legendary);
    for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
      r -= w[rarity];
      if (r < 0) return rarity;
    }
    return 'common';
  };

  const total = Math.round(ball.cards * (1 + 0.9 * arenaProgress(arena)));
  const cards = {};
  const add = (id) => id && (cards[id] = (cards[id] || 0) + 1);
  for (const rarity of ball.guaranteed || []) {
    if (rarity === 'legendary' && !byRarity.legendary) {
      add(pickOf('epic'));
      add(pickOf('epic'));
    } else {
      add(pickOf(rarity));
    }
  }
  // Cartas vêm em poucas pilhas (como no Clash Royale), não 40 cartas diferentes
  const stacks = Math.min(total, Math.max(2, Math.round(Math.sqrt(total) + 1)));
  const stackIds = [];
  for (let i = 0; i < stacks; i++) stackIds.push(pickOf(weighted()));
  let remaining = total - Object.values(cards).reduce((a, b) => a + b, 0);
  for (let i = 0; i < stackIds.length && remaining > 0; i++) {
    const share = i === stackIds.length - 1 ? remaining : Math.max(1, Math.round(remaining * (0.3 + rand() * 0.3)));
    // Lendário vem sempre sozinho (1 cópia): o resto da pilha vira outra carta
    const legendary = stackIds[i] && CARDS[stackIds[i]].legendary;
    const n = legendary ? 1 : Math.min(remaining, share);
    if (stackIds[i]) cards[stackIds[i]] = (cards[stackIds[i]] || 0) + n;
    remaining -= n;
  }
  // Sobrou carta (lendário na última pilha vem só com 1): completa com uma comum
  if (remaining > 0) {
    const id = pickOf('common');
    if (id) cards[id] = (cards[id] || 0) + remaining;
  }

  const [gMin, gMax] = ball.gold;
  const gold = Math.round((gMin + rand() * (gMax - gMin)) * (1 + 0.9 * arenaProgress(arena)));
  const items = {};
  if (ball.itemChance && rand() < ball.itemChance) {
    const stones = Object.keys(ITEMS).filter((k) => k !== 'rarecandy');
    const it = stones[Math.floor(rand() * stones.length)];
    items[it] = 1;
  }
  if (tier === 'master' && rand() < 0.3) items.rarecandy = (items.rarecandy || 0) + 1;
  if (tier === 'great' && rand() < 0.05) {
    const stones = Object.keys(ITEMS).filter((k) => k !== 'rarecandy');
    items[stones[Math.floor(rand() * stones.length)]] = 1;
  }
  return { cards, gold, items };
}

// ---------- Bot por arena ----------

// Deck aleatório com cartas liberadas na arena e níveis que acompanham a progressão
function botProfile(arena) {
  const pool = cardPool(arena).map((c) => c.id);
  const deck = randomDeck(pool);
  const frac = arenaProgress(arena);
  const levels = {};
  for (const id of deck) {
    const start = startLevel(CARDS[id]);
    levels[id] = Math.min(MAX_CARD_LEVEL, start + Math.round(frac * (MAX_CARD_LEVEL - start)));
  }
  const trainer = 1 + Math.round(frac * (MAX_TRAINER_LEVEL - 1));
  const difficulty = arena < arenaIndex('pewter') ? 'easy' : arena >= arenaIndex('saffron') ? 'hard' : 'normal';
  return { deck, levels, trainer, difficulty };
}

// Líder do ginásio (desafio em melhor de 3): deck só do tipo do ginásio, com o Pokémon símbolo,
// e cartas um nível acima das do bot da última rota antes dele
function leaderProfile(gymId, rand = Math.random) {
  const gym = ARENAS[gymId];
  const mascot = POKEDEX[gym.mascot - 1].id;
  const fits = (c) => !c.legendary && (c.kind === 'unit' ? c.types.some((t) => gym.types.includes(t)) : c.kind === 'spell' && gym.types.includes(c.type));
  const pool = Object.values(CARDS).filter((c) => fits(c) && c.id !== mascot).map((c) => c.id);
  const deck = [mascot];
  while (deck.length < DECK_SIZE && pool.length) deck.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const frac = arenaProgress(gymId);
  const levels = {};
  for (const id of deck) {
    const start = startLevel(CARDS[id]);
    levels[id] = Math.min(MAX_CARD_LEVEL, start + 1 + Math.round(frac * (MAX_CARD_LEVEL - start)));
  }
  const trainer = Math.min(MAX_TRAINER_LEVEL, 2 + Math.round(frac * (MAX_TRAINER_LEVEL - 1)));
  const difficulty = gymId <= arenaIndex('vermilion') ? 'normal' : 'hard';
  return { deck, levels, trainer, difficulty, leader: gym.leader };
}

const TRAINER_NAME_RE = /^[\p{L}\p{N} _.-]{3,16}$/u;

// ---------- Presentes de versão ----------
// Cada conta recebe uma vez (ao entrar no jogo depois da atualização). O servidor guarda quais já recebeu.

const GIFTS = {
  'v08-construcao': {
    title: 'Presente da v0.8',
    text: 'Chegaram as construções! Você ganhou uma:',
    // Uma construção aleatória (menos a lendária), mesmo que ainda não tenha chegado na arena dela
    roll: (rand = Math.random) => {
      const pool = Object.values(CARDS).filter((c) => c.kind === 'building' && !c.legendary).map((c) => c.id);
      return { cards: { [pool[Math.floor(rand() * pool.length)]]: 1 }, gold: 0, items: {} };
    },
  },
};

// ---------- PokéMart (loja) e Fichas do Game Corner ----------
// Tudo com Pokédólares (ganhos jogando) ou Fichas (só por conquistas). Sem dinheiro de verdade.
// As ofertas são geradas pelo servidor uma vez por dia (horário de Brasília) e guardadas.

const FICHAS = { routeUp: 30, badge: 100, levelUp: 20, firstWin: 10 };

const SHOP = {
  tzHours: -3, // as ofertas trocam à meia-noite de Brasília
  cardBase: { common: 10, rare: 100, epic: 1000 }, // preço da 1ª cópia; a n-ésima custa base × n
  cardLimit: { common: 10, rare: 5, epic: 2 },
  giftAmount: 5,
  epicChance: 0.25,
  fixed: {
    great: { kind: 'ball', tier: 'great', gold: 250, limit: 1 },
    stone: { kind: 'item', gold: 300, limit: 1 },
    ultra: { kind: 'ball', tier: 'ultra', fichas: 60, limit: 1, weekly: true },
    candy: { kind: 'item', item: 'rarecandy', fichas: 80, limit: 1, weekly: true },
  },
};

function shopDayKey(ms = Date.now()) {
  return Math.floor((ms + SHOP.tzHours * 3600e3) / 86400e3);
}

// Semana começando na segunda-feira (o dia 0 de 1970 foi uma quinta)
function shopWeekRange(day) {
  const start = day - ((day + 3) % 7);
  return [start, start + 6];
}

function shopNextRefresh(day) {
  return (day + 1) * 86400e3 - SHOP.tzHours * 3600e3;
}

// Preço da próxima compra de uma oferta (cartas ficam mais caras a cada cópia comprada no dia)
function shopPrice(offer, boughtToday) {
  if (offer.free) return { gold: 0, fichas: 0 };
  if (offer.kind === 'card') return { gold: offer.base * (boughtToday + 1), fichas: 0 };
  return { gold: offer.gold || 0, fichas: offer.fichas || 0 };
}

function generateShopOffers(ownedIds, arena, rand = Math.random) {
  const usable = (id) => CARDS[id] && !CARDS[id].legendary;
  const owned = ownedIds.filter(usable);
  const pool = cardPool(arena).map((c) => c.id).filter(usable);
  const used = new Set();
  // Prefere cartas que você já tem (servem para melhorar); sem opção, qualquer uma liberada
  const pick = (rarity) => {
    for (const list of [owned, pool]) {
      const options = list.filter((id) => rarityOf(CARDS[id]) === rarity && !used.has(id));
      if (options.length) {
        const id = options[Math.floor(rand() * options.length)];
        used.add(id);
        return id;
      }
    }
    return null;
  };
  const cardOffer = (id, rarity, extra = {}) => ({
    id: `c${used.size}`, kind: 'card', card: id, amount: 1,
    base: SHOP.cardBase[rarity], limit: SHOP.cardLimit[rarity], ...extra,
  });
  const offers = [];
  const gift = pick('common');
  if (gift) offers.push({ id: 'gift', kind: 'card', card: gift, amount: SHOP.giftAmount, free: true, limit: 1 });
  for (const rarity of ['common', 'common', 'common', 'rare', rand() < SHOP.epicChance ? 'epic' : 'rare']) {
    const id = pick(rarity) || pick('rare') || pick('common');
    if (id) offers.push(cardOffer(id, rarityOf(CARDS[id])));
  }
  const stones = Object.keys(ITEMS).filter((k) => k !== 'rarecandy');
  offers.push({ id: 'great', ...SHOP.fixed.great });
  offers.push({ id: 'stone', ...SHOP.fixed.stone, item: stones[Math.floor(rand() * stones.length)] });
  offers.push({ id: 'ultra', ...SHOP.fixed.ultra });
  offers.push({ id: 'candy', ...SHOP.fixed.candy });
  return offers;
}


// ---------- Cosméticos (v0.6): não mudam nenhum atributo ----------
// id no formato "tipo:nome". Grátis (free), conquistados por arena (arena) ou comprados (fichas).

const EMOTE_MOODS = [
  { id: 'Happy', name: 'Feliz' },
  { id: 'Angry', name: 'Bravo' },
  { id: 'Crying', name: 'Chorando' },
  { id: 'Surprised', name: 'Surpreso' },
];

const COSMETICS = {
  // Títulos no ranking
  'title:novato': { kind: 'title', name: 'Treinador Novato', free: true },
  'title:rochas': { kind: 'title', name: 'Quebra-Rochas', arena: arenaIndex('pewter') },
  'title:surfista': { kind: 'title', name: 'Surfista de Cerulean', arena: arenaIndex('cerulean') },
  'title:raio': { kind: 'title', name: 'Raio de Vermilion', arena: arenaIndex('vermilion') },
  'title:jardineiro': { kind: 'title', name: 'Jardineiro de Celadon', arena: arenaIndex('celadon') },
  'title:ninja': { kind: 'title', name: 'Ninja de Fuchsia', arena: arenaIndex('fuchsia') },
  'title:mente': { kind: 'title', name: 'Mente de Saffron', arena: arenaIndex('saffron') },
  'title:chama': { kind: 'title', name: 'Chama de Cinnabar', arena: arenaIndex('cinnabar') },
  'title:terremoto': { kind: 'title', name: 'Terremoto de Viridian', arena: arenaIndex('viridian') },
  'title:mestre': { kind: 'title', name: 'Mestre Pokémon', arena: arenaIndex('liga') },
  'title:inseto': { kind: 'title', name: 'Caçador de Insetos', fichas: 30 },
  'title:montanhista': { kind: 'title', name: 'Montanhista', fichas: 30 },
  'title:nadador': { kind: 'title', name: 'Nadador', fichas: 30 },
  'title:pescador': { kind: 'title', name: 'Pescador', fichas: 30 },
  'title:cientista': { kind: 'title', name: 'Cientista', fichas: 50 },
  'title:medium': { kind: 'title', name: 'Médium', fichas: 50 },
  'title:faixapreta': { kind: 'title', name: 'Faixa-Preta', fichas: 50 },
  'title:rocket': { kind: 'title', name: 'Recruta da Equipe Rocket', fichas: 100 },
  'title:carvalho': { kind: 'title', name: 'Assistente do Prof. Carvalho', fichas: 150 },
  // Visual dos seus ginásios na partida (as cores de time continuam azul/vermelho)
  'skin:classico': { kind: 'skin', name: 'Clássico', free: true },
  'skin:dourado': { kind: 'skin', name: 'Dourado', fichas: 120, filter: 'sepia(0.3) saturate(1.7) brightness(1.12)', glow: '#ffd84a' },
  'skin:cristal': { kind: 'skin', name: 'Cristal', fichas: 120, filter: 'saturate(1.4) brightness(1.18)', glow: '#9fe8ff', sparkle: true },
  'skin:sombrio': { kind: 'skin', name: 'Sombrio', fichas: 120, filter: 'brightness(0.72) saturate(1.25) contrast(1.1)', glow: '#b46bff' },
  'skin:campeao': { kind: 'skin', name: 'Campeão', arena: arenaIndex('liga'), filter: 'saturate(1.35) brightness(1.08)', glow: '#fff3b0', sparkle: true },
  // Pacotes de emotes (4 reações com os retratos do Pokémon)
  'emotes:pikachu': { kind: 'emotes', name: 'Pikachu', dex: 25, free: true },
  'emotes:charmander': { kind: 'emotes', name: 'Charmander', dex: 4, fichas: 40 },
  'emotes:squirtle': { kind: 'emotes', name: 'Squirtle', dex: 7, fichas: 40 },
  'emotes:bulbasaur': { kind: 'emotes', name: 'Bulbasaur', dex: 1, fichas: 40 },
  'emotes:psyduck': { kind: 'emotes', name: 'Psyduck', dex: 54, fichas: 60 },
  'emotes:meowth': { kind: 'emotes', name: 'Meowth', dex: 52, fichas: 60 },
  'emotes:jigglypuff': { kind: 'emotes', name: 'Jigglypuff', dex: 39, fichas: 60 },
  'emotes:eevee': { kind: 'emotes', name: 'Eevee', dex: 133, fichas: 60 },
  'emotes:snorlax': { kind: 'emotes', name: 'Snorlax', dex: 143, fichas: 80 },
  'emotes:mewtwo': { kind: 'emotes', name: 'Mewtwo', dex: 150, fichas: 150 },
};

const DEFAULT_LOOK = { title: 'title:novato', skin: 'skin:classico', emotes: 'emotes:pikachu' };

// Tem o cosmético? (grátis, conquistado pela arena ou comprado)
function hasCosmetic(id, arena, owned) {
  const c = COSMETICS[id];
  if (!c) return false;
  if (c.free) return true;
  if (c.arena !== undefined) return arena >= c.arena;
  return owned.includes(id);
}

function emotePortraitUrl(packId, mood) {
  const pack = COSMETICS[packId] || COSMETICS['emotes:pikachu'];
  return `${SPRITE_COLLAB}/portrait/${String(pack.dex).padStart(4, '0')}/${mood}.png`;
}

// ---------- Zona Safári ----------
// Entrada paga 1x por dia. Até 3 Pokémon selvagens das suas arenas e 6 Safari Balls.
// Isca: fica comendo (pega menos, foge menos). Pedra: fica bravo (pega mais, foge mais). Tudo sorteado no servidor.

const SAFARI = {
  entryGold: 100,
  balls: 6,
  encounters: 3,
  weights: { common: 65, rare: 28, epic: 7 },
  catchChance: { common: 0.45, rare: 0.3, epic: 0.18 },
  fleeChance: { common: 0.1, rare: 0.18, epic: 0.28 },
  angry: { catch: 1.6, flee: 2 },
  eating: { catch: 0.6, flee: 0.35 },
  copies: { common: 3, rare: 2, epic: 1 },
};

function safariWild(arena, rand = Math.random) {
  const pool = cardPool(arena).filter((c) => c.kind === 'unit' && !c.legendary);
  const w = SAFARI.weights;
  let r = rand() * (w.common + w.rare + w.epic);
  let rarity = 'common';
  for (const k of ['common', 'rare', 'epic']) {
    r -= w[k];
    if (r < 0) {
      rarity = k;
      break;
    }
  }
  const list = pool.filter((c) => rarityOf(c) === rarity);
  const from = list.length ? list : pool;
  return from[Math.floor(rand() * from.length)].id;
}

function newSafariRun(arena, rand = Math.random) {
  const card = safariWild(arena, rand);
  return {
    balls: SAFARI.balls, encounter: 1, wild: { card, angry: 0, eating: 0 },
    caught: [], log: [`Um ${CARDS[card].name} selvagem apareceu!`], done: false,
  };
}

// Aplica uma ação e devolve o novo estado (e o que foi capturado agora, se for o caso)
function safariStep(state, action, arena, rand = Math.random) {
  const s = JSON.parse(JSON.stringify(state));
  if (s.done) return { state: s };
  const card = CARDS[s.wild.card];
  const rarity = rarityOf(card);
  const mod = (k) => (s.wild.angry ? SAFARI.angry[k] : s.wild.eating ? SAFARI.eating[k] : 1);
  let caught = null;
  let next = false;
  if (action === 'ball') {
    s.balls--;
    if (rand() < Math.min(0.95, SAFARI.catchChance[rarity] * mod('catch'))) {
      caught = { card: card.id, copies: SAFARI.copies[rarity] };
      s.caught.push(caught);
      s.log.push(`Pegou ${card.name}! +${caught.copies} ${caught.copies > 1 ? 'cópias' : 'cópia'}.`);
      next = true;
    } else {
      s.log.push(`${card.name} escapou da Safari Ball!`);
    }
  } else if (action === 'bait') {
    s.wild.eating = 1 + Math.floor(rand() * 3);
    s.wild.angry = 0;
    s.log.push(`${card.name} está comendo a isca.`);
  } else if (action === 'rock') {
    s.wild.angry = 1 + Math.floor(rand() * 3);
    s.wild.eating = 0;
    s.log.push(`${card.name} ficou bravo!`);
  } else if (action === 'run') {
    s.log.push('Você saiu de perto.');
    next = true;
  } else {
    return { state: s, invalid: true };
  }
  // Depois da sua ação, o Pokémon pode fugir
  if (!next && rand() < Math.min(0.9, SAFARI.fleeChance[rarity] * mod('flee'))) {
    s.log.push(`${card.name} fugiu!`);
    next = true;
  } else if (!next) {
    if (s.wild.angry) s.wild.angry--;
    if (s.wild.eating) s.wild.eating--;
  }
  if (next) {
    if (s.balls <= 0 || s.encounter >= SAFARI.encounters) {
      s.done = true;
    } else {
      s.encounter++;
      s.wild = { card: safariWild(arena, rand), angry: 0, eating: 0 };
      s.log.push(`Um ${CARDS[s.wild.card].name} selvagem apareceu!`);
    }
  } else if (s.balls <= 0) {
    s.log.push('Acabaram as Safari Balls.');
    s.done = true;
  }
  s.log = s.log.slice(-6);
  return { state: s, caught };
}
