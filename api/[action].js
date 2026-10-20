// API do PokéRoyale: uma função da Vercel atende /api/<ação>.
// O servidor é a fonte da verdade para conta, coleção, troféus, Premier Balls e itens;
// o conteúdo das balls é sorteado aqui, nunca no navegador.

const crypto = require('crypto');
const { q, one } = require('./_lib/db');
const auth = require('./_lib/auth');
const R = require('./_lib/rules');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_TAKEN = 'Esse nome de treinador já está em uso. Escolha outro.';
const isUniqueViolation = (err) => err && err.code === '23505';

async function nameTaken(name, exceptUserId = 0) {
  return !!(await one('SELECT 1 FROM users WHERE lower(name) = lower($1) AND id <> $2', [name, exceptUserId]));
}

// ---------- Estado do jogador ----------

function freeBallInfo(readyAt, now) {
  const ready = new Date(readyAt).getTime();
  const t = new Date(now).getTime();
  if (t < ready) return { available: 0, nextAt: new Date(ready).toISOString() };
  const available = Math.min(R.FREE_BALL_MAX, 1 + Math.floor((t - ready) / (R.FREE_BALL_SECONDS * 1000)));
  const nextAt = available >= R.FREE_BALL_MAX ? null : new Date(ready + available * R.FREE_BALL_SECONDS * 1000).toISOString();
  return { available, nextAt };
}

// Decks salvos, sempre com DECK_SLOTS posições (contas antigas: o deck atual fica no espaço 1)
function decksOf(u) {
  const list = Array.isArray(u.decks) ? u.decks : [u.deck];
  return Array.from({ length: R.DECK_SLOTS }, (_, i) => (R.isValidDeck(list[i]) ? list[i] : null));
}

async function loadState(userId) {
  const u = await one('SELECT *, now() AS server_now FROM users WHERE id = $1', [userId]);
  if (!u) fail(401, 'Sessão inválida. Entre de novo.');
  const [collection, items, balls, cosmetics] = await Promise.all([
    q('SELECT card_id, level, copies FROM collection WHERE user_id = $1', [userId]),
    q('SELECT item, qty FROM user_items WHERE user_id = $1 AND qty > 0', [userId]),
    q('SELECT id, tier, arena, unlock_at FROM balls WHERE user_id = $1 ORDER BY id', [userId]),
    q('SELECT cosmetic FROM user_cosmetics WHERE user_id = $1', [userId]),
  ]);
  const now = new Date(u.server_now).getTime();
  return {
    serverNow: new Date(u.server_now).toISOString(),
    user: {
      name: u.name,
      email: u.email,
      starter: u.starter,
      trophies: u.trophies,
      bestTrophies: u.best_trophies,
      arena: u.arena,
      xp: u.xp,
      level: R.trainerLevel(u.xp),
      gold: u.gold,
      fichas: u.fichas,
      deck: u.deck,
      decks: decksOf(u),
      // Presente esperando (só depois de escolher o inicial)
      pendingGift: u.starter ? Object.keys(R.GIFTS).find((g) => !(u.gifts || []).includes(g)) || null : null,
      deckIndex: u.deck_index,
      look: lookOf(u),
      freeBall: freeBallInfo(u.free_ball_at, u.server_now),
    },
    collection: Object.fromEntries(collection.map((c) => [c.card_id, { level: c.level, copies: c.copies }])),
    cosmetics: cosmetics.map((c) => c.cosmetic),
    items: Object.fromEntries(items.map((i) => [i.item, i.qty])),
    balls: balls.map((b) => {
      const at = b.unlock_at ? new Date(b.unlock_at).getTime() : null;
      return {
        id: b.id, tier: b.tier, arena: b.arena,
        status: at === null ? 'locked' : at <= now ? 'ready' : 'unlocking',
        unlockAt: at === null ? null : new Date(at).toISOString(),
      };
    }),
  };
}

// Visual equipado, com os padrões (avatar = o inicial)
function lookOf(u) {
  const look = { ...R.DEFAULT_LOOK, avatar: u.starter, ...(u.look || {}) };
  return look;
}

async function requireUser(req) {
  const id = await auth.currentUserId(req);
  if (!id) fail(401, 'Entre na sua conta para continuar.');
  return id;
}

