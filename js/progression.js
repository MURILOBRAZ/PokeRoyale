// Regras de progressão (contas, arenas, raridade, níveis, Premier Balls, itens).
// Usado no navegador (interface) e no servidor (api/), que é quem aplica as recompensas.
// Depende de CARDS e POKEDEX (js/pokedex.js + js/data.js).

// short: nome curto; mascot: nº do Pokémon símbolo da arena (o principal do líder)
const ARENAS = [
  { id: 0, name: 'Rota 1', short: 'Rota 1', mascot: 16, leader: null, trophies: 0, badge: null, types: ['normal', 'bug', 'flying', 'fairy'], ground: ['#74c255', '#6ab84c'], map: 'rota1' },
  { id: 1, name: 'Ginásio de Pewter', short: 'Pewter', mascot: 95, leader: 'Brock', trophies: 300, badge: 'Insígnia da Rocha', types: ['rock'], ground: ['#b9a77c', '#ab996f'], map: 'pewter' },
  { id: 2, name: 'Ginásio de Cerulean', short: 'Cerulean', mascot: 121, leader: 'Misty', trophies: 600, badge: 'Insígnia da Cascata', types: ['water'], ground: ['#7cc3c9', '#6eb5bb'], map: 'cerulean' },
  { id: 3, name: 'Ginásio de Vermilion', short: 'Vermilion', mascot: 26, leader: 'Lt. Surge', trophies: 1000, badge: 'Insígnia do Trovão', types: ['electric'], ground: ['#c9c26a', '#bbb45d'], map: 'vermilion' },
  { id: 4, name: 'Ginásio de Celadon', short: 'Celadon', mascot: 45, leader: 'Erika', trophies: 1400, badge: 'Insígnia do Arco-íris', types: ['grass'], ground: ['#5fae5a', '#54a04f'], map: 'celadon' },
  { id: 5, name: 'Ginásio de Fuchsia', short: 'Fuchsia', mascot: 110, leader: 'Koga', trophies: 1800, badge: 'Insígnia da Alma', types: ['poison'], ground: ['#a98bb5', '#9b7ea7'], map: 'fuchsia' },
  { id: 6, name: 'Ginásio de Saffron', short: 'Saffron', mascot: 65, leader: 'Sabrina', trophies: 2300, badge: 'Insígnia do Pântano', types: ['psychic'], ground: ['#d79bb3', '#c98ea6'], map: 'saffron' },
  { id: 7, name: 'Ginásio de Cinnabar', short: 'Cinnabar', mascot: 59, leader: 'Blaine', trophies: 2800, badge: 'Insígnia do Vulcão', types: ['fire'], ground: ['#cf8f62', '#c18256'], map: 'cinnabar' },
  { id: 8, name: 'Ginásio de Viridian', short: 'Viridian', mascot: 112, leader: 'Giovanni', trophies: 3300, badge: 'Insígnia da Terra', types: ['ground'], ground: ['#a8906a', '#9a835e'], map: 'viridian' },
  { id: 9, name: 'Liga Pokémon', short: 'Liga', mascot: 149, leader: 'Elite dos Quatro', trophies: 4000, badge: null, types: ['ice', 'fighting', 'ghost', 'dragon'], ground: ['#8a93b8', '#7d86ab'], map: 'liga' },
];

// Mapa desenhado da arena (assets/arenas, gerado por tools/build-arenas.py)
function arenaMapUrl(arena, mini = false) {
  return arena.map ? `assets/arenas/${arena.map}${mini ? '-mini' : ''}.webp` : null;
}

function arenaForTrophies(trophies) {
  let a = 0;
  for (const arena of ARENAS) if (trophies >= arena.trophies) a = arena.id;
  return a;
}

const STARTER_IDS = ['bulbasaur', 'charmander', 'squirtle'];

// Arena em que a carta aparece nas Premier Balls (pelo primeiro tipo; lendários na Liga)
function arenaOfCard(card) {
  if (card.kind === 'spell' || STARTER_IDS.includes(card.id)) return 0;
  if (card.legendary) return 9;
  const arena = ARENAS.find((a) => a.types.includes(card.types[0]));
  return arena ? arena.id : 0;
}

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
  bot: { win: 20, loss: -10, draw: 0 },
  online: { win: 30, loss: -20, draw: 0 },
};
const MATCH_MIN_SECONDS = 30; // partidas mais curtas que isso não valem recompensa
const MATCHES_PER_HOUR = 40;

// ---------- Premier Balls ----------

const BALL_SLOTS = 4;
const FREE_BALL_SECONDS = 4 * 3600;
const FREE_BALL_MAX = 2;

const BALLS = {
  premier: { name: 'Premier Ball', icon: 'premier-ball', chance: 0.7, seconds: 15 * 60, cards: 4, gold: [20, 40], weights: { common: 80, rare: 18, epic: 2, legendary: 0 } },
  great: { name: 'Great Ball', icon: 'great-ball', chance: 0.22, seconds: 3600, cards: 10, gold: [60, 100], weights: { common: 70, rare: 25, epic: 5, legendary: 0 }, guaranteed: ['rare'] },
  ultra: { name: 'Ultra Ball', icon: 'ultra-ball', chance: 0.07, seconds: 3 * 3600, cards: 25, gold: [150, 250], weights: { common: 55, rare: 33, epic: 12, legendary: 0 }, guaranteed: ['epic'], itemChance: 0.3 },
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

  const total = Math.round(ball.cards * (1 + 0.1 * arena));
  const cards = {};
  const add = (id) => id && (cards[id] = (cards[id] || 0) + 1);
  for (const rarity of ball.guaranteed || []) {
    if (rarity === 'legendary' && arena < 9) {
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
    const n = Math.min(remaining, share);
    if (stackIds[i]) cards[stackIds[i]] = (cards[stackIds[i]] || 0) + n;
    remaining -= n;
  }

  const [gMin, gMax] = ball.gold;
  const gold = Math.round((gMin + rand() * (gMax - gMin)) * (1 + 0.1 * arena));
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
  const frac = arena / (ARENAS.length - 1);
  const levels = {};
  for (const id of deck) {
    const start = startLevel(CARDS[id]);
    levels[id] = Math.min(MAX_CARD_LEVEL, start + Math.round(frac * (MAX_CARD_LEVEL - start)));
  }
  const trainer = 1 + Math.round(frac * (MAX_TRAINER_LEVEL - 1));
  const difficulty = arena === 0 ? 'easy' : arena >= 6 ? 'hard' : 'normal';
  return { deck, levels, trainer, difficulty };
}

const TRAINER_NAME_RE = /^[\p{L}\p{N} _.-]{3,16}$/u;

// ---------- PokéMart (loja) e Fichas do Game Corner ----------
// Tudo com Pokédólares (ganhos jogando) ou Fichas (só por conquistas). Sem dinheiro de verdade.
// As ofertas são geradas pelo servidor uma vez por dia (horário de Brasília) e guardadas.

const FICHAS = { arenaUp: 100, levelUp: 20, firstWin: 10 };

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