// Adiciona cartas, Pokédólares e itens; devolve quais cartas são novas
async function applyRewards(userId, contents) {
  const ids = Object.keys(contents.cards);
  const owned = ids.length
    ? (await q('SELECT card_id FROM collection WHERE user_id = $1 AND card_id = ANY($2)', [userId, ids])).map((r) => r.card_id)
    : [];
  if (ids.length) {
    const rows = ids.map((id) => ({ id, lvl: R.startLevel(R.CARDS[id]), n: contents.cards[id] }));
    // Carta nova: a 1ª cópia libera a carta, as demais contam para o próximo nível
    await q(
      `INSERT INTO collection (user_id, card_id, level, copies)
       SELECT $1, x.id, x.lvl, x.n - 1 FROM jsonb_to_recordset($2::jsonb) AS x(id text, lvl int, n int)
       ON CONFLICT (user_id, card_id) DO UPDATE SET copies = collection.copies + EXCLUDED.copies + 1`,
      [userId, JSON.stringify(rows)],
    );
  }
  if (contents.gold) await q('UPDATE users SET gold = gold + $2 WHERE id = $1', [userId, contents.gold]);
  const items = Object.entries(contents.items || {}).map(([item, n]) => ({ item, n }));
  if (items.length) {
    await q(
      `INSERT INTO user_items (user_id, item, qty)
       SELECT $1, x.item, x.n FROM jsonb_to_recordset($2::jsonb) AS x(item text, n int)
       ON CONFLICT (user_id, item) DO UPDATE SET qty = user_items.qty + EXCLUDED.qty`,
      [userId, JSON.stringify(items)],
    );
  }
  return ids.filter((id) => !owned.includes(id));
}

// XP de treinador; cada nível novo dá Fichas
async function grantXp(userId, amount) {
  const r = await one('UPDATE users SET xp = xp + $2 WHERE id = $1 RETURNING xp', [userId, amount]);
  const levels = R.trainerLevel(r.xp) - R.trainerLevel(r.xp - amount);
  if (levels > 0) await q('UPDATE users SET fichas = fichas + $2 WHERE id = $1', [userId, levels * R.FICHAS.levelUp]);
  return levels;
}

// Ofertas do dia (geradas na primeira visita do dia e guardadas, para não mudarem ao comprar)
async function shopDay(userId, day) {
  const read = () => one('SELECT offers, bought FROM shop_days WHERE user_id = $1 AND day_key = $2', [userId, day]);
  let row = await read();
  if (!row) {
    const u = await one('SELECT arena FROM users WHERE id = $1', [userId]);
    const owned = (await q('SELECT card_id FROM collection WHERE user_id = $1', [userId])).map((r) => r.card_id);
    await q(
      'INSERT INTO shop_days (user_id, day_key, offers) VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING',
      [userId, day, JSON.stringify(R.generateShopOffers(owned, u.arena))],
    );
    row = await read();
  }
  return row;
}

// Quantas vezes a oferta foi comprada: no dia, ou na semana para as semanais
async function shopBoughtCount(userId, day, offer, row) {
  if (!offer.weekly) return Number(row.bought[offer.id] || 0);
  const [start, end] = R.shopWeekRange(day);
  const r = await one(
    `SELECT COALESCE(sum((bought->>$2)::int), 0)::int AS n FROM shop_days WHERE user_id = $1 AND day_key BETWEEN $3 AND $4`,
    [userId, offer.id, start, end],
  );
  return r.n;
}

async function describeShop(userId, day, row) {
  const offers = [];
  for (const o of row.offers) {
    const bought = await shopBoughtCount(userId, day, o, row);
    const today = Number(row.bought[o.id] || 0);
    offers.push({ ...o, bought, remaining: Math.max(0, o.limit - bought), price: R.shopPrice(o, today) });
  }
  return { day, nextRefresh: new Date(R.shopNextRefresh(day)).toISOString(), offers };
}

// ---------- Ações ----------

const ACTIONS = {
  async signup({ body, res }) {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    if (!EMAIL_RE.test(email) || email.length > 120) fail(400, 'E-mail inválido.');
    if (password.length < 6 || password.length > 72) fail(400, 'A senha precisa ter de 6 a 72 caracteres.');
    if (!R.TRAINER_NAME_RE.test(name)) fail(400, 'O nome de treinador precisa ter de 3 a 16 letras ou números.');
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) fail(409, 'Já existe uma conta com esse e-mail.');
    if (await nameTaken(name)) fail(409, NAME_TAKEN);
    let row;
    try {
      row = await one(
        'INSERT INTO users (email, name, pass_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id',
        [email, name, auth.hashPassword(password)],
      );
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, NAME_TAKEN); // alguém pegou o nome no mesmo instante
      throw err;
    }
    if (!row) fail(409, 'Já existe uma conta com esse e-mail.');
    await auth.createSession(res, row.id);
    return loadState(row.id);
  },

  async login({ body, res }) {
    const email = String(body.email || '').trim().toLowerCase();
    const row = await one('SELECT id, pass_hash FROM users WHERE email = $1', [email]);
    if (!row || !auth.verifyPassword(String(body.password || ''), row.pass_hash)) fail(401, 'E-mail ou senha incorretos.');
    await auth.createSession(res, row.id);
    return loadState(row.id);
  },

  async logout({ req, res }) {
    await auth.destroySession(req, res);
    return { ok: true };
  },

  async me({ req }) {
    const id = await auth.currentUserId(req);
    return id ? loadState(id) : { user: null };
  },

  async starter({ req, body }) {
    const userId = await requireUser(req);
    const starter = R.STARTERS[body.starter];
    if (!starter) fail(400, 'Inicial inválido.');
    const row = await one(
      'UPDATE users SET starter = $2, deck = $3::jsonb WHERE id = $1 AND starter IS NULL RETURNING id',
      [userId, body.starter, JSON.stringify(starter.deck)],
    );
    if (!row) fail(409, 'Você já escolheu seu inicial.');
    const rows = starter.deck.map((id) => ({ id, lvl: R.startLevel(R.CARDS[id]) }));
    await q(
      `INSERT INTO collection (user_id, card_id, level, copies)
       SELECT $1, x.id, x.lvl, 0 FROM jsonb_to_recordset($2::jsonb) AS x(id text, lvl int)
       ON CONFLICT DO NOTHING`,
      [userId, JSON.stringify(rows)],
    );
    return loadState(userId);
  },

  // Salva um deck num dos espaços e passa a usar ele
  async deck({ req, body }) {
    const userId = await requireUser(req);
    const deck = body.deck;
    if (!R.isValidDeck(deck)) fail(400, 'O deck precisa ter 8 cartas diferentes.');
    const owned = await q('SELECT card_id FROM collection WHERE user_id = $1 AND card_id = ANY($2)', [userId, deck]);
    if (owned.length !== R.DECK_SIZE) fail(400, 'Você só pode usar cartas da sua coleção.');
    const u = await one('SELECT deck, decks, deck_index FROM users WHERE id = $1', [userId]);
    const slot = body.slot === undefined ? u.deck_index : body.slot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= R.DECK_SLOTS) fail(400, 'Espaço de deck inválido.');
    const decks = decksOf(u);
    decks[slot] = deck;
    await q('UPDATE users SET deck = $2::jsonb, decks = $3::jsonb, deck_index = $4 WHERE id = $1',
      [userId, JSON.stringify(deck), JSON.stringify(decks), slot]);
    return loadState(userId);
  },

  // Troca o deck em uso por outro já salvo
  async 'deck-select'({ req, body }) {
    const userId = await requireUser(req);
    const slot = body.slot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= R.DECK_SLOTS) fail(400, 'Espaço de deck inválido.');
    const u = await one('SELECT deck, decks, deck_index FROM users WHERE id = $1', [userId]);
    const deck = decksOf(u)[slot];
    if (!deck) fail(400, 'Esse espaço ainda não tem deck salvo.');
    await q('UPDATE users SET deck = $2::jsonb, deck_index = $3 WHERE id = $1', [userId, JSON.stringify(deck), slot]);
    return loadState(userId);
  },

  async 'match-start'({ req, body }) {
    const userId = await requireUser(req);
    const mode = body.mode === 'online' ? 'online' : 'bot';
    const recent = await one(
      `SELECT count(*)::int AS n FROM matches WHERE user_id = $1 AND started_at > now() - interval '1 hour'`,
      [userId],
    );
    if (recent.n >= R.MATCHES_PER_HOUR) fail(429, 'Muitas partidas na última hora. Descanse um pouco!');
    const u = await one('SELECT arena, starter, deck FROM users WHERE id = $1', [userId]);
    if (!u.starter) fail(409, 'Escolha seu inicial primeiro.');
    const id = crypto.randomUUID();
    const bot = mode === 'bot' ? R.botProfile(u.arena) : null;
    // Histórico: deck usado e arena; contra o bot, o adversário já é conhecido
    const opponent = bot ? `Bot (${{ easy: 'fácil', normal: 'normal', hard: 'difícil' }[bot.difficulty]})` : null;
    await q('INSERT INTO matches (id, user_id, mode, deck, arena, opponent) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
      [id, userId, mode, JSON.stringify(u.deck), u.arena, opponent]);
    return { matchId: id, bot };
  },

  async 'match-finish'({ req, body }) {
    const userId = await requireUser(req);
    const result = ['win', 'loss', 'draw'].includes(body.result) ? body.result : null;
    if (!result) fail(400, 'Resultado inválido.');
    const match = await one(
      `UPDATE matches SET finished_at = now(), result = $3
       WHERE id = $1 AND user_id = $2 AND finished_at IS NULL
         AND ($3 = 'loss' OR started_at < now() - make_interval(secs => $4)) -- derrota vale sempre (sair cedo não escapa)
         AND started_at > now() - interval '20 minutes'
       RETURNING mode`,
      [String(body.matchId || ''), userId, result, R.MATCH_MIN_SECONDS],
    );
    if (!match) fail(409, 'Partida não registrada (muito curta, antiga ou já contada).');

    const u = await one('SELECT trophies, best_trophies, arena FROM users WHERE id = $1', [userId]);
    const floor = R.ARENAS[u.arena].trophies; // não cai abaixo do início da arena alcançada
    const trophies = Math.max(floor, u.trophies + R.TROPHIES[match.mode][result]);
    const delta = trophies - u.trophies;
    const arena = Math.max(u.arena, R.arenaForTrophies(trophies));
    await q(
      `UPDATE users SET trophies = $2, best_trophies = GREATEST(best_trophies, $2), arena = $3 WHERE id = $1`,
      [userId, trophies, arena],
    );
    // Histórico: coroas (minhas, do adversário) e, no online, o nome do amigo (vem do cliente, só texto curto)
    const crowns = Array.isArray(body.crowns) && body.crowns.length === 2
      && body.crowns.every((n) => Number.isInteger(n) && n >= 0 && n <= 3) ? body.crowns : null;
    const opponent = typeof body.opponent === 'string' ? body.opponent.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 16) : '';
    await q(
      `UPDATE matches SET trophies_delta = $2, crowns = $3::jsonb, opponent = COALESCE(opponent, NULLIF($4, '')) WHERE id = $1`,
      [body.matchId, delta, JSON.stringify(crowns), opponent],
    );

    // Fichas: arena nova, nível de treinador novo e primeira vitória do dia
    const levels = await grantXp(userId, result === 'win' ? 5 : 1);
    let firstWin = false;
    if (result === 'win') {
      const dayStart = new Date(R.shopNextRefresh(R.shopDayKey()) - 86400e3).toISOString();
      firstWin = !(await one(
        `SELECT 1 FROM matches WHERE user_id = $1 AND result = 'win' AND id <> $2 AND finished_at >= $3`,
        [userId, body.matchId, dayStart],
      ));
    }
    const fichas = (arena - u.arena) * R.FICHAS.arenaUp + (firstWin ? R.FICHAS.firstWin : 0);
    if (fichas) await q('UPDATE users SET fichas = fichas + $2 WHERE id = $1', [userId, fichas]);
    const fichasGained = fichas + levels * R.FICHAS.levelUp;

    let ball = null;
    let slotsFull = false;
    if (result === 'win') {
      const tier = R.rollBallTier();
      ball = await one(
        `INSERT INTO balls (user_id, tier, arena)
         SELECT $1, $2, $3 WHERE (SELECT count(*) FROM balls WHERE user_id = $1) < $4
         RETURNING id, tier`,
        [userId, tier, arena, R.BALL_SLOTS],
      );
      slotsFull = !ball;
    }
    return {
      delta, trophies, arena, arenaUp: arena > u.arena, ball, slotsFull,
      fichas: fichasGained, firstWin, levelUp: levels > 0, state: await loadState(userId),
    };
  },

  // Últimas 20 partidas que valeram troféus
  async history({ req }) {
    const userId = await requireUser(req);
    const rows = await q(
      `SELECT mode, result, trophies_delta, crowns, opponent, deck, arena, finished_at FROM matches
       WHERE user_id = $1 AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 20`,
      [userId],
    );
    return {
      matches: rows.map((m) => ({
        mode: m.mode, result: m.result, trophies: m.trophies_delta, crowns: m.crowns,
        opponent: m.opponent, deck: m.deck, arena: m.arena, at: new Date(m.finished_at).toISOString(),
      })),
    };
  },

  async 'ball-unlock'({ req, body }) {
    const userId = await requireUser(req);
    const b = await one('SELECT tier FROM balls WHERE id = $1 AND user_id = $2', [body.id, userId]);
    if (!b) fail(404, 'Ball não encontrada.');
    const row = await one(
      `UPDATE balls SET unlock_at = now() + make_interval(secs => $3)
       WHERE id = $1 AND user_id = $2 AND unlock_at IS NULL
       RETURNING id`, // várias balls podem abrir ao mesmo tempo, cada uma com seu cronômetro
      [body.id, userId, R.BALLS[b.tier].seconds],
    );
    if (!row) fail(409, 'Essa ball já está abrindo.');
    return loadState(userId);
  },

  async 'ball-open'({ req, body }) {
    const userId = await requireUser(req);
    const b = await one(
      'DELETE FROM balls WHERE id = $1 AND user_id = $2 AND unlock_at IS NOT NULL AND unlock_at <= now() RETURNING tier, arena',
      [body.id, userId],
    );
    if (!b) fail(409, 'Essa ball ainda não está pronta.');
    const contents = R.rollBallContents(b.tier, b.arena);
    const newCards = await applyRewards(userId, contents);
    return { tier: b.tier, contents, newCards, state: await loadState(userId) };
  },

  // Abre o presente de versão (uma vez por conta: o UPDATE só passa se ainda não recebeu)
  async gift({ req, body }) {
    const userId = await requireUser(req);
    const gift = R.GIFTS[body.id];
    if (!gift) fail(404, 'Presente não encontrado.');
    const row = await one(
      `UPDATE users SET gifts = gifts || $2::jsonb
       WHERE id = $1 AND starter IS NOT NULL AND NOT (gifts ? $3) RETURNING id`,
      [userId, JSON.stringify([body.id]), body.id],
    );
    if (!row) fail(409, 'Você já recebeu esse presente.');
    const contents = gift.roll();
    const newCards = await applyRewards(userId, contents);
    return { gift: body.id, title: gift.title, text: gift.text, contents, newCards, state: await loadState(userId) };
  },

  async 'free-ball'({ req }) {
    const userId = await requireUser(req);
    const u = await one('SELECT free_ball_at, arena, starter, now() AS server_now FROM users WHERE id = $1', [userId]);
    if (!u.starter) fail(409, 'Escolha seu inicial primeiro.');
    const info = freeBallInfo(u.free_ball_at, u.server_now);
    if (!info.available) fail(409, 'A Poké Ball grátis ainda não está disponível.', { nextAt: info.nextAt });
    // Fichas: com 2 acumuladas, sobra exatamente 1 depois de abrir
    const now = new Date(u.server_now).getTime();
    const base = info.available >= R.FREE_BALL_MAX ? now - R.FREE_BALL_SECONDS * 1000 : new Date(u.free_ball_at).getTime();
    const next = new Date(base + R.FREE_BALL_SECONDS * 1000).toISOString();
    const row = await one(
      'UPDATE users SET free_ball_at = $3 WHERE id = $1 AND free_ball_at = $2 RETURNING id',
      [userId, u.free_ball_at, next],
    );
    if (!row) fail(409, 'Tente de novo.');
    const contents = R.rollBallContents('poke', u.arena);
    const newCards = await applyRewards(userId, contents);
    return { tier: 'poke', contents, newCards, state: await loadState(userId) };
  },

  async upgrade({ req, body }) {
    const userId = await requireUser(req);
    const card = R.CARDS[body.card];
    if (!card) fail(400, 'Carta inválida.');
    const c = await one('SELECT level, copies FROM collection WHERE user_id = $1 AND card_id = $2', [userId, card.id]);
    if (!c) fail(400, 'Você ainda não tem essa carta.');
    const cost = R.upgradeCost(card, c.level);
    if (!cost) fail(400, 'Essa carta já está no nível máximo.');
    if (c.copies < cost.copies) fail(409, `Faltam ${cost.copies - c.copies} cópias.`);
    // Tudo numa instrução só: só melhora se ainda houver cópias e Pokédólares
    const row = await one(
      `WITH c AS (
         UPDATE collection SET level = level + 1, copies = copies - $3
         WHERE user_id = $1 AND card_id = $2 AND level = $4 AND copies >= $3
           AND (SELECT gold FROM users WHERE id = $1) >= $5
         RETURNING level
       ), u AS (
         UPDATE users SET gold = gold - $5 WHERE id = $1 AND EXISTS (SELECT 1 FROM c) RETURNING gold
       )
       SELECT c.level, u.gold FROM c, u`,
      [userId, card.id, cost.copies, c.level, cost.gold],
    );
    if (!row) fail(409, 'Pokédólares insuficientes.');
    await grantXp(userId, cost.xp);
    return { level: row.level, state: await loadState(userId) };
  },

  // Ranking global: os 100 com mais troféus (desempate: recorde, depois quem chegou antes) e a sua posição
  async ranking({ req }) {
    const userId = await requireUser(req);
    const rows = await q(
      `SELECT id, name, trophies, best_trophies, xp, arena, starter, look FROM users
       WHERE starter IS NOT NULL
       ORDER BY trophies DESC, best_trophies DESC, id ASC
       LIMIT 100`,
    );
    const u = await one('SELECT trophies, best_trophies FROM users WHERE id = $1', [userId]);
    const pos = await one(
      `SELECT count(*)::int + 1 AS rank FROM users
       WHERE starter IS NOT NULL
         AND (trophies > $2 OR (trophies = $2 AND (best_trophies > $3 OR (best_trophies = $3 AND id < $1))))`,
      [userId, u.trophies, u.best_trophies],
    );
    const total = await one('SELECT count(*)::int AS n FROM users WHERE starter IS NOT NULL');
    return {
      top: rows.map((r, i) => ({
        rank: i + 1, name: r.name, trophies: r.trophies, level: R.trainerLevel(r.xp),
        arena: r.arena, starter: r.starter, me: r.id === userId,
        avatar: lookOf(r).avatar, title: lookOf(r).title,
      })),
      me: { rank: pos.rank, trophies: u.trophies },
      total: total.n,
    };
  },

  async 'settings-name'({ req, body }) {
    const userId = await requireUser(req);
    const name = String(body.name || '').trim();
    if (!R.TRAINER_NAME_RE.test(name)) fail(400, 'O nome de treinador precisa ter de 3 a 16 letras ou números.');
    if (await nameTaken(name, userId)) fail(409, NAME_TAKEN);
    try {
      await q('UPDATE users SET name = $2 WHERE id = $1', [userId, name]);
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, NAME_TAKEN);
      throw err;
    }
    return loadState(userId);
  },

  async 'settings-password'({ req, body }) {
    const userId = await requireUser(req);
    const password = String(body.password || '');
    const row = await one('SELECT pass_hash FROM users WHERE id = $1', [userId]);
    if (!auth.verifyPassword(String(body.current || ''), row.pass_hash)) fail(401, 'A senha atual está incorreta.');
    if (password.length < 6 || password.length > 72) fail(400, 'A nova senha precisa ter de 6 a 72 caracteres.');
    await q('UPDATE users SET pass_hash = $2 WHERE id = $1', [userId, auth.hashPassword(password)]);
    await auth.destroyOtherSessions(req, userId);
    return { ok: true };
  },

  async shop({ req }) {
    const userId = await requireUser(req);
    const u = await one('SELECT starter FROM users WHERE id = $1', [userId]);
    if (!u.starter) fail(409, 'Escolha seu inicial primeiro.');
    const day = R.shopDayKey();
    return describeShop(userId, day, await shopDay(userId, day));
  },

  async 'shop-buy'({ req, body }) {
    const userId = await requireUser(req);
    const u = await one('SELECT starter, arena FROM users WHERE id = $1', [userId]);
    if (!u.starter) fail(409, 'Escolha seu inicial primeiro.');
    const day = R.shopDayKey();
    const row = await shopDay(userId, day);
    const offer = row.offers.find((o) => o.id === body.offer);
    if (!offer) fail(404, 'Essa oferta não está mais na loja. Ela troca à meia-noite.');
    if ((await shopBoughtCount(userId, day, offer, row)) >= offer.limit) {
      fail(409, offer.weekly ? 'Esgotado nesta semana.' : 'Esgotado hoje. Volte amanhã!');
    }
    const today = Number(row.bought[offer.id] || 0);
    const price = R.shopPrice(offer, today);
    // Uma instrução só: marca a compra e desconta, só se ainda tiver saldo e a compra não mudou no meio
    const paid = await one(
      `WITH s AS (
         UPDATE shop_days SET bought = jsonb_set(bought, ARRAY[$3::text], to_jsonb($4::int + 1))
         WHERE user_id = $1 AND day_key = $2 AND COALESCE((bought->>$3)::int, 0) = $4
           AND (SELECT gold FROM users WHERE id = $1) >= $5
           AND (SELECT fichas FROM users WHERE id = $1) >= $6
         RETURNING 1
       ), u AS (
         UPDATE users SET gold = gold - $5, fichas = fichas - $6 WHERE id = $1 AND EXISTS (SELECT 1 FROM s) RETURNING gold
       )
       SELECT gold FROM u`,
      [userId, day, offer.id, today, price.gold, price.fichas],
    );
    if (!paid) fail(409, price.fichas ? 'Fichas insuficientes.' : 'Pokédólares insuficientes.');

    let result;
    if (offer.kind === 'card') {
      const newCards = await applyRewards(userId, { cards: { [offer.card]: offer.amount }, gold: 0, items: {} });
      result = { kind: 'card', card: offer.card, amount: offer.amount, newCards };
    } else if (offer.kind === 'ball') {
      const contents = R.rollBallContents(offer.tier, u.arena);
      const newCards = await applyRewards(userId, contents);
      result = { kind: 'ball', tier: offer.tier, contents, newCards };
    } else {
      await applyRewards(userId, { cards: {}, gold: 0, items: { [offer.item]: 1 } });
      result = { kind: 'item', item: offer.item };
    }
    const fresh = await shopDay(userId, day);
    return { ...result, shop: await describeShop(userId, day, fresh), state: await loadState(userId) };
  },

  async 'cosmetic-buy'({ req, body }) {
    const userId = await requireUser(req);
    const id = String(body.id || '');
    const c = R.COSMETICS[id];
    if (!c || c.free || c.arena !== undefined) fail(400, 'Esse item não está à venda.');
    const price = c.fichas || 0;
    const row = await one(
      `WITH ins AS (
         INSERT INTO user_cosmetics (user_id, cosmetic)
         SELECT $1, $2 WHERE (SELECT fichas FROM users WHERE id = $1) >= $3
         ON CONFLICT DO NOTHING RETURNING 1
       ), u AS (
         UPDATE users SET fichas = fichas - $3 WHERE id = $1 AND EXISTS (SELECT 1 FROM ins) RETURNING fichas
       )
       SELECT fichas FROM u`,
      [userId, id, price],
    );
    if (!row) {
      const has = await one('SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND cosmetic = $2', [userId, id]);
      fail(409, has ? 'Você já tem esse item.' : 'Fichas insuficientes.');
    }
    return { ok: true, state: await loadState(userId) };
  },

  // Equipa avatar (Pokémon da coleção), título, skin de ginásio ou pacote de emotes
  async look({ req, body }) {
    const userId = await requireUser(req);
    const u = await one('SELECT arena, starter, look FROM users WHERE id = $1', [userId]);
    const owned = (await q('SELECT cosmetic FROM user_cosmetics WHERE user_id = $1', [userId])).map((r) => r.cosmetic);
    const next = { ...(u.look || {}) };
    if (body.avatar !== undefined) {
      const ok = await one('SELECT 1 FROM collection WHERE user_id = $1 AND card_id = $2', [userId, String(body.avatar)]);
      if (!ok || !R.CARDS[body.avatar] || R.CARDS[body.avatar].kind !== 'unit') fail(400, 'Escolha um Pokémon da sua coleção.');
      next.avatar = body.avatar;
    }
    for (const kind of ['title', 'skin', 'emotes']) {
      if (body[kind] === undefined) continue;
      const id = String(body[kind]);
      if (!R.COSMETICS[id] || R.COSMETICS[id].kind !== kind || !R.hasCosmetic(id, u.arena, owned)) fail(400, 'Você ainda não tem esse item.');
      next[kind] = id;
    }
    await q('UPDATE users SET look = $2::jsonb WHERE id = $1', [userId, JSON.stringify(next)]);
    return loadState(userId);
  },

  async safari({ req }) {
    const userId = await requireUser(req);
    const row = await one('SELECT state FROM safari_runs WHERE user_id = $1 AND day_key = $2', [userId, R.shopDayKey()]);
    return { entryGold: R.SAFARI.entryGold, run: row ? row.state : null, nextRefresh: new Date(R.shopNextRefresh(R.shopDayKey())).toISOString() };
  },

  async 'safari-start'({ req }) {
    const userId = await requireUser(req);
    const u = await one('SELECT arena, starter FROM users WHERE id = $1', [userId]);
    if (!u.starter) fail(409, 'Escolha seu inicial primeiro.');
    const day = R.shopDayKey();
    // Uma instrução só: cobra a entrada e cria a partida do dia, só se ainda não entrou hoje e tem saldo
    const row = await one(
      `WITH u AS (
         UPDATE users SET gold = gold - $3
         WHERE id = $1 AND gold >= $3 AND NOT EXISTS (SELECT 1 FROM safari_runs WHERE user_id = $1 AND day_key = $2)
         RETURNING id
       )
       INSERT INTO safari_runs (user_id, day_key, state) SELECT $1, $2, $4::jsonb FROM u RETURNING state`,
      [userId, day, R.SAFARI.entryGold, JSON.stringify(R.newSafariRun(u.arena))],
    );
    if (!row) {
      const used = await one('SELECT 1 FROM safari_runs WHERE user_id = $1 AND day_key = $2', [userId, day]);
      fail(409, used ? 'Você já entrou na Zona Safári hoje. Volte amanhã!' : 'Pokédólares insuficientes.');
    }
    return { run: row.state, state: await loadState(userId) };
  },

  async 'safari-act'({ req, body }) {
    const userId = await requireUser(req);
    const day = R.shopDayKey();
    const u = await one('SELECT arena FROM users WHERE id = $1', [userId]);
    const row = await one('SELECT state FROM safari_runs WHERE user_id = $1 AND day_key = $2', [userId, day]);
    if (!row) fail(409, 'Compre a entrada da Zona Safári primeiro.');
    if (row.state.done) fail(409, 'A Zona Safári de hoje já acabou.');
    const step = R.safariStep(row.state, String(body.action || ''), u.arena);
    if (step.invalid) fail(400, 'Ação inválida.');
    // Grava só se ninguém mexeu no estado no meio (evita contar a mesma jogada duas vezes)
    const saved = await one(
      'UPDATE safari_runs SET state = $3::jsonb WHERE user_id = $1 AND day_key = $2 AND state = $4::jsonb RETURNING 1',
      [userId, day, JSON.stringify(step.state), JSON.stringify(row.state)],
    );
    if (!saved) fail(409, 'Tente de novo.');
    let newCards = [];
    if (step.caught) newCards = await applyRewards(userId, { cards: { [step.caught.card]: step.caught.copies }, gold: 0, items: {} });
    return { run: step.state, caught: step.caught, newCards, state: await loadState(userId) };
  },

  async 'use-item'({ req, body }) {
    const userId = await requireUser(req);
    const card = R.CARDS[body.card];
    const item = R.ITEMS[body.item] && body.item;
    if (!card || !item) fail(400, 'Item ou carta inválidos.');
    if (!R.itemFitsCard(item, card)) fail(400, 'Esse item não serve para essa carta.');
    const c = await one('SELECT level FROM collection WHERE user_id = $1 AND card_id = $2', [userId, card.id]);
    if (!c) fail(400, 'Você ainda não tem essa carta.');
    const candy = item === 'rarecandy';
    if (candy && c.level >= R.MAX_CARD_LEVEL) fail(400, 'Essa carta já está no nível máximo.');
    const row = await one(
      `WITH it AS (
         UPDATE user_items SET qty = qty - 1 WHERE user_id = $1 AND item = $3 AND qty > 0 RETURNING qty
       )
       UPDATE collection SET copies = copies + $4, level = level + $5
       WHERE user_id = $1 AND card_id = $2 AND EXISTS (SELECT 1 FROM it)
       RETURNING level, copies`,
      [userId, card.id, item, candy ? 0 : 1, candy ? 1 : 0],
    );
    if (!row) fail(409, 'Você não tem esse item.');
    if (candy) await grantXp(userId, R.upgradeCost(card, c.level).xp);
    return { level: row.level, copies: row.copies, state: await loadState(userId) };
  },
};

// ---------- HTTP ----------

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  const action = (req.query && req.query.action) || '';
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) return send(res, 404, { error: 'Ação desconhecida.' });
  try {
    if (action !== 'me') {
      if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
      // Exigir JSON impede formulários de outros sites de disparar ações (CSRF)
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        return send(res, 415, { error: 'Envie JSON.' });
      }
    }
    let body;
    try {
      body = action === 'me' ? {} : await readBody(req);
    } catch {
      return send(res, 400, { error: 'JSON inválido.' });
    }
    const result = await fn({ req, res, body: body || {} });
    return send(res, 200, result);
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message, ...(err.extra || {}) });
    console.error(err);
    return send(res, 500, { error: 'Erro no servidor. Tente de novo.' });
  }
};
